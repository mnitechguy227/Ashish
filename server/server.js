const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const NodeCache = require('node-cache');
const { initSchema, run, get, all } = require('./db');
const { normalizeText, normalizeIssn, similarityScore } = require('./utils/normalize');

const PORT = process.env.PORT || 3001;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me-admin-token';
const upload = multer({ dest: path.join(__dirname, 'uploads') });
const searchCache = new NodeCache({ stdTTL: 120 });

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'client')));

const SOURCE_CONFIG = {
  abdc: {
    table: 'abdc_entries',
    required: ['source_title', 'abdc_rank'],
    optional: ['issn', 'eissn', 'publisher', 'field_code', 'source_version', 'source_file_name', 'source_url', 'verified_date'],
  },
  abs: {
    table: 'abs_entries',
    required: ['source_title', 'abs_rating'],
    optional: ['issn', 'eissn', 'publisher', 'subject_group', 'source_version', 'source_file_name', 'source_url', 'verified_date'],
  },
  scopus: {
    table: 'scopus_entries',
    required: ['source_title', 'scopus_status'],
    optional: ['issn', 'eissn', 'publisher', 'active_or_discontinued', 'coverage_note', 'citescore_optional', 'sjr_optional', 'snip_optional', 'source_version', 'source_file_name', 'source_url', 'verified_date'],
  },
};

const MISSING_SENTENCE = 'Not found in uploaded verified source data.';

function adminOnly(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(401).json({ message: 'Unauthorized admin request.' });
  }
  return next();
}

async function hydrateJournal(journal) {
  const [abdc, abs, scopus] = await Promise.all([
    get('SELECT * FROM abdc_entries WHERE journal_master_id = ? ORDER BY id DESC LIMIT 1', [journal.id]),
    get('SELECT * FROM abs_entries WHERE journal_master_id = ? ORDER BY id DESC LIMIT 1', [journal.id]),
    get('SELECT * FROM scopus_entries WHERE journal_master_id = ? ORDER BY id DESC LIMIT 1', [journal.id]),
  ]);

  return {
    ...journal,
    abdc_rank: abdc?.abdc_rank || null,
    abs_rating: abs?.abs_rating || null,
    scopus_status: scopus?.scopus_status || null,
    active_or_discontinued: scopus?.active_or_discontinued || null,
    source_last_updated: {
      abdc: abdc?.verified_date || null,
      abs: abs?.verified_date || null,
      scopus: scopus?.verified_date || null,
    },
    source_links: {
      abdc: abdc?.source_url || null,
      abs: abs?.source_url || null,
      scopus: scopus?.source_url || null,
    },
  };
}

function computeConfidence(journal, q) {
  // Confidence is strictly rule-based to keep results auditable.
  const query = normalizeText(q);
  const issnQuery = normalizeIssn(q);
  if (!query && !issnQuery) return { label: 'Exact match', score: 1 };

  if (journal.issn && normalizeIssn(journal.issn) === issnQuery) return { label: 'Exact match', score: 1 };
  if (journal.eissn && normalizeIssn(journal.eissn) === issnQuery) return { label: 'Exact match', score: 0.99 };
  if (normalizeText(journal.canonical_title) === query) return { label: 'Exact match', score: 0.98 };

  const score = Math.max(
    similarityScore(journal.canonical_title, query),
    similarityScore(journal.alt_titles || '', query),
    similarityScore(journal.publisher || '', query),
    similarityScore(journal.subject_area || '', query)
  );

  if (score >= 0.82) return { label: 'Strong probable match', score };
  return { label: 'Uncertain match', score };
}

function queryIssnCandidates(q = '') {
  return String(q)
    .split(/[\s,;|]+/)
    .map((token) => normalizeIssn(token))
    .filter(Boolean);
}

function matchesJournal(journal, q) {
  if (!q) return true;
  const query = normalizeText(q);
  const issnQuery = normalizeIssn(q);
  const issnCandidates = queryIssnCandidates(q);
  const fields = [journal.canonical_title, journal.alt_titles, journal.publisher, journal.subject_area]
    .map((item) => normalizeText(item || ''));
  const journalIssn = normalizeIssn(journal.issn || '');
  const journalEIssn = normalizeIssn(journal.eissn || '');
  return (
    fields.some((field) => field.includes(query)) ||
    journalIssn === issnQuery ||
    journalEIssn === issnQuery ||
    issnCandidates.includes(journalIssn) ||
    issnCandidates.includes(journalEIssn) ||
    similarityScore(journal.canonical_title, query) >= 0.72
  );
}

function applyFilters(rows, filters) {
  return rows.filter((row) => {
    if (filters.abdc_rank && row.abdc_rank !== filters.abdc_rank) return false;
    if (filters.abs_rating && row.abs_rating !== filters.abs_rating) return false;
    if (filters.scopus_status && (row.scopus_status || 'Not indexed') !== filters.scopus_status) return false;
    if (filters.active_or_discontinued && (row.active_or_discontinued || 'Not indexed') !== filters.active_or_discontinued) return false;
    if (filters.subject_area && !normalizeText(row.subject_area || '').includes(normalizeText(filters.subject_area))) return false;
    if (filters.publisher && !normalizeText(row.publisher || '').includes(normalizeText(filters.publisher))) return false;
    if (filters.exact_only === 'true' && row.match_confidence !== 'Exact match') return false;
    if (filters.show_similar === 'false' && row.match_confidence === 'Uncertain match') return false;
    return true;
  });
}

function sortRows(rows, sortBy) {
  const rankScore = { 'A*': 4, A: 3, B: 2, C: 1 };
  return rows.sort((a, b) => {
    // Always keep exact matches above fuzzy/probable matches.
    if ((a.match_confidence === 'Exact match') !== (b.match_confidence === 'Exact match')) {
      return a.match_confidence === 'Exact match' ? -1 : 1;
    }
    if (sortBy === 'title') return (a.canonical_title || '').localeCompare(b.canonical_title || '');
    if (sortBy === 'abdc_rank') return (rankScore[b.abdc_rank] || -1) - (rankScore[a.abdc_rank] || -1);
    if (sortBy === 'abs_rating') return Number(b.abs_rating || 0) - Number(a.abs_rating || 0);
    if (sortBy === 'publisher') return (a.publisher || '').localeCompare(b.publisher || '');
    return (b.match_score || 0) - (a.match_score || 0);
  });
}

function suggestionForQuery(rows, q) {
  if (!q || !rows.length) return null;
  const normalized = normalizeText(q);
  const exactByTitle = rows.find((row) => normalizeText(row.canonical_title) === normalized);
  if (exactByTitle) return null;

  const fuzzyCandidate = rows
    .map((row) => ({
      title: row.canonical_title,
      score: similarityScore(row.canonical_title, q),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (fuzzyCandidate && fuzzyCandidate.score >= 0.76) {
    return {
      text: `Did you mean "${fuzzyCandidate.title}"?`,
      suggestion: fuzzyCandidate.title,
      score: Number(fuzzyCandidate.score.toFixed(3)),
    };
  }
  return null;
}

async function resolveOrCreateJournal({ sourceTitle, issn, eissn, publisher, subjectArea }) {
  const normalizedTitle = normalizeText(sourceTitle);
  const existing = await get(
    `SELECT * FROM journals_master
      WHERE (issn IS NOT NULL AND issn = ?)
         OR (eissn IS NOT NULL AND eissn = ?)
         OR normalized_title = ?
      LIMIT 1`,
    [issn || null, eissn || null, normalizedTitle]
  );

  const now = new Date().toISOString();
  if (existing) {
    await run(
      `UPDATE journals_master
         SET publisher = COALESCE(?, publisher),
             subject_area = COALESCE(?, subject_area),
             alt_titles = COALESCE(alt_titles, ''),
             updated_at = ?
       WHERE id = ?`,
      [publisher || null, subjectArea || null, now, existing.id]
    );
    return existing.id;
  }

  const created = await run(
    `INSERT INTO journals_master
      (canonical_title, normalized_title, alt_titles, issn, eissn, publisher, subject_area, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sourceTitle, normalizedTitle, null, issn || null, eissn || null, publisher || null, subjectArea || null, now, now]
  );

  return created.lastID;
}

function parseFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  const firstSheet = workbook.SheetNames[0];
  return xlsx.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
}

function normalizeHeaderKey(key) {
  return normalizeText(key).replace(/\s+/g, '_');
}

function autoMapColumns(row) {
  const keys = Object.keys(row);
  const mapped = {};
  keys.forEach((key) => {
    mapped[normalizeHeaderKey(key)] = key;
  });
  return mapped;
}

function extractValue(row, map, preferredKeys) {
  for (const key of preferredKeys) {
    const sourceKey = map[key];
    if (sourceKey && row[sourceKey] !== undefined && String(row[sourceKey]).trim() !== '') {
      return String(row[sourceKey]).trim();
    }
  }
  return null;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Journal Index Checker API' });
});

app.get('/api/search', async (req, res) => {
  const cacheKey = JSON.stringify(req.query);
  const cached = searchCache.get(cacheKey);
  if (cached) return res.json(cached);

  const rows = await all('SELECT * FROM journals_master');
  const hydrated = await Promise.all(rows.map(async (row) => {
    const enriched = await hydrateJournal(row);
    const confidence = computeConfidence(enriched, req.query.q || '');
    return {
      ...enriched,
      match_confidence: confidence.label,
      match_score: confidence.score,
    };
  }));

  const searched = hydrated.filter((row) => matchesJournal(row, req.query.q || ''));
  const filtered = applyFilters(searched, req.query);
  const sorted = sortRows(filtered, req.query.sort_by || 'relevance');

  const didYouMean = suggestionForQuery(hydrated, req.query.q || '');

  const payload = {
    query: req.query.q || '',
    did_you_mean: didYouMean,
    total: sorted.length,
    results: sorted.map((item) => ({
      ...item,
      abdc_rank: item.abdc_rank || MISSING_SENTENCE,
      abs_rating: item.abs_rating || MISSING_SENTENCE,
      scopus_status: item.scopus_status || MISSING_SENTENCE,
      active_or_discontinued: item.active_or_discontinued || MISSING_SENTENCE,
    })),
  };

  searchCache.set(cacheKey, payload);
  res.json(payload);
});

app.get('/api/journals/:id', async (req, res) => {
  const journal = await get('SELECT * FROM journals_master WHERE id = ?', [req.params.id]);
  if (!journal) return res.status(404).json({ message: 'Journal not found.' });

  const [abdcEntries, absEntries, scopusEntries] = await Promise.all([
    all('SELECT * FROM abdc_entries WHERE journal_master_id = ? ORDER BY id DESC', [journal.id]),
    all('SELECT * FROM abs_entries WHERE journal_master_id = ? ORDER BY id DESC', [journal.id]),
    all('SELECT * FROM scopus_entries WHERE journal_master_id = ? ORDER BY id DESC', [journal.id]),
  ]);

  const payload = {
    ...journal,
    disclaimer: 'Guidance only. Always verify using official source sites before submission decisions.',
    data_warning: (!abdcEntries.length || !absEntries.length || !scopusEntries.length)
      ? 'Incomplete record: one or more source datasets are missing for this journal.'
      : null,
    match_note: req.query.match_note || 'Exact and probable matching is based on ISSN/eISSN/title logic.',
    sources: {
      abdc: abdcEntries.length ? abdcEntries : [{ note: 'Not available in verified source data.' }],
      abs: absEntries.length ? absEntries : [{ note: 'Not available in verified source data.' }],
      scopus: scopusEntries.length ? scopusEntries : [{ note: 'Not available in verified source data.' }],
    },
  };

  res.json(payload);
});

app.get('/api/compare', async (req, res) => {
  const ids = (req.query.ids || '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id))
    .slice(0, 4);

  if (ids.length < 2) {
    return res.status(400).json({ message: 'Provide between 2 and 4 journal IDs.' });
  }

  const journals = [];
  for (const id of ids) {
    const journal = await get('SELECT * FROM journals_master WHERE id = ?', [id]);
    if (journal) journals.push(await hydrateJournal(journal));
  }

  res.json({ journals });
});

app.post('/api/assistant/query', async (req, res) => {
  const text = normalizeText(req.body.query || '');
  if (!text) return res.status(400).json({ message: 'Query is required.' });

  const filters = {};
  const rankMatch = text.match(/abdc\s+(a\*|a|b|c)/i);
  if (rankMatch) filters.abdc_rank = rankMatch[1].toUpperCase();
  const absMatch = text.match(/abs\s+(\d)/i);
  if (absMatch) filters.abs_rating = absMatch[1];
  if (text.includes('scopus')) filters.scopus_status = 'Indexed';

  const rows = await all('SELECT * FROM journals_master');
  const hydrated = await Promise.all(rows.map(hydrateJournal));
  const result = applyFilters(
    hydrated.map((row) => ({ ...row, scopus_status: row.scopus_status || 'Not indexed' })),
    filters
  ).slice(0, 20);

  if (!result.length) {
    return res.json({
      answer: 'Not available in uploaded verified source data.',
      filters,
      results: [],
    });
  }

  return res.json({
    answer: `Found ${result.length} journal(s) based on uploaded verified source data.`,
    filters,
    results: result,
  });
});

app.get('/api/admin/import-logs', adminOnly, async (_req, res) => {
  const logs = await all('SELECT * FROM import_logs ORDER BY id DESC LIMIT 100');
  res.json({ logs });
});

app.get('/api/admin/review-queue', adminOnly, async (_req, res) => {
  const queue = await all('SELECT * FROM review_queue ORDER BY id DESC LIMIT 100');
  res.json({ queue });
});

app.get('/api/admin/import-error-report', adminOnly, async (_req, res) => {
  const queue = await all(
    `SELECT source_name, record_reference, issue_type, issue_note, status
     FROM review_queue
     ORDER BY id DESC`
  );
  const csvRows = [
    'source_name,record_reference,issue_type,issue_note,status',
    ...queue.map((row) => [
      row.source_name,
      row.record_reference,
      row.issue_type,
      `"${String(row.issue_note || '').replaceAll('"', '""')}"`,
      row.status,
    ].join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=\"import_error_report.csv\"');
  res.send(csvRows.join('\n'));
});

app.post('/api/admin/upload/preview', adminOnly, upload.single('file'), async (req, res) => {
  try {
    const source = normalizeText(req.body.source || '');
    if (!SOURCE_CONFIG[source]) return res.status(400).json({ message: 'Unsupported source.' });

    const rows = parseFile(req.file.path);
    const mappedHeaders = rows[0] ? autoMapColumns(rows[0]) : {};

    const rejections = [];
    const previews = rows.slice(0, 20);
    const duplicates = [];
    const seen = new Set();

    rows.forEach((row, idx) => {
      const title = extractValue(row, mappedHeaders, ['source_title', 'journal_title', 'title']);
      const issn = normalizeIssn(extractValue(row, mappedHeaders, ['issn']) || '');
      const eissn = normalizeIssn(extractValue(row, mappedHeaders, ['eissn', 'e_issn']) || '');
      const rowKey = `${title}|${issn}|${eissn}`;

      if (!title) {
        rejections.push({ row: idx + 1, reason: 'Missing title' });
      }
      if (seen.has(rowKey)) {
        duplicates.push({ row: idx + 1, rowKey });
      }
      seen.add(rowKey);
    });

    const stageId = `stage_${Date.now()}`;
    const stagePath = path.join(__dirname, 'tmp', `${stageId}.json`);
    fs.writeFileSync(stagePath, JSON.stringify({ source, rows, mappedHeaders, rejections, duplicates, fileName: req.file.originalname }));

    fs.unlinkSync(req.file.path);

    res.json({
      stage_id: stageId,
      source,
      file_name: req.file.originalname,
      total_rows: rows.length,
      preview_rows: previews,
      mapped_headers: mappedHeaders,
      required_columns: SOURCE_CONFIG[source].required,
      duplicate_count: duplicates.length,
      rejected_count: rejections.length,
      validation_status: rejections.length ? 'needs-review' : 'ready',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/admin/upload/approve', adminOnly, async (req, res) => {
  const stageId = req.body.stage_id;
  const stagedPath = path.join(__dirname, 'tmp', `${stageId}.json`);
  if (!fs.existsSync(stagedPath)) return res.status(404).json({ message: 'Stage not found.' });

  const staged = JSON.parse(fs.readFileSync(stagedPath, 'utf8'));
  const config = SOURCE_CONFIG[staged.source];
  const mapping = req.body.column_map || staged.mappedHeaders;
  let processedRows = 0;
  let rejectedRows = 0;

  const log = await run(
    `INSERT INTO import_logs (source_name, file_name, uploaded_by, uploaded_at, processed_rows, rejected_rows, status, notes)
     VALUES (?, ?, ?, ?, 0, 0, 'processing', ?)` ,
    [staged.source, staged.fileName, req.body.uploaded_by || 'admin', new Date().toISOString(), 'Import started from admin panel']
  );

  // Row-by-row processing keeps each rejected record traceable in review_queue.
  for (const [index, row] of staged.rows.entries()) {
    const sourceTitle = extractValue(row, mapping, ['source_title', 'journal_title', 'title']);
    if (!sourceTitle) {
      rejectedRows += 1;
      await run(
        `INSERT INTO review_queue (source_name, record_reference, issue_type, issue_note, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [staged.source, `row-${index + 1}`, 'missing_title', 'Title missing in imported row']
      );
      continue;
    }

    const issn = normalizeIssn(extractValue(row, mapping, ['issn']) || '');
    const eissn = normalizeIssn(extractValue(row, mapping, ['eissn', 'e_issn']) || '');
    const publisher = extractValue(row, mapping, ['publisher']);
    const subjectArea = extractValue(row, mapping, ['subject_area', 'subject_group']);
    const journalId = await resolveOrCreateJournal({ sourceTitle, issn, eissn, publisher, subjectArea });

    if (staged.source === 'abdc') {
      await run(
        `INSERT INTO abdc_entries
         (journal_master_id, source_title, issn, eissn, publisher, field_code, abdc_rank, source_version, source_file_name, source_url, verified_date, import_log_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          journalId,
          sourceTitle,
          issn || null,
          eissn || null,
          publisher || null,
          extractValue(row, mapping, ['field_code', 'field']) || null,
          extractValue(row, mapping, ['abdc_rank', 'rank']) || null,
          extractValue(row, mapping, ['source_version']) || 'unknown',
          staged.fileName,
          extractValue(row, mapping, ['source_url']) || null,
          extractValue(row, mapping, ['verified_date']) || null,
          log.lastID,
        ]
      );
    }

    if (staged.source === 'abs') {
      await run(
        `INSERT INTO abs_entries
         (journal_master_id, source_title, issn, eissn, publisher, abs_rating, subject_group, source_version, source_file_name, source_url, verified_date, import_log_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          journalId,
          sourceTitle,
          issn || null,
          eissn || null,
          publisher || null,
          extractValue(row, mapping, ['abs_rating', 'rating']) || null,
          extractValue(row, mapping, ['subject_group']) || null,
          extractValue(row, mapping, ['source_version']) || 'unknown',
          staged.fileName,
          extractValue(row, mapping, ['source_url']) || null,
          extractValue(row, mapping, ['verified_date']) || null,
          log.lastID,
        ]
      );
    }

    if (staged.source === 'scopus') {
      await run(
        `INSERT INTO scopus_entries
         (journal_master_id, source_title, issn, eissn, publisher, scopus_status, active_or_discontinued, coverage_note,
          citescore_optional, sjr_optional, snip_optional, source_version, source_file_name, source_url, verified_date, import_log_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          journalId,
          sourceTitle,
          issn || null,
          eissn || null,
          publisher || null,
          extractValue(row, mapping, ['scopus_status', 'status']) || null,
          extractValue(row, mapping, ['active_or_discontinued', 'active_status']) || null,
          extractValue(row, mapping, ['coverage_note']) || null,
          extractValue(row, mapping, ['citescore_optional', 'citescore']) || null,
          extractValue(row, mapping, ['sjr_optional', 'sjr']) || null,
          extractValue(row, mapping, ['snip_optional', 'snip']) || null,
          extractValue(row, mapping, ['source_version']) || 'unknown',
          staged.fileName,
          extractValue(row, mapping, ['source_url']) || null,
          extractValue(row, mapping, ['verified_date']) || null,
          log.lastID,
        ]
      );
    }

    processedRows += 1;
  }

  await run(
    'UPDATE import_logs SET processed_rows = ?, rejected_rows = ?, status = ? WHERE id = ?',
    [processedRows, rejectedRows, 'completed', log.lastID]
  );

  fs.unlinkSync(stagedPath);
  searchCache.flushAll();

  res.json({ message: 'Import approved.', processed_rows: processedRows, rejected_rows: rejectedRows, import_log_id: log.lastID });
});

app.post('/api/admin/upload/rollback-last', adminOnly, async (req, res) => {
  const source = normalizeText(req.body.source || '');
  if (!SOURCE_CONFIG[source]) return res.status(400).json({ message: 'Unsupported source.' });

  const latest = await get(
    `SELECT * FROM import_logs
     WHERE source_name = ? AND status = 'completed'
     ORDER BY id DESC LIMIT 1`,
    [source]
  );

  if (!latest) return res.status(404).json({ message: 'No completed import found for source.' });

  const table = SOURCE_CONFIG[source].table;
  await run(`DELETE FROM ${table} WHERE import_log_id = ?`, [latest.id]);
  await run('UPDATE import_logs SET status = ?, notes = COALESCE(notes, "") || ? WHERE id = ?', ['rolled_back', ' | Rolled back by admin', latest.id]);

  searchCache.flushAll();
  res.json({ message: 'Rolled back last import.', import_log_id: latest.id, source });
});

app.get('/api/admin/templates/:source', adminOnly, (req, res) => {
  const source = normalizeText(req.params.source);
  if (!['abdc', 'abs', 'scopus'].includes(source)) {
    return res.status(400).json({ message: 'Invalid source template.' });
  }

  const filePath = path.join(__dirname, 'data', 'templates', `${source}_template.csv`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Template not found.' });
  }

  res.download(filePath);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

initSchema()
  .then(async () => {
    const seedCheck = await get('SELECT COUNT(*) AS count FROM journals_master');
    if (!seedCheck || seedCheck.count === 0) {
      // Lazy init of demo data if the DB is empty.
      await new Promise((resolve, reject) => {
        const script = require('child_process').fork(path.join(__dirname, 'initDb.js'));
        script.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Seed initialization failed'))));
      });
    }

    app.listen(PORT, () => {
      console.log(`Journal Index Checker running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

module.exports = app;

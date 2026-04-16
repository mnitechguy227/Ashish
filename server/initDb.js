const fs = require('fs');
const path = require('path');
const { initSchema, run, get } = require('./db');
const { normalizeText } = require('./utils/normalize');

async function upsertJournal(journal) {
  const existing = await get(
    `SELECT id FROM journals_master
     WHERE (issn IS NOT NULL AND issn = ?)
        OR (eissn IS NOT NULL AND eissn = ?)
        OR normalized_title = ?
     LIMIT 1`,
    [journal.issn || null, journal.eissn || null, normalizeText(journal.canonical_title)]
  );

  const now = new Date().toISOString();
  if (existing) {
    await run(
      `UPDATE journals_master
       SET canonical_title = ?, normalized_title = ?, alt_titles = ?, issn = ?, eissn = ?,
           publisher = ?, subject_area = ?, updated_at = ?
       WHERE id = ?`,
      [
        journal.canonical_title,
        normalizeText(journal.canonical_title),
        journal.alt_titles || null,
        journal.issn || null,
        journal.eissn || null,
        journal.publisher || null,
        journal.subject_area || null,
        now,
        existing.id,
      ]
    );
    return existing.id;
  }

  const created = await run(
    `INSERT INTO journals_master
     (canonical_title, normalized_title, alt_titles, issn, eissn, publisher, subject_area, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      journal.canonical_title,
      normalizeText(journal.canonical_title),
      journal.alt_titles || null,
      journal.issn || null,
      journal.eissn || null,
      journal.publisher || null,
      journal.subject_area || null,
      now,
      now,
    ]
  );

  return created.lastID;
}

async function insertImportLog(sourceName, fileName, processedRows) {
  const result = await run(
    `INSERT INTO import_logs (source_name, file_name, uploaded_by, uploaded_at, processed_rows, rejected_rows, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sourceName, fileName, 'seed-script', new Date().toISOString(), processedRows, 0, 'completed', 'DEMO ONLY import']
  );

  return result.lastID;
}

async function main() {
  await initSchema();
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'demo_seed.json'), 'utf8'));

  await run('DELETE FROM abdc_entries');
  await run('DELETE FROM abs_entries');
  await run('DELETE FROM scopus_entries');
  await run('DELETE FROM journals_master');
  await run('DELETE FROM import_logs');
  await run('DELETE FROM review_queue');

  const abdcLogId = await insertImportLog('abdc', 'abdc_demo.csv', seed.journals.length);
  const absLogId = await insertImportLog('abs', 'abs_demo.csv', seed.journals.length);
  const scopusLogId = await insertImportLog('scopus', 'scopus_demo.csv', seed.journals.length);

  for (const journal of seed.journals) {
    const journalId = await upsertJournal(journal);

    await run(
      `INSERT INTO abdc_entries
       (journal_master_id, source_title, issn, eissn, publisher, field_code, abdc_rank, source_version,
        source_file_name, source_url, verified_date, import_log_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        journalId,
        journal.abdc.source_title,
        journal.issn,
        journal.eissn,
        journal.publisher,
        journal.abdc.field_code,
        journal.abdc.abdc_rank,
        journal.abdc.source_version,
        journal.abdc.source_file_name,
        journal.abdc.source_url,
        journal.abdc.verified_date,
        abdcLogId,
      ]
    );

    await run(
      `INSERT INTO abs_entries
       (journal_master_id, source_title, issn, eissn, publisher, abs_rating, subject_group, source_version,
        source_file_name, source_url, verified_date, import_log_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        journalId,
        journal.abs.source_title,
        journal.issn,
        journal.eissn,
        journal.publisher,
        journal.abs.abs_rating,
        journal.abs.subject_group,
        journal.abs.source_version,
        journal.abs.source_file_name,
        journal.abs.source_url,
        journal.abs.verified_date,
        absLogId,
      ]
    );

    await run(
      `INSERT INTO scopus_entries
       (journal_master_id, source_title, issn, eissn, publisher, scopus_status, active_or_discontinued, coverage_note,
        citescore_optional, sjr_optional, snip_optional, source_version, source_file_name, source_url, verified_date, import_log_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        journalId,
        journal.scopus.source_title,
        journal.issn,
        journal.eissn,
        journal.publisher,
        journal.scopus.scopus_status,
        journal.scopus.active_or_discontinued,
        journal.scopus.coverage_note,
        journal.scopus.citescore_optional,
        journal.scopus.sjr_optional,
        journal.scopus.snip_optional,
        journal.scopus.source_version,
        journal.scopus.source_file_name,
        journal.scopus.source_url,
        journal.scopus.verified_date,
        scopusLogId,
      ]
    );
  }

  console.log('Database initialized with DEMO ONLY seed data.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

const app = document.getElementById('app');
const API = '';
const NA = 'Not available in verified source data.';
const NOT_FOUND = 'Not found in uploaded verified source data.';
const savedKey = 'journal-index-checker-saved';
const adminTokenKey = 'journal-index-checker-admin-token';
const recentSearchesKey = 'journal-index-checker-recent-searches';

const state = {
  results: [],
  filters: {},
};

function getSaved() {
  return JSON.parse(localStorage.getItem(savedKey) || '[]');
}

function setSaved(value) {
  localStorage.setItem(savedKey, JSON.stringify(value));
}

function disclaimerHtml() {
  return document.getElementById('disclaimer-template').innerHTML;
}

function pageShell(content, includeDisclaimer = true) {
  return `${content}${includeDisclaimer ? disclaimerHtml() : ''}`;
}

function pushRecentSearch(query) {
  if (!query) return;
  const existing = JSON.parse(localStorage.getItem(recentSearchesKey) || '[]');
  const updated = [query, ...existing.filter((q) => q !== query)].slice(0, 8);
  localStorage.setItem(recentSearchesKey, JSON.stringify(updated));
}

function matchBadge(label) {
  const css = label === 'Exact match' ? 'abdc' : label === 'Strong probable match' ? 'abs' : 'warn';
  return `<span class="badge ${css}">${label}</span>`;
}

async function apiGet(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function apiPost(path, body, admin = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (admin) headers['x-admin-token'] = localStorage.getItem(adminTokenKey) || '';
  const response = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function renderHome() {
  const recent = JSON.parse(localStorage.getItem(recentSearchesKey) || '[]');
  app.innerHTML = pageShell(`
    <section class="card">
      <h2>Unified journal indexing lookup for researchers</h2>
      <p>Search ABDC, ABS/AJG, and Scopus data from one place using title, ISSN, eISSN, publisher, or subject area.</p>
      <div class="grid two">
        <div>
          <label>Search journal</label>
          <input id="home-search" placeholder="e.g., Journal of Operations Management / 0272-6963 / Elsevier" />
          <button id="home-search-btn" style="margin-top: 0.6rem;">Search Now</button>
          <p class="small">Quick examples: "supply chain", "0925-5273", "Wiley entrepreneurship".</p>
          ${recent.length ? `<div class="small"><strong>Recent searches:</strong> ${recent.map((r) => `<a href="#/results?q=${encodeURIComponent(r)}">${r}</a>`).join(' | ')}</div>` : ''}
        </div>
        <div class="card">
          <h3>What each source means</h3>
          <ul>
            <li><strong>ABDC:</strong> Academic Business Deans Council quality list.</li>
            <li><strong>ABS/AJG:</strong> Academic Journal Guide rating list.</li>
            <li><strong>Scopus:</strong> Elsevier indexing database status.</li>
          </ul>
          <p class="small">Future-ready architecture supports Web of Science, UGC-CARE, and more.</p>
        </div>
      </div>
    </section>
  `);

  document.getElementById('home-search-btn').onclick = () => {
    const q = document.getElementById('home-search').value.trim();
    location.hash = `#/results?q=${encodeURIComponent(q)}`;
  };
}

function resultRowHtml(row) {
  const incomplete = [row.abdc_rank, row.abs_rating, row.scopus_status].some((v) => v === NOT_FOUND);
  return `
    <div class="result-row">
      <div>
        <a href="#/journal/${row.id}"><strong>${row.canonical_title}</strong></a>
        <div class="small">ISSN: ${row.issn || NA} | eISSN: ${row.eissn || NA}</div>
        <div class="small">Publisher: ${row.publisher || NA} | Subject: ${row.subject_area || NA}</div>
        <div class="small">Match: ${matchBadge(row.match_confidence)}</div>
        ${incomplete ? '<div class="small"><span class="badge warn">Incomplete data</span> Verify from source links.</div>' : ''}
      </div>
      <div><span class="badge abdc">ABDC</span> ${row.abdc_rank || NA}</div>
      <div><span class="badge abs">ABS</span> ${row.abs_rating || NA}</div>
      <div><span class="badge scopus">Scopus</span> ${row.scopus_status || NA}</div>
      <div>
        <button class="ghost" data-save="${row.id}">Save</button>
        <button class="secondary" data-compare="${row.id}" style="margin-top: 0.4rem;">Compare</button>
      </div>
    </div>
  `;
}

async function renderResults() {
  const url = new URL(location.href.replace('#/', ''));
  const q = url.searchParams.get('q') || '';
  const sortBy = url.searchParams.get('sort_by') || 'relevance';

  app.innerHTML = pageShell(`
    <section class="grid two">
      <aside class="card">
        <button class="ghost" id="toggle-filters">Toggle Filters (mobile)</button>
        <div id="filter-panel">
        <h3>Filters</h3>
        <label>ABDC rank</label>
        <select id="f-abdc"><option value="">All</option><option>A*</option><option>A</option><option>B</option><option>C</option></select>
        <label>ABS rating</label>
        <select id="f-abs"><option value="">All</option><option>4</option><option>3</option><option>2</option><option>1</option></select>
        <label>Scopus status</label>
        <select id="f-scopus"><option value="">All</option><option>Indexed</option><option>Not indexed</option></select>
        <label>Publisher contains</label>
        <input id="f-publisher" />
        <label>Subject area contains</label>
        <input id="f-subject" />
        <label><input type="checkbox" id="f-exact" style="width:auto;"/> Exact matches only</label>
        <label><input type="checkbox" id="f-similar" checked style="width:auto;"/> Show similar matches</label>
        <button id="apply-filters">Apply</button>
        </div>
      </aside>
      <section>
        <div class="card">
          <h2>Search Results</h2>
          <div class="grid three">
            <div><label>Query</label><input id="q" value="${q}" /></div>
            <div><label>Sort by</label><select id="sort-by"><option value="relevance">Relevance</option><option value="title">Title</option><option value="abdc_rank">ABDC rank</option><option value="abs_rating">ABS rating</option><option value="publisher">Publisher</option></select></div>
            <div style="display:flex;align-items:end;"><button id="run-search">Search</button></div>
          </div>
          <div id="results-list" class="card" style="margin-top:0.8rem;"><em>Loading results...</em></div>
        </div>
      </section>
    </section>
  `);

  document.getElementById('sort-by').value = sortBy;
  await loadResults();

  document.getElementById('run-search').onclick = () => updateSearchHash();
  document.getElementById('apply-filters').onclick = () => updateSearchHash(true);
  document.getElementById('toggle-filters').onclick = () => {
    const panel = document.getElementById('filter-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };
}

function updateSearchHash(includeFilters = false) {
  const params = new URLSearchParams();
  params.set('q', document.getElementById('q').value.trim());
  params.set('sort_by', document.getElementById('sort-by').value);
  if (includeFilters) {
    [['abdc_rank', 'f-abdc'], ['abs_rating', 'f-abs'], ['scopus_status', 'f-scopus'], ['publisher', 'f-publisher'], ['subject_area', 'f-subject']]
      .forEach(([k, id]) => { const v = document.getElementById(id).value.trim(); if (v) params.set(k, v); });
    params.set('exact_only', document.getElementById('f-exact').checked ? 'true' : 'false');
    params.set('show_similar', document.getElementById('f-similar').checked ? 'true' : 'false');
  }
  location.hash = `#/results?${params.toString()}`;
}

async function loadResults() {
  const url = new URL(location.href.replace('#/', ''));
  const payload = await apiGet(`/api/search?${url.searchParams.toString()}`);
  pushRecentSearch(payload.query);
  state.results = payload.results;

  const list = document.getElementById('results-list');
  if (!payload.results.length) {
    list.innerHTML = `<strong>No results.</strong> ${NOT_FOUND}`;
    return;
  }

  list.innerHTML = `
    ${payload.did_you_mean ? `<div class="card"><strong>${payload.did_you_mean.text}</strong> <a href="#/results?q=${encodeURIComponent(payload.did_you_mean.suggestion)}">Search suggestion</a></div>` : ''}
    <p><strong>${payload.total}</strong> result(s)</p>
    ${payload.results.map(resultRowHtml).join('')}
  `;
  list.querySelectorAll('[data-save]').forEach((button) => {
    button.onclick = () => {
      const id = Number(button.dataset.save);
      const saved = getSaved();
      if (!saved.includes(id)) setSaved([...saved, id]);
      alert('Saved to shortlist.');
    };
  });

  list.querySelectorAll('[data-compare]').forEach((button) => {
    button.onclick = () => {
      const id = Number(button.dataset.compare);
      const current = new URLSearchParams(location.hash.split('?')[1] || '');
      const ids = (current.get('compare_ids') || '').split(',').filter(Boolean);
      if (!ids.includes(String(id)) && ids.length < 4) ids.push(String(id));
      location.hash = `#/compare?ids=${ids.join(',')}`;
    };
  });
}

function sourceCard(label, entries, fieldMap) {
  const first = entries[0] || {};
  if (first.note) return `<section class="card"><h3>${label}</h3><p>${first.note}</p></section>`;

  return `
    <section class="card">
      <h3>${label}</h3>
      ${entries.map((entry) => `
        <div class="card">
          <div><strong>Raw source title:</strong> ${entry.source_title || NOT_FOUND}</div>
          <div><strong>Source verified date:</strong> ${entry.verified_date || NOT_FOUND}</div>
          ${Object.entries(fieldMap).map(([k, title]) => `<div><strong>${title}:</strong> ${entry[k] || NA}</div>`).join('')}
        </div>
      `).join('')}
    </section>
  `;
}

async function renderJournalDetail(id) {
  const journal = await apiGet(`/api/journals/${id}`);
  app.innerHTML = pageShell(`
    <section class="card">
      <h2>${journal.canonical_title}</h2>
      ${journal.data_warning ? `<div class="card"><strong>Warning:</strong> ${journal.data_warning}</div>` : ''}
      <p><strong>Match handling:</strong> ISSN > eISSN > exact title > controlled fuzzy title.</p>
      <p class="small">${journal.disclaimer}</p>
      <div class="grid two">
        <div class="card">
          <h3>Metadata</h3>
          <div><strong>ISSN:</strong> ${journal.issn || NA}</div>
          <div><strong>eISSN:</strong> ${journal.eissn || NA}</div>
          <div><strong>Publisher:</strong> ${journal.publisher || NA}</div>
          <div><strong>Subject area:</strong> ${journal.subject_area || NA}</div>
          <div><strong>Alternate title:</strong> ${journal.alt_titles || NA}</div>
        </div>
        <div class="card">
          <h3>Difference note across sources</h3>
          <p class="small">Values are displayed exactly as imported per source. Missing values are never inferred.</p>
          <p class="small">If ISSN/title conflict appears in source upload, check admin review queue for uncertain rows.</p>
        </div>
      </div>
    </section>
    ${sourceCard('ABDC', journal.sources.abdc, { source_title: 'Source title', abdc_rank: 'ABDC rank', field_code: 'Field code', verified_date: 'Verified date', source_url: 'Source link' })}
    ${sourceCard('ABS / AJG', journal.sources.abs, { source_title: 'Source title', abs_rating: 'ABS rating', subject_group: 'Subject group', verified_date: 'Verified date', source_url: 'Source link' })}
    ${sourceCard('Scopus', journal.sources.scopus, { source_title: 'Source title', scopus_status: 'Scopus status', active_or_discontinued: 'Active/discontinued', coverage_note: 'Coverage note', verified_date: 'Verified date', source_url: 'Source link' })}
  `);
}

async function renderCompare() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const ids = params.get('ids') || '';
  if (!ids) {
    app.innerHTML = '<section class="card"><h2>Compare journals</h2><p>Select 2 to 4 journals from search results first.</p></section>';
    return;
  }

  const data = await apiGet(`/api/compare?ids=${ids}`);
  const fields = ['issn', 'eissn', 'publisher', 'subject_area', 'abdc_rank', 'abs_rating', 'scopus_status', 'active_or_discontinued'];
  app.innerHTML = pageShell(`
    <section class="card table-wrap">
      <h2>Compare Journals</h2>
      <button id="export-compare-csv" class="secondary">Export comparison as CSV</button>
      <table>
        <thead><tr><th>Field</th>${data.journals.map((j) => `<th>${j.canonical_title}</th>`).join('')}</tr></thead>
        <tbody>
          ${fields.map((field) => `
            <tr>
              <td class="highlight"><strong>${field}</strong></td>
              ${data.journals.map((j) => `<td class="${(data.journals.some((o) => (o[field] || '') !== (j[field] || '')) && ['abdc_rank', 'abs_rating', 'scopus_status', 'active_or_discontinued'].includes(field)) ? 'highlight' : ''}">${j[field] || NA}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `);

  document.getElementById('export-compare-csv').onclick = () => {
    const rows = [['field', ...data.journals.map((j) => j.canonical_title)]].concat(
      fields.map((field) => [field, ...data.journals.map((j) => j[field] || '')])
    );
    const csv = rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'journal_comparison.csv';
    a.click();
  };
}

async function renderSaved() {
  const saved = getSaved();
  if (!saved.length) {
    app.innerHTML = '<section class="card"><h2>Saved shortlist</h2><p>No journals saved yet.</p></section>';
    return;
  }

  const data = await apiGet(`/api/compare?ids=${saved.join(',')}`);
  app.innerHTML = pageShell(`
    <section class="card">
      <h2>Saved shortlist</h2>
      <button id="copy-summary" class="secondary">Copy result summary</button>
      <button id="export-csv" class="ghost" style="margin-top:0.5rem;">Export CSV</button>
      <div id="saved-list">${data.journals.map((j) => `
        <div class="card">
          <strong>${j.canonical_title}</strong>
          <div class="small">ABDC: ${j.abdc_rank || NA} | ABS: ${j.abs_rating || NA} | Scopus: ${j.scopus_status || NA}</div>
          <button class="ghost" data-remove="${j.id}" style="margin-top:0.4rem;">Remove</button>
        </div>
      `).join('')}</div>
    </section>
  `);

  document.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.onclick = () => {
      const id = Number(btn.dataset.remove);
      setSaved(getSaved().filter((x) => x !== id));
      renderSaved();
    };
  });

  document.getElementById('copy-summary').onclick = () => {
    const text = data.journals.map((j) => `${j.canonical_title} | ABDC ${j.abdc_rank || NA} | ABS ${j.abs_rating || NA} | Scopus ${j.scopus_status || NA}`).join('\n');
    navigator.clipboard.writeText(text);
    alert('Summary copied.');
  };

  document.getElementById('export-csv').onclick = () => {
    const rows = [['title', 'issn', 'eissn', 'publisher', 'subject', 'abdc_rank', 'abs_rating', 'scopus_status']].concat(
      data.journals.map((j) => [j.canonical_title, j.issn || '', j.eissn || '', j.publisher || '', j.subject_area || '', j.abdc_rank || '', j.abs_rating || '', j.scopus_status || ''])
    );
    const csv = rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shortlist.csv';
    a.click();
  };
}

function renderAbout() {
  app.innerHTML = pageShell(`
    <section class="card">
      <h2>Methodology and limitations</h2>
      <ol>
        <li><strong>Matching priority:</strong> ISSN exact match > eISSN exact match > normalized exact title > controlled fuzzy title.</li>
        <li>Source records remain separate and traceable. Missing values are never inferred.</li>
        <li>Confidence labels: Exact match, Strong probable match, Uncertain match.</li>
        <li>Uncertain import records are pushed to admin review queue for manual decision.</li>
      </ol>
      <p><strong>Limitation:</strong> Results depend on uploaded verified datasets and their freshness.</p>
      <p><strong>Critical note:</strong> Final submission decisions must be verified from official source portals.</p>
    </section>
  `);
}

async function renderAdmin() {
  app.innerHTML = pageShell(`
    <section class="card">
      <h2>Admin Dashboard</h2>
      <label>Admin token</label>
      <input id="admin-token" value="${localStorage.getItem(adminTokenKey) || ''}" />
      <button id="save-token">Save token</button>
      <hr/>
      <div class="grid two">
        <div class="card">
          <h3>Upload source file</h3>
          <label>Source</label>
          <select id="upload-source"><option value="abdc">ABDC</option><option value="abs">ABS/AJG</option><option value="scopus">Scopus</option></select>
          <label>File (CSV or XLSX)</label>
          <input id="upload-file" type="file" accept=".csv,.xlsx,.xls" />
          <button id="preview-upload">Preview Upload</button>
          <div id="preview-out" class="small"></div>
        </div>
        <div class="card">
          <h3>Rollback last import</h3>
          <label>Source</label>
          <select id="rollback-source"><option value="abdc">ABDC</option><option value="abs">ABS/AJG</option><option value="scopus">Scopus</option></select>
          <button id="do-rollback" class="secondary">Rollback</button>
          <div id="rollback-out" class="small"></div>
        </div>
      </div>
      <div class="grid two">
        <div class="card"><h3>Upload history</h3><div id="logs">Loading...</div></div>
        <div class="card"><h3>Rejected/Error rows</h3><button id="download-error-report" class="ghost">Download error report (CSV)</button><div id="queue">Loading...</div></div>
      </div>
    </section>
  `);

  document.getElementById('save-token').onclick = () => {
    localStorage.setItem(adminTokenKey, document.getElementById('admin-token').value.trim());
    alert('Token saved.');
  };

  document.getElementById('preview-upload').onclick = async () => {
    const token = localStorage.getItem(adminTokenKey) || '';
    const source = document.getElementById('upload-source').value;
    const file = document.getElementById('upload-file').files[0];
    if (!file) return alert('Select file first.');

    const fd = new FormData();
    fd.append('source', source);
    fd.append('file', file);

    const resp = await fetch('/api/admin/upload/preview', { method: 'POST', headers: { 'x-admin-token': token }, body: fd });
    const data = await resp.json();
    if (!resp.ok) return alert(JSON.stringify(data));

    document.getElementById('preview-out').innerText = `Rows: ${data.total_rows}, duplicates: ${data.duplicate_count}, rejected: ${data.rejected_count}`;
    if (confirm('Approve this import now?')) {
      const approved = await apiPost('/api/admin/upload/approve', { stage_id: data.stage_id, uploaded_by: 'admin-web' }, true);
      alert(`Import done. Processed: ${approved.processed_rows}, Rejected: ${approved.rejected_rows}`);
      renderAdmin();
    }
  };

  document.getElementById('do-rollback').onclick = async () => {
    try {
      const output = await apiPost('/api/admin/upload/rollback-last', { source: document.getElementById('rollback-source').value }, true);
      document.getElementById('rollback-out').innerText = output.message;
      renderAdmin();
    } catch (error) {
      document.getElementById('rollback-out').innerText = String(error);
    }
  };
  document.getElementById('download-error-report').onclick = () => {
    const token = localStorage.getItem(adminTokenKey) || '';
    fetch('/api/admin/import-error-report', { headers: { 'x-admin-token': token } })
      .then((resp) => resp.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'import_error_report.csv';
        a.click();
      });
  };

  try {
    const logs = await apiGet('/api/admin/import-logs');
    document.getElementById('logs').innerHTML = logs.logs.map((l) => `<div class="card">#${l.id} ${l.source_name} | ${l.status} | processed ${l.processed_rows} | rejected ${l.rejected_rows} | ${l.uploaded_at}</div>`).join('') || 'No logs';

    const queue = await apiGet('/api/admin/review-queue');
    document.getElementById('queue').innerHTML = queue.queue.map((q) => `<div class="card">#${q.id} ${q.source_name} | ${q.issue_type} | ${q.issue_note}</div>`).join('') || 'No rejected rows';
  } catch {
    document.getElementById('logs').innerText = 'Unauthorized. Save admin token first.';
    document.getElementById('queue').innerText = 'Unauthorized. Save admin token first.';
  }
}

async function router() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/results')) return renderResults();
  if (hash.startsWith('#/journal/')) return renderJournalDetail(hash.split('/')[2]);
  if (hash.startsWith('#/compare')) return renderCompare();
  if (hash.startsWith('#/saved')) return renderSaved();
  if (hash.startsWith('#/about')) return renderAbout();
  if (hash.startsWith('#/admin')) return renderAdmin();
  return renderHome();
}

window.addEventListener('hashchange', router);
router();

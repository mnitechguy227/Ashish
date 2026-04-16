# Journal Index Checker (Website Prototype)

A **build-ready responsive website prototype** for research scholars, faculty, and PhD students to check whether a journal appears in ABDC, ABS/AJG, and Scopus source datasets from one place.

> **Accuracy-first principle:** The application never fabricates rankings or indexing status. Missing values are explicitly shown as: **"Not available in verified source data."**

---

## 1) Chosen tech stack (and why)

- **Frontend:** Vanilla JavaScript + HTML + CSS (single-page routed website)
  - Lightweight, easy to maintain, no heavy framework setup required for prototype delivery.
- **Backend:** Node.js + Express
  - Clean API endpoints for search, detail, compare, admin upload/import, rollback, and logs.
- **Database:** SQLite (`sqlite3`)
  - Practical local relational database for source-traceable entries and import logs.
- **File import:** `multer` + `xlsx`
  - Supports both CSV and XLSX import workflows.
- **Caching:** `node-cache`
  - In-memory caching for repeated search queries.

---

## 2) Implemented pages

- `/` Home page
- `#/results` Search results with filters + sorting
- `#/journal/:id` Journal detail page
- `#/compare` Side-by-side comparison (2–4 journals)
- `#/saved` Saved shortlist page with CSV export + copy summary
- `#/admin` Admin dashboard (upload, preview, approve, rollback, logs, rejected queue)
- `#/about` Methodology + limitations + disclaimer

---

## 3) Data model (SQLite)

Implemented tables:

- `journals_master`
- `abdc_entries`
- `abs_entries`
- `scopus_entries`
- `import_logs`
- `review_queue`

Schema file: `server/migrations/schema.sql`

---

## 4) Matching logic

The system uses this strict priority:

1. ISSN exact match
2. eISSN exact match
3. normalized exact title match
4. controlled fuzzy title match (Levenshtein-based score)

Confidence labels:
- `Exact match`
- `Strong probable match`
- `Uncertain match`

Important behavior:
- Source datasets remain separate (no blind merging).
- If a source does not contain a value, the UI shows explicit not-available text.
- Ambiguous import rows are routed to `review_queue` for manual admin review.

---

## 5) Admin workflow

1. Open `#/admin`
2. Save admin token in browser (localStorage)
3. Upload CSV/XLSX for `abdc` / `abs` / `scopus`
4. Preview:
   - row sample
   - auto header mapping
   - duplicate count
   - rejected rows
5. Approve import
6. Review logs + review queue
7. Rollback the last completed import per source

Admin endpoints require header:

`x-admin-token: <ADMIN_TOKEN>`

Default token for local prototype: `change-me-admin-token` (set env var in production).

---

## 6) Optional AI helper (database-grounded)

Endpoint: `POST /api/assistant/query`

Example query strings:
- "Show ABDC A journals in operations that are also indexed in Scopus"
- "Find ABS 3 journals"

The response is strictly constrained to uploaded DB data. If no data exists, API returns:
- **"Not available in uploaded verified source data."**

---

## 7) Seed data and templates

- **DEMO ONLY seed:** `server/data/demo_seed.json`
- Import templates:
  - `server/data/templates/abdc_template.csv`
  - `server/data/templates/abs_template.csv`
  - `server/data/templates/scopus_template.csv`

---

## 8) Run locally

```bash
npm install
npm run init-db
npm start
```

Then open:

- Website: `http://localhost:3001`
- Health check: `http://localhost:3001/api/health`

---

## 9) Deployment steps

1. Provision Linux VM/container with Node 18+.
2. Copy project files.
3. Install deps: `npm install --omit=dev`
4. Set env vars:
   - `PORT` (e.g., `3001`)
   - `ADMIN_TOKEN` (strong secret)
5. Initialize DB once: `npm run init-db`
6. Start service: `npm start`
7. Put Nginx/Caddy reverse proxy in front with HTTPS.
8. Back up `server/db/journal_index_checker.sqlite` regularly.

---

## 10) Updating datasets in future

1. Go to `#/admin` with admin token.
2. Upload new ABDC/ABS/Scopus file (CSV/XLSX).
3. Preview mappings and duplicates.
4. Approve import.
5. Download the import error report and clear review queue items.
6. If the import is incorrect, rollback the last import for that source.

---

## 11) Project structure

- `client/` responsive website UI (pages, routing, compare, shortlist, admin UI)
- `server/server.js` API and import workflow
- `server/db/` SQLite connection layer
- `server/migrations/` schema definition
- `server/utils/` normalization + fuzzy scoring helpers
- `server/data/` demo seed and import templates

---

## 12) Accuracy and disclaimer controls

- Homepage and journal detail page include visible guidance disclaimer.
- Missing values are not guessed.
- Source-specific verified date and source links are displayed where available.
- Public users have read-only search; admin-only endpoints are protected by token.

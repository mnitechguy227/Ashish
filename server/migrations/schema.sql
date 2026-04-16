PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS journals_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  alt_titles TEXT,
  issn TEXT,
  eissn TEXT,
  publisher TEXT,
  subject_area TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journals_master_issn ON journals_master(issn);
CREATE UNIQUE INDEX IF NOT EXISTS idx_journals_master_eissn ON journals_master(eissn);
CREATE INDEX IF NOT EXISTS idx_journals_master_title ON journals_master(normalized_title);
CREATE INDEX IF NOT EXISTS idx_journals_master_publisher ON journals_master(publisher);
CREATE INDEX IF NOT EXISTS idx_journals_master_subject_area ON journals_master(subject_area);

CREATE TABLE IF NOT EXISTS abdc_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_master_id INTEGER,
  source_title TEXT NOT NULL,
  issn TEXT,
  eissn TEXT,
  publisher TEXT,
  field_code TEXT,
  abdc_rank TEXT,
  source_version TEXT,
  source_file_name TEXT,
  source_url TEXT,
  verified_date TEXT,
  import_log_id INTEGER,
  FOREIGN KEY (journal_master_id) REFERENCES journals_master(id),
  FOREIGN KEY (import_log_id) REFERENCES import_logs(id)
);

CREATE TABLE IF NOT EXISTS abs_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_master_id INTEGER,
  source_title TEXT NOT NULL,
  issn TEXT,
  eissn TEXT,
  publisher TEXT,
  abs_rating TEXT,
  subject_group TEXT,
  source_version TEXT,
  source_file_name TEXT,
  source_url TEXT,
  verified_date TEXT,
  import_log_id INTEGER,
  FOREIGN KEY (journal_master_id) REFERENCES journals_master(id),
  FOREIGN KEY (import_log_id) REFERENCES import_logs(id)
);

CREATE TABLE IF NOT EXISTS scopus_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_master_id INTEGER,
  source_title TEXT NOT NULL,
  issn TEXT,
  eissn TEXT,
  publisher TEXT,
  scopus_status TEXT,
  active_or_discontinued TEXT,
  coverage_note TEXT,
  citescore_optional TEXT,
  sjr_optional TEXT,
  snip_optional TEXT,
  source_version TEXT,
  source_file_name TEXT,
  source_url TEXT,
  verified_date TEXT,
  import_log_id INTEGER,
  FOREIGN KEY (journal_master_id) REFERENCES journals_master(id),
  FOREIGN KEY (import_log_id) REFERENCES import_logs(id)
);

CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  rejected_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  record_reference TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  issue_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_abdc_journal_id ON abdc_entries(journal_master_id);
CREATE INDEX IF NOT EXISTS idx_abs_journal_id ON abs_entries(journal_master_id);
CREATE INDEX IF NOT EXISTS idx_scopus_journal_id ON scopus_entries(journal_master_id);

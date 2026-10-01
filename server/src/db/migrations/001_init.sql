-- mailmoat v1 schema (PRD §12). Email bodies are NOT stored; only metadata, hashes and verdicts.

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                      -- JSON-encoded, never secret
);

CREATE TABLE secrets (
  name TEXT PRIMARY KEY,
  ciphertext BLOB NOT NULL,
  iv BLOB NOT NULL,
  tag BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),   -- single row
  history_id TEXT,
  last_poll_at TEXT
);
INSERT INTO sync_state (id) VALUES (1);

CREATE TABLE emails (
  gmail_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_addr TEXT NOT NULL,
  from_domain TEXT NOT NULL,
  from_name TEXT,
  to_addrs TEXT NOT NULL DEFAULT '[]',     -- JSON array
  date TEXT NOT NULL,
  subject_hash TEXT,
  body_hash TEXT,
  has_list_unsubscribe INTEGER NOT NULL DEFAULT 0,
  unsubscribe_url TEXT,
  one_click INTEGER NOT NULL DEFAULT 0,
  labels TEXT NOT NULL DEFAULT '[]',       -- JSON array of Gmail label IDs
  is_read INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT
);
CREATE INDEX emails_thread ON emails (thread_id);
CREATE INDEX emails_from ON emails (from_addr);
CREATE INDEX emails_date ON emails (date);

CREATE TABLE auth_results (
  gmail_id TEXT PRIMARY KEY REFERENCES emails (gmail_id) ON DELETE CASCADE,
  spf TEXT,
  dkim TEXT,
  dkim_domain TEXT,
  dmarc TEXT
);

CREATE TABLE signals (
  gmail_id TEXT NOT NULL REFERENCES emails (gmail_id) ON DELETE CASCADE,
  signal_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY (gmail_id, signal_id)
);

CREATE TABLE reader_forms (
  gmail_id TEXT PRIMARY KEY REFERENCES emails (gmail_id) ON DELETE CASCADE,
  json TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE verdicts (
  gmail_id TEXT PRIMARY KEY REFERENCES emails (gmail_id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('SAFE', 'SUSPICIOUS', 'DANGEROUS')),
  score INTEGER NOT NULL,
  reasons_json TEXT NOT NULL,
  floor TEXT NOT NULL CHECK (floor IN ('SAFE', 'SUSPICIOUS', 'DANGEROUS')),
  created_at TEXT NOT NULL
);
CREATE INDEX verdicts_level ON verdicts (level);

CREATE TABLE contacts (
  address TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,       -- emails the user sent to them
  received_count INTEGER NOT NULL DEFAULT 0,   -- emails the user received from them
  trusted INTEGER NOT NULL DEFAULT 0           -- user-sourced fact only
);
CREATE INDEX contacts_domain ON contacts (domain);

CREATE TABLE senders (
  address TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'NONE' CHECK (status IN ('NONE', 'KEPT', 'UNSUBSCRIBED', 'BLOCKED')),
  email_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  last_received TEXT
);

CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  actions_json TEXT NOT NULL,
  is_security INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rule_runs (
  gmail_id TEXT NOT NULL REFERENCES emails (gmail_id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL REFERENCES rules (id),
  actions_taken_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (gmail_id, rule_id)
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decided_via TEXT
);
CREATE INDEX approvals_status ON approvals (status);

CREATE TABLE drafts (
  gmail_draft_id TEXT PRIMARY KEY,
  gmail_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source = 'user'),  -- invariant 7: only user-sourced memory
  created_at TEXT NOT NULL
);

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  subject TEXT,
  decision TEXT,
  reason TEXT,
  data_json TEXT
);
CREATE INDEX audit_log_ts ON audit_log (ts);

-- The audit log is append-only.
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

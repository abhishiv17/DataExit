-- Data Exit schema. See docs/architecture/data-model.md.
-- Per-user tables should be encrypted at rest; never store email bodies, SMS text or ID documents.

CREATE TABLE IF NOT EXISTS companies (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  domains            TEXT[] NOT NULL DEFAULT '{}',
  sector             TEXT NOT NULL,
  data_categories    TEXT[] NOT NULL DEFAULT '{}',
  retention_duties   TEXT[] NOT NULL DEFAULT '{}',
  grievance_email    TEXT,
  grievance_url      TEXT,
  grievance_officer  TEXT,
  grievance_verified BOOLEAN NOT NULL DEFAULT FALSE,
  grievance_source   TEXT,
  grievance_checked  DATE,
  privacy_policy_url TEXT
);

CREATE TABLE IF NOT EXISTS directory_reports (
  id          BIGSERIAL PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id),
  email       TEXT,
  url         TEXT,
  source      TEXT NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY,
  display_name TEXT,
  email        TEXT,
  language     TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
  low_tier_auto BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS footprints (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id     TEXT NOT NULL REFERENCES companies(id),
  first_seen     TIMESTAMPTZ,
  last_seen      TIMESTAMPTZ,
  discovered_via TEXT[] NOT NULL DEFAULT '{}',   -- gmail | sms | google_signin | manual
  source_refs    TEXT[] NOT NULL DEFAULT '{}',   -- message IDs only
  sensitivity    SMALLINT NOT NULL DEFAULT 0 CHECK (sensitivity BETWEEN 0 AND 12),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dormant','request_open','closed')),
  UNIQUE (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS requests (
  id                UUID PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  footprint_id      UUID REFERENCES footprints(id) ON DELETE SET NULL,
  company_id        TEXT NOT NULL REFERENCES companies(id),
  type              TEXT NOT NULL CHECK (type IN ('stop_marketing','withdraw_consent','access','correct','erase','restrict_use')),
  tier              TEXT NOT NULL CHECK (tier IN ('low','medium','high')),
  language          TEXT NOT NULL CHECK (language IN ('en','hi')),
  legal_basis       TEXT NOT NULL CHECK (legal_basis IN ('statutory','policy_based')),
  status            TEXT NOT NULL,
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,                -- our own drafted text, not the company's mail
  recipient         TEXT,
  sent_at           TIMESTAMPTZ,
  deadline_at       TIMESTAMPTZ,
  gmail_message_id  TEXT,
  calendar_event_id TEXT,
  evidence_refs     TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS requests_user_status ON requests (user_id, status);
CREATE INDEX IF NOT EXISTS requests_deadline ON requests (deadline_at) WHERE status NOT IN ('confirmed','closed','cancelled');

-- Append-only, hash-chained. App role should have INSERT/SELECT only.
CREATE TABLE IF NOT EXISTS audit_events (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq        BIGINT NOT NULL,
  at         TIMESTAMPTZ NOT NULL,
  actor      TEXT NOT NULL,          -- user | agent | system | helper:<id>
  action     TEXT NOT NULL,
  target     TEXT NOT NULL,
  source_ref TEXT,
  details    JSONB NOT NULL DEFAULT '{}',
  prev_hash  CHAR(64) NOT NULL,
  hash       CHAR(64) NOT NULL,
  PRIMARY KEY (user_id, seq)
);

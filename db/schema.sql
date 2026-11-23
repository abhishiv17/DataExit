-- Data Exit schema. See docs/architecture/data-model.md and docs/contract.md.
-- Applied by `npm run db:migrate` (idempotent).
-- Never store email bodies, SMS text or ID documents. Request bodies are our own drafted text.

-- Company Directory (loaded from data/companies.csv by `npm run db:seed-directory`)
CREATE TABLE IF NOT EXISTS companies (
  id                 TEXT PRIMARY KEY,
  legal_name         TEXT NOT NULL,
  brands             TEXT[] NOT NULL DEFAULT '{}',
  domains            TEXT[] NOT NULL DEFAULT '{}',
  sms_sender_ids     TEXT[] NOT NULL DEFAULT '{}',
  grievance_email    TEXT,
  data_categories    TEXT[] NOT NULL DEFAULT '{}',
  sensitivity        TEXT NOT NULL CHECK (sensitivity IN ('low', 'med', 'high')),
  retention_rule     TEXT,
  sector             TEXT,
  grievance_verified BOOLEAN NOT NULL DEFAULT FALSE,
  grievance_source   TEXT,
  support_email      TEXT
);
CREATE INDEX IF NOT EXISTS companies_domains ON companies USING GIN (domains);

CREATE TABLE IF NOT EXISTS directory_reports (
  id          BIGSERIAL PRIMARY KEY,
  company_id  TEXT NOT NULL,
  email       TEXT,
  url         TEXT,
  source      TEXT NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  doc     JSONB NOT NULL
);

-- Per-user footprint. company_id may be "unknown:<domain>", so no FK to companies.
CREATE TABLE IF NOT EXISTS footprints (
  user_id           TEXT NOT NULL,
  company_id        TEXT NOT NULL,
  sensitivity_score SMALLINT NOT NULL,
  last_interaction  TIMESTAMPTZ NOT NULL,
  doc               JSONB NOT NULL,
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  company_id TEXT NOT NULL,
  status     TEXT NOT NULL,
  deadline   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  doc        JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_user_status ON requests (user_id, status);

-- Append-only, hash-chained. In production the app role should have INSERT/SELECT only (plus DELETE for account deletion).
CREATE TABLE IF NOT EXISTS audit_events (
  user_id   TEXT NOT NULL,
  seq       BIGINT NOT NULL,
  id        TEXT NOT NULL UNIQUE,
  timestamp TIMESTAMPTZ NOT NULL,
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  approval  TEXT,
  target    TEXT,
  details   JSONB NOT NULL DEFAULT '{}',
  prev_hash CHAR(64) NOT NULL,
  hash      CHAR(64) NOT NULL,
  PRIMARY KEY (user_id, seq)
);

# db

- `schema.sql`: Postgres schema (companies, directory_reports, users, footprints, requests, audit_events).
- `migrations/`: numbered migrations once the schema starts changing (`0002_*.sql`, ...).
- `seeds/`: load `servers/company-directory/data/companies.json` into `companies` (script TODO in `scripts/`).

Apply: `npm run db:schema` (uses `DATABASE_URL`).

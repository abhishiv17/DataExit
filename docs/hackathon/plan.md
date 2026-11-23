# Hackathon execution plan

## Milestone 1 — MVP core
- [ ] Gmail discovery via Claude connector (signup/welcome/OTP/receipt search queries)
- [ ] `company-directory` server with top 200 Indian apps (`servers/company-directory/data/companies.json`)
- [ ] Sensitivity tagging (`packages/shared/src/sensitivity.ts`)
- [ ] Graph widget for the data map (`apps/web`)

## Milestone 2 — Action layer
- [ ] `request-engine`: 6 request types in English and Hindi (`templates/`)
- [ ] Approval tiers in `packages/policy`
- [ ] Send via Gmail; deadlines into Google Calendar

## Milestone 3 — Follow-through
- [ ] Reply classifier (rules + LLM fallback)
- [ ] `tracker` server: status, evidence export
- [ ] Grievance-officer escalation draft; DPB complaint draft

## Milestone 4 — Everyday hook
- [ ] New-signup detection (scheduled scan)
- [ ] Weekly digest (chat + WhatsApp)
- [ ] *(if time)* Rural "Is this a scam?" voice flow

## Milestone 5 — Demo polish
- [ ] Seeded demo inbox (`demo/seed-inbox`)
- [ ] Wow-moment script rehearsed ([demo-script.md](demo-script.md))
- [ ] Company report-card mock

## Future scope
SMS companion · Sign in with Google audit · Breach Watch · Consent Manager integration · nominee and family mode · deletion verification · more regional languages · full rural assisted mode.

## Suggested team split

| Person | Owns |
| --- | --- |
| A | `company-directory` + directory data |
| B | `request-engine` + templates (EN/HI) |
| C | `packages/policy` + `tracker` + `db` |
| D | `apps/web` graph + demo inbox + pitch |

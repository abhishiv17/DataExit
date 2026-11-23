# Build plan (2 people): status

Two people build the MVP in 14 days. Person A owns the agent and MCP servers; Person B owns the data, interface, rural mode and demo. For a 36–48 hour hackathon, do Phases 1–3 only and use the cut list.

Status as of 24 Nov 2026: Person A's servers are built and tested (`npm test`, 16 tests). Person B's UI, directory and demo inbox are built on mock JSON. **Next: integration**: switch `apps/web/src/api.ts` from mocks to the MCP tools and move the UI onto the contract types (it uses `@dataexit/shared/ui` until then).

## Roles

| | Person A: agent and MCP servers | Person B: data, interface and demo |
| --- | --- | --- |
| Owns | Gmail discovery, Company Directory, Request Engine, Tracker, policy layer, Claude wiring | Directory dataset, sensitivity rules, templates (EN/HI), graph widget, digest and WhatsApp flow, rural flow, demo inbox, pitch |
| Hands off | Working MCP tools with stable JSON ([contract.md](../contract.md)) | Directory data, templates, UI that uses tool outputs |

## Day 0

- [x] Repo layout: `servers/` (A), `data/` (B), `docs/`. B's UI lives in `apps/web`.
- [ ] Google Cloud project, Gmail + Calendar APIs, both people as OAuth test users ([setup](../development/setup.md#real-gmail-and-calendar))
- [ ] Seeded demo Gmail account (B)
- [ ] Pick the demo name
- [x] Contract committed as [docs/contract.md](../contract.md)

## Phase 1: Discovery

Person A
- [x] Gmail server with OAuth (`npm run auth:google`); `discover_footprint` searches signup, OTP, receipt and welcome subjects, headers only
- [x] `lookup_company` by domain or SMS sender ID; CSV or Postgres (`DIRECTORY_SOURCE=postgres`)
- [x] Brand/legal-entity merge (brands share a directory row); `Footprint` rows written
- [x] Claude wiring: `.mcp.json` (Claude Code), Desktop config, HTTP mode for claude.ai

Person B
- [x] Directory dataset v1: 290 companies in `servers/company-directory/data/companies.csv` (7 verified grievance contacts so far; `npm run directory:check`)
- [x] Sensitivity rules: in code (`packages/shared/src/sensitivity.ts`); B to review weights
- [x] Seed the demo inbox (`npm run demo:seed`: `demo/seed-inbox/inbox.mbox` + `messages.json`)

## Phase 2: Data map

Person A
- [x] Prioritisation score 0-100 (sensitivity + breadth + dormancy); `top_risk_dormant`
- [x] Footprint JSON for the widget: `get_data_map` (cap 80 nodes + `others` cluster)

Person B
- [x] Graph widget, node detail (source email), multi-select (`apps/web`, on mock JSON)

## Phase 3: Requests with approval

Person A
- [x] `draft_request` fills B's templates (company, account, last interaction, legal basis)
- [x] Policy layer: tiers, 10-minute undo window, hash-chained `AuditEvent`
- [x] `send_request` from the user's Gmail + Calendar event at the deadline
- [x] Retention check: banks, brokers, telecoms, insurers, health → `restrict` instead of `erase`
- [x] Send safety: `SEND_MODE` dry_run / sandbox / live, hourly limit

Person B
- [x] Templates for 6 types × EN/HI exist (plus reminder and escalations); need legal review and native-speaker check
- [x] Approval screen (on mock JSON; wire to `approve_request` / `send_request`)

## Phase 4: Follow-through and everyday hook

Person A
- [x] `list_requests`, `check_replies`, `classify_reply` (confirmed / id_requested / refused_retention / redirected; unclear → agent)
- [x] Escalation: reminder → grievance officer → DPB complaint draft; `export_evidence` (ZIP)
- [x] New-signup detection: `check_new_signups` for a scheduled task; `weekly_digest`

Person B
- [x] Digest bubble, status timeline view, seeded demo replies (UI mock-ups)
- [ ] WhatsApp delivery

## Phase 5: Rural mode, polish, pitch

Person A
- [x] `check_scam`: verdict, reasons, next steps (1930, cybercrime.gov.in, Chakshu, bank), EN/HI reply text with the safety line
- [x] Hardening: structured errors, Gmail rate limiting and retries, send limit, stderr logging, `delete_my_data`

Person B
- [x] Rural scam-check mock-up with voice in/out, SIM-check and loan-app quick replies; company report card; demo script; pitch deck
- [ ] Backup video

## Integration points

| Day | From → To | Hand-off | Status |
| --- | --- | --- | --- |
| 2 | B → A | Directory CSV v1 | CSV loader ready; waiting on data |
| 3 | A → B | `discover_footprint` JSON | ready |
| 6 | B → A | Templates 6 × 2 | in repo, need review |
| 8 | A → B | `draft_request`, `approve_request`, `send_request` | ready |
| 11 | A → B | `list_requests`, `classify_reply` | ready |

## Cut list (from the top)
1. WhatsApp → digest in chat
2. Voice in the rural flow → Hindi text
3. Evidence bundle → audit log on screen
4. Hindi templates → English only
5. Never cut: discovery, graph, approval tiers, sending

## Risks

| Risk | Owner | Mitigation | Status |
| --- | --- | --- | --- |
| Gmail OAuth verification blocks sending | A | Test users on an unverified app; demo account | Flow built; needs the Cloud project |
| Wrong or missing grievance emails | B | Top 200 first; mark unverified; support-email fallback | Fallback and no-recipient block built |
| Real requests sent to companies in testing | A | `SEND_MODE=sandbox` until demo day | Built and tested |
| Graph too slow | B | Cap 80 nodes; cluster the rest | Cap and cluster in `get_data_map` |
| Integration slips | Both | Fixture mailbox + contract from day 1 | Fixture backend built |

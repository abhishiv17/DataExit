# CLAUDE.md

Context for AI assistants working in this repo.

## What this is
Data Exit (brand candidate: **Wapas**) is a hackathon project: an MCP-powered agent that helps Indian users discover which companies hold their personal data and exercise their DPDP Act 2023 rights (withdraw consent, access, correct, erase, restrict use). It runs through apps users already have (Gmail, Calendar, WhatsApp, SMS). Rural mode adds a voice-first scam shield.

Full background: `docs/README.md`. Product: `docs/product/`. Law: `docs/legal/dpdp-act.md`. Architecture: `docs/architecture/`.

## Stack
- TypeScript, npm workspaces, Node 22+. `npm test` builds and runs everything.
- MCP servers use `@modelcontextprotocol/sdk` (stdio, or HTTP with `--http`), input schemas in `zod`, registered via `defineTool` in `packages/runtime`.
- Each server: `src/ops.ts` (logic, tested directly), `src/tools.ts` (MCP registration), `src/index.ts` (standalone entry). `servers/dataexit` runs all tools in one process.
- Gmail/Calendar via our own OAuth client (`packages/google`) so the policy layer gates every send; `GMAIL_BACKEND=fixture` for offline work.
- Storage: JSON file by default, Postgres when `DATABASE_URL` is set (`packages/store`).
- Logs go to stderr only (stdout is the MCP channel).

## Ground rules (do not break)
1. **Every action goes through `packages/policy`.** No MCP tool sends anything without an approval tier check and an audit event.
2. **Approval tiers:** `auto` (stop marketing) runs without asking only when the user enabled `auto_low_risk`; `one_tap` (withdraw consent, access, correction, restrict) needs approval; `full_review` (erasure; any request to banks, insurers, government, health) needs the full text shown, `reviewed: true`, and a 10-minute undo window before sending.
3. **Retention overrides:** RBI_KYC, PMLA, SEBI, TELECOM, INSURANCE and MEDICAL turn erasure into `restrict`; TAX does not. Never escalate a valid retention refusal of erasure.
8. **Send safety:** keep `SEND_MODE=sandbox` until demo day. Live sends go to real companies.
9. **Contract:** `docs/contract.md` is shared with Person B's UI. Add fields; do not rename or remove contract fields.
4. **Privacy by design:** Gmail metadata first; never store email bodies; SMS parsed on device; never auto-share ID documents.
5. **Rural bot never asks for OTP, PIN or Aadhaar**, and says so in every conversation.
6. **Legal labelling:** before 13 May 2027, requests are "policy-based / courtesy" requests. DPDP section numbers in templates are flagged `[verify]` until checked.
7. Every suggestion must cite its source (the email/SMS it came from).

## Conventions
- Workspace package names: `@dataexit/<name>`.
- Shared types live only in `packages/shared`; import from there.
- Request templates: `servers/request-engine/templates/<lang>/<request_type>.md`, first line `Subject:`, with `{{placeholders}}`.
- Expected failures throw `UserFacingError` / `PolicyError` with a code and hint; they reach the agent as `isError` results.
- Do not invent grievance-officer contacts; leave `null` with `verified: false` until sourced.

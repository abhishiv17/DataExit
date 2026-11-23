# CLAUDE.md

Context for AI assistants working in this repo.

## What this is
Data Exit (brand candidate: **Wapas**) is a hackathon project: an MCP-powered agent that helps Indian users discover which companies hold their personal data and exercise their DPDP Act 2023 rights (withdraw consent, access, correct, erase, restrict use). It runs through apps users already have (Gmail, Calendar, WhatsApp, SMS). Rural mode adds a voice-first scam shield.

Full background: `docs/README.md`. Product: `docs/product/`. Law: `docs/legal/dpdp-act.md`. Architecture: `docs/architecture/`.

## Stack
- TypeScript, npm workspaces, Node 20+.
- MCP servers use `@modelcontextprotocol/sdk` over stdio, input schemas in `zod`.
- Postgres (`db/schema.sql`), plus an encrypted per-user store.
- Claude is the agent; Gmail and Google Calendar come from Claude's built-in connectors, not from our code.

## Ground rules (do not break)
1. **Every action goes through `packages/policy`.** No MCP tool sends anything without an approval tier check and an audit event.
2. **Approval tiers:** low (unsubscribe, marketing opt-out) can auto-run once enabled; medium (withdraw consent, access, correction) needs one-tap approval; high (erasure; banks, insurers, government, health) needs full review plus a 10-minute undo window.
3. **Retention overrides:** RBI KYC, PMLA, telecom, tax and medical rules beat erasure. For those companies, propose `restrict_use`, never `erase`, and never escalate them for refusing erasure.
4. **Privacy by design:** Gmail metadata first; never store email bodies; SMS parsed on device; never auto-share ID documents.
5. **Rural bot never asks for OTP, PIN or Aadhaar**, and says so in every conversation.
6. **Legal labelling:** before 13 May 2027, requests are "policy-based / courtesy" requests. DPDP section numbers in templates are flagged `[verify]` until checked.
7. Every suggestion must cite its source (the email/SMS it came from).

## Conventions
- Workspace package names: `@dataexit/<name>`.
- Shared types live only in `packages/shared`; import from there.
- Request templates: `servers/request-engine/templates/<lang>/<request_type>.md`, with `{{placeholders}}`.
- Do not invent grievance-officer contacts; leave `null` with `verified: false` until sourced.

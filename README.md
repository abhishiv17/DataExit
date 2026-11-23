# Data Exit (working name: Wapas)

> An MCP-powered personal agent that finds every company holding an Indian user's personal data and helps them withdraw consent, correct it or erase it under the **DPDP Act, 2023**. It works inside the apps people already use (Gmail, Calendar, WhatsApp), and the user approves every sensitive action.

**Rural mode** extends the same agent into a voice-first scam shield for village users.

> "City users need to take back their data. Village users need to stop losing their savings. The same agent does both."

## Quick start

```bash
npm install
npm test        # build + 16 tests (unit, Postgres store, end-to-end, MCP protocol)
npm start       # all-in-one MCP server on stdio, offline fixture mailbox
```

Claude Code picks up the server from [.mcp.json](.mcp.json). Real Gmail, Claude Desktop and claude.ai setup: [docs/development/setup.md](docs/development/setup.md).

## Tools

`discover_footprint` · `get_data_map` · `check_new_signups` · `lookup_company` · `get_retention_rules` · `draft_request` · `approve_request` · `undo_request` · `reject_request` · `send_request` · `list_requests` · `check_replies` · `classify_reply` · `escalate_request` · `export_evidence` · `weekly_digest` · `get_audit_log` · `delete_my_data` · `check_scam` and more. Reference: [docs/architecture/mcp-servers.md](docs/architecture/mcp-servers.md). Shared types: [docs/contract.md](docs/contract.md).

## Repository layout

```
DataExit/
├── docs/                     Product, legal, architecture, contract, build plan (start at docs/README.md)
├── servers/company-directory/data/companies.csv   Company Directory dataset (Person B, 290 companies)
├── packages/
│   ├── shared/               Contract types, sensitivity scoring, DPDP constants
│   ├── policy/               Approval tiers, approval state machine, hash-chained audit log
│   ├── store/                JSON-file and Postgres stores
│   ├── google/               OAuth, Gmail (headers-only search, UTF-8 send), Calendar, offline fixtures
│   ├── directory/            Directory loader: domains, SMS sender ids, brand merge
│   └── runtime/              Config, logging, context, MCP tool wrapper
├── servers/
│   ├── discovery/            discover_footprint, get_data_map, check_new_signups
│   ├── company-directory/    lookup_company, get_retention_rules, …
│   ├── request-engine/       draft/approve/undo/reject/send + EN/HI templates
│   ├── tracker/              replies, escalation, evidence ZIP, digest, audit, delete
│   ├── scam-shield/          check_scam (rural mode)
│   ├── dataexit/             all tools in one server (stdio or --http) + CLI scripts
│   └── breach-watch/         (future)
├── apps/                     web graph, WhatsApp bot, Android SMS (Person B / future)
├── db/schema.sql             Postgres schema
├── tests/                    unit, store contract, end-to-end, MCP protocol
└── demo/                     demo persona and seeded inbox (Person B)
```

## Status

Person A's work (all five phases) is built and tested. Person B's work is open. See [docs/hackathon/build-plan.md](docs/hackathon/build-plan.md).

## Disclaimer

Data Exit is not a legal service. Templates are drafts that need lawyer review before real use. Before **13 May 2027**, data-principal rights under the DPDP Rules are not yet in force; requests sent before then are policy-based (courtesy) requests.

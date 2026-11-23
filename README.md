# Data Exit (working name: Wapas)

> An MCP-powered personal agent that finds every company holding an Indian user's personal data and helps them withdraw consent, correct it or erase it under the **DPDP Act, 2023**. It works inside the apps people already use (Gmail, SMS, Calendar, WhatsApp), and the user approves every sensitive action.

**Rural mode** extends the same agent into a voice-first scam shield for village users.

> "City users need to take back their data. Village users need to stop losing their savings. The same agent does both."

---

## Repository layout

```
DataExit/
├── docs/                     Product, legal, architecture and hackathon docs (start at docs/README.md)
├── packages/
│   ├── shared/               Domain types: Company, Footprint, Request, AuditEvent, sensitivity, tiers
│   └── policy/               Policy & approval layer: tier rules, undo window, hash-chained audit log
├── servers/                  Our own MCP servers
│   ├── company-directory/    Grievance contacts, data categories, retention rules
│   ├── request-engine/       Drafts DPDP requests (EN/HI), deadlines, reply classification
│   ├── tracker/              Request tracker, evidence locker, DPB complaint drafts
│   └── breach-watch/         (future) breach alerts
├── apps/
│   ├── web/                  Chat-side UI: data-map graph, approvals
│   ├── whatsapp-bot/         WhatsApp digest, quick approvals, rural "Is this a scam?"
│   └── android-sms/          (future) on-device SMS/OTP signup scanner
├── db/                       Postgres schema and migrations
├── demo/                     Seeded demo inbox and wow-moment script assets
└── scripts/                  Dev utilities
```

## Quick start

```bash
npm install
npm run build
# run an MCP server locally (stdio)
npm run dev -w @dataexit/company-directory
```

Add the servers to Claude as custom connectors / MCP servers (see [docs/development/setup.md](docs/development/setup.md)).

## Status

Hackathon scaffold, as of 23 Nov 2026. See [docs/hackathon/plan.md](docs/hackathon/plan.md) for milestones.

## Disclaimer

Data Exit is not a legal service. Templates are drafts that need lawyer review before real use. Before **13 May 2027**, data-principal rights under the DPDP Rules are not yet in force; requests sent before then are policy-based (courtesy) requests.

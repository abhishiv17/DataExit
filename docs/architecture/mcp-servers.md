# MCP servers

Every server registers its tools through `defineTool` in [`packages/runtime`](../../packages/runtime/src/mcp.ts): uniform JSON results, structured errors, stderr-only logging. State lives in the store (JSON file or Postgres), so the servers can run as one process or several.

| Run as | Command | When |
| --- | --- | --- |
| **All-in-one** (recommended) | `node servers/dataexit/dist/index.js` | Claude Code / Desktop, demo. One connector, works with the JSON-file store. |
| All-in-one over HTTP | `node servers/dataexit/dist/index.js --http` | claude.ai custom connector (needs `MCP_HTTP_SECRET`) |
| Separate servers | `servers/<name>/dist/index.js` | Matches the architecture diagram; set `DATABASE_URL` so they share state |

Gmail and Calendar are accessed by **our** servers through the Gmail/Calendar APIs (OAuth via `npm run auth:google`), so the policy layer can gate every send. Offline, the fixture mailbox stands in (`GMAIL_BACKEND=fixture`).

## discovery — [servers/discovery](../../servers/discovery)

| Tool | Does |
| --- | --- |
| `discover_footprint` | Searches Gmail **headers only** for signup, OTP, order, receipt and KYC subjects; drops personal senders; maps domains to companies (brands merge under one legal entity; unknown senders kept as `unknown:<domain>`); scores and saves footprints. Full scans replace counts, incremental scans add. |
| `get_data_map` | Graph JSON: headline, nodes sorted by score (cap 80), `others` cluster, `top_risk_dormant`. |
| `check_new_signups` | Incremental scan since the last scan; privacy summary and auto-expiry suggestion per new company. For a scheduled task. |

## company-directory — [servers/company-directory](../../servers/company-directory)

| Tool | Does |
| --- | --- |
| `lookup_company` | By id, email domain (parent domains match), SMS sender ID (`VM-HDFCBK-S` → `HDFCBK`) or brand/legal name. |
| `get_retention_rules` | What a requested type becomes for this company, why, and its tier. |
| `report_contact` | Queues a crowd-reported contact in `.data/directory-reports.jsonl` for review. |
| `directory_status` | Size and data-quality issues. |

## request-engine — [servers/request-engine](../../servers/request-engine)

| Tool | Does |
| --- | --- |
| `draft_request` | Drafts for many companies at once. Retention check (erase → restrict for RBI_KYC, PMLA, SEBI, TELECOM, INSURANCE, MEDICAL), tier, template fill (EN/HI), policy-based wording before 13 May 2027, recipient = grievance email → support email → override. Skips duplicates. Auto-approves `auto` tier only when the user enabled `auto_low_risk`. |
| `approve_request` | User approval. `full_review` needs `reviewed: true` and starts the undo window. |
| `undo_request` / `reject_request` | Back to draft / cancel. |
| `send_request` | Sends approved requests whose window has ended, from the user's Gmail; creates the Calendar deadline event. Honours `SEND_MODE`, hourly send limit, no-recipient block. Reminders and same-recipient escalations reply in the original thread. |
| `get_request`, `set_preferences` | |

## tracker — [servers/tracker](../../servers/tracker)

| Tool | Does |
| --- | --- |
| `list_requests` | Marks overdue `sent` requests `no_reply` first. |
| `check_replies` | Reads new messages in each request's thread (bodies transiently), classifies by rules: confirmed / id_requested / refused_retention / redirected / acknowledged. Unclear ones go to `needs_review` for the agent. |
| `classify_reply` | Rules-only classification of text, or records a classification (the agent's when the rules were unclear). |
| `escalate_request` | Ladder reminder (after 30 days) → grievance officer (after the deadline or a refusal) → DPB complaint draft (after the grievance officer's period). Refuses for confirmed, ID requested, or a valid retention refusal of erasure. Creates a linked draft that goes through approve/send. |
| `export_evidence` | ZIP in `.data/evidence/`: requests, timeline, Gmail ids, sent texts, full audit chain and its verification. |
| `weekly_digest` | Counts, new signups, replies, upcoming deadlines, escalation candidates, ready text (en/hi). |
| `get_audit_log` | Events and chain verification. |
| `delete_my_data` | `confirm: "DELETE"`: store, evidence and Google token. |

## scam-shield — [servers/scam-shield](../../servers/scam-shield)

| Tool | Does |
| --- | --- |
| `check_scam` | Weighted red-flag rules (OTP/PIN/Aadhaar requests, KYC and block threats, fake officials/"digital arrest", prizes, remote-access apps, task jobs, loan apps, investment, scheme impersonation, wrong-transfer refunds, urgency) plus link checks (shorteners, risky TLDs, brand lookalikes). Verdict `scam / likely_scam / suspicious / no_red_flags` (never "safe"), reasons and next steps in en/hi, after-fraud mode (1930 first), and the safety line in every reply. Nothing stored. |

## Typical agent flow

```
"Who has my data?"     → discover_footprint → get_data_map (widget)
User picks 12          → draft_request(company_ids, "erase")  → 10 erase + 2 restrict
User reviews/approves  → approve_request(reviewed: true) → (10 min) → send_request
Scheduled, weekly      → check_replies → classify_reply for needs_review → weekly_digest
"Escalate?" yes        → escalate_request → approve_request → send_request
```

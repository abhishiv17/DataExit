# MCP servers

Tool names are `snake_case`. Every tool that sends, changes or deletes something goes through `packages/policy` (`authorize()` → audit event) before doing it.

## Provided by Claude connectors (not built by us)

| Connector | Used for |
| --- | --- |
| Gmail | Search signup/welcome/OTP/receipt mail (metadata first); send requests from the user's own address; read replies |
| Google Calendar | Response deadlines and reminders |
| Scheduled tasks | Weekly re-scan and follow-ups (instead of instant reaction to new mail) |

## `company-directory` — [servers/company-directory](../../servers/company-directory)

Curated directory of Indian companies: domains, grievance contacts, data categories, retention duties.

| Tool | Input | Output |
| --- | --- | --- |
| `lookup_company` | `domain` or `name` | Company record, or `null` |
| `match_senders` | list of sender domains (from Gmail metadata) | Matched companies + unmatched domains |
| `get_retention_rules` | `company_id` | Retention duties (e.g. RBI KYC) and the recommended request type |
| `report_contact` | `company_id`, contact, source | Crowd-reported contact queued for review |

## `request-engine` — [servers/request-engine](../../servers/request-engine)

| Tool | Input | Output |
| --- | --- | --- |
| `recommend_request` | `company_id`, user goal | Best request type (respects retention rules) + tier |
| `draft_request` | `company_id`, `request_type`, `language` (en/hi), user details | Subject, body, recipient, legal basis label, tier |
| `compute_deadline` | `sent_at` | Deadline (90 days) + reminder dates |
| `classify_reply` | reply text/metadata | `confirmed` · `id_requested` · `rejected_retention` · `acknowledged` · `other` |

## `tracker` — [servers/tracker](../../servers/tracker)

| Tool | Input | Output |
| --- | --- | --- |
| `record_request` | request draft + approval token | Stored request with status `sent` |
| `list_requests` | filters (status, overdue) | Requests |
| `update_status` | `request_id`, new status, evidence ref | Updated request |
| `export_evidence` | `request_id` | Evidence bundle (timeline, message IDs, audit chain) |
| `draft_escalation` | `request_id`, level (`grievance_officer` / `dpb`) | Draft for user review |
| `weekly_digest` | — | Summary for WhatsApp/chat |

## `breach-watch` (future) — [servers/breach-watch](../../servers/breach-watch)

| Tool | Output |
| --- | --- |
| `check_breaches` | Known breaches affecting companies in the user's footprint |

## Agent tool-use sketch

```
User: "Who has my data?"
 → gmail.search (signup/welcome/receipt/OTP, metadata only)
 → company-directory.match_senders
 → render data map (apps/web)
User taps 12 high-sensitivity companies
 → request-engine.recommend_request ×12   (2 banks → restrict_use)
 → request-engine.draft_request ×12
 → policy.authorize (user approves)
 → gmail.send ×12 → tracker.record_request ×12 → calendar.create_event ×12
Later (scheduled)
 → gmail.search replies → request-engine.classify_reply → tracker.update_status
 → tracker.weekly_digest → WhatsApp
```

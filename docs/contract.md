# Interface contract (Person A ↔ Person B)

The shared shapes both halves build against. **Source of truth in code:** [`packages/shared/src/types.ts`](../packages/shared/src/types.ts). Changes are agreed by both and updated here the same day.

Fields in the build-plan contract are unchanged. Extra fields marked *ext* are additive; the UI may ignore them.

## Company

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | slug |
| `legal_name` | string | |
| `brands` | string[] | brands under one legal entity merge into one company |
| `domains` | string[] | |
| `sms_sender_ids` | string[] | normalised (`HDFCBK`) |
| `grievance_email` | string \| null | |
| `data_categories` | string[] | `contact device behavioural transaction location communications inferred financial gov_id health biometric children` |
| `sensitivity` | `"low" \| "med" \| "high"` | |
| `retention_rule` | string \| null | `RBI_KYC`, `PMLA`, `SEBI`, `TELECOM`, `INSURANCE`, `MEDICAL`, `TAX`; several joined with `|` |
| *ext* `sector`, `grievance_verified`, `grievance_source`, `support_email` | | |

## Footprint

| Field | Type | Notes |
| --- | --- | --- |
| `user_id`, `company_id` | string | `company_id` is `unknown:<domain>` for senders not in the directory |
| `first_seen`, `last_interaction` | ISO string | |
| `evidence_message_ids` | string[] | earliest signup proof first, then newest; max 20 |
| `sensitivity_score` | 0-100 | see *Prioritisation* |
| *ext* `matched`, `display_name`, `domains`, `message_count` | | |
| *ext* `signals` | `{ otp?, signup?, welcome?, account?, receipt?: number }` | messages per signal. otp/signup/welcome/account prove an account; receipt (orders, payments, deliveries, wallet top-ups) proves use. Marketing is not counted. |
| *ext* `signed_up_at` | ISO \| null | earliest signup, welcome or OTP email |
| *ext* `evidence` | `{ message_id, date, kind, subject, from_domain }[]` | "why we found it"; subjects are headers with 4+ digit runs masked (no OTP codes stored) |

`last_interaction` is the newest signup, OTP, account or receipt email. A newsletter never makes an account look active.

### Prioritisation (`sensitivity_score`)

`score = most sensitive category weight (contact 15 … gov_id/health 65, biometric/children 70) + breadth (2 per extra category, max 10) + dormancy (6+ months 5, 1+ year 12, 3+ years 20)`, capped at 100. Unknown companies start at 10.

## DataRequest

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `company_id` | string | |
| `type` | `stop_marketing \| withdraw_consent \| access \| correct \| erase \| restrict` | |
| `legal_basis` | string | DPDP section cited, marked `[verify]` |
| `language` | `en \| hi` | |
| `body` | string | |
| `tier` | `auto \| one_tap \| full_review` | |
| `status` | `draft \| approved \| sent \| confirmed \| id_requested \| refused_retention \| redirected \| no_reply \| escalated` | |
| `sent_at`, `deadline` | ISO \| null | deadline = sent + 90 days |
| `replies` | `{ message_id, received_at, classification }[]` | `classification: "sent"` means an acknowledgement only. *ext* `classified_by`, `redirect_to` |
| *ext* | | `subject`, `recipient`, `company_name`, `requested_type`, `retention_note`, `enforceability` (`policy_based` before 13 May 2027), `approved_at`, `undo_until`, `cancelled_at`, Gmail/Calendar ids, `source_message_ids`, `parent_id` + `escalation_level` (`reminder \| grievance_officer \| dpb`), `sendable` (false for DPB drafts) |

## AuditEvent

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `actor` (`agent \| user`), `action`, `timestamp` | | |
| `approval` | `auto \| approved \| rejected \| undone \| null` | |
| `prev_hash` | string | hash chain |
| *ext* `user_id`, `seq`, `target`, `details`, `hash` | | `hash = sha256(prev_hash + canonical JSON of the event without hash)` |

## Tools

All tools return JSON text. Expected failures come back with `isError: true` and `{ "error": CODE, "message", "hint" }`. Full reference: [architecture/mcp-servers.md](architecture/mcp-servers.md).

Contract names: `discover_footprint`, `lookup_company`, `draft_request`, `approve_request`, `send_request`, `list_requests`, `classify_reply`, `escalate_request`, `export_evidence`, `check_scam`.

Also available: `get_data_map`, `check_new_signups`, `get_retention_rules`, `report_contact`, `directory_status`, `undo_request`, `reject_request`, `get_request`, `set_preferences`, `check_replies`, `weekly_digest`, `get_audit_log`, `delete_my_data`.

## What Person B consumes

| B's piece | Call | Use |
| --- | --- | --- |
| Data-map graph | `get_data_map` | `headline`, `headline_text`, `nodes[]` (≤80, sorted by score), `others` cluster, `top_risk_dormant` |
| Node click "why found" | node `evidence` (kind, date, subject; up to 3) and `evidence_message_ids` | Gmail link `https://mail.google.com/mail/u/0/#all/<id>` |
| Approval screen | `draft_request` → `approve_request` → `send_request`; `undo_request` | show `tier`, `retention_note`, full `body` for `full_review`, countdown to `undo_until` |
| Status timeline | `list_requests`, `get_audit_log` | |
| Digest / WhatsApp | `weekly_digest` | `text` is ready to send (en/hi) |
| Rural flow | `check_scam` | `reply_text` for TTS; `safety_line` banner; `next_steps` |
| Templates | `servers/request-engine/templates/<lang>/<type>.md` | placeholders listed in that folder's README; `{{last_interaction}}` is also available |

## Current web UI mock shapes (Person B, pre-contract)

The web app (`apps/web`) still runs on mock JSON made by `npm run demo:seed`, using the pre-contract types now exported as `@dataexit/shared/ui` (camelCase fields, tiers `low/medium/high`, `restrict_use`). When the UI switches to live tools, it moves to the contract above; the swap points are in [`apps/web/src/api.ts`](../apps/web/src/api.ts). Until then this section documents what the UI expects.

The directory is edited in [`servers/company-directory/data/companies.csv`](../servers/company-directory/data/companies.csv) (Person B's columns, `;`-separated lists). The MCP servers read that file directly and map its names onto the contract (`government_id` → `gov_id`, `rbi_kyc` → `RBI_KYC`, …); `npm run directory:build` still produces `companies.json` for the demo generator.

### Company (directory, owned by B, served by A)

Edited in [`servers/company-directory/data/companies.csv`](../servers/company-directory/data/companies.csv),
compiled to `companies.json` by `npm run directory:build` (validates sectors, categories, retention duties, duplicate domains).

`Company`: `id, name, domains[], sector, dataCategories[], retentionDuties[], grievance{email,url,officerName,verified,source,lastChecked}, privacyPolicyUrl`

- Empty `data_categories` in the CSV means the sector default (`SECTOR_DEFAULT_CATEGORIES`).
- Grievance contacts stay `null` / `verified: false` until sourced. `verified: true` requires `source`.
- Sensitivity: `sensitivityScore(categories)` → 1–12; `sensitivityBand(score)` → low (1–4) / medium (5–7) / high (8–12).
- Not yet in the type: SMS sender IDs (`sms_sender_ids` in the build plan). Add when the SMS companion starts.

### discover_footprint → `FootprintResult`

```ts
{ userId, scannedAt, unmatchedDomains: string[], footprints: FootprintView[] }

FootprintView {
  footprintId, firstSeen, lastSeen, discoveredVia[], sensitivity, highSensitivity, status,
  company: { id, name, sector, domains, dataCategories, retentionDuties, grievanceVerified },
  evidence: { messageId, date, from, subject, kind }[]   // Gmail metadata only, never bodies
}
```

`kind`: `signup | welcome | otp | receipt | newsletter | reply`. `evidence` is what the UI shows under "Why we found it" (ground rule 7: cite the source).

### draft_request → `Draft`

Current request-engine output plus the fields the approval screen needs. The mock has one draft per open footprint, for goal `erase`, in both languages:

```ts
{ companyId, companyName, sector, goal, requestType, changed, reason, tier, legalBasis,
  recipient, needsRecipient, sourceRef, en: {subject, body, missing[]}, hi: {subject, body, missing[]} }
```

`changed: true` means the engine switched erase → `restrict_use` because of a retention duty; `reason` names the law.
**Ask for A:** return both languages (or let the UI call twice), plus `sourceRef` and `reason`.

### list_requests → `TrackedRequest[]`

As in `servers/tracker`: `id, companyId, companyName, type, status, sentAt, deadlineAt, gmailMessageId, calendarEventId, sourceRef, evidence[]`.
The mock adds `escalation: {en, hi}` (rendered `escalation_grievance_officer`) on overdue rows. **Ask for A:** `draft_escalation` should return rendered text, not just template vars.
*ext* (added): `next_action` on top-level rows (`null` on escalation rows): `{ action: "approve" | "send" | "file_personally", request_id, level? }`, `{ action: "escalate", level }`, `{ action: "wait", until }`, or `{ action: "verify_identity" | "offer_restrict" | "none" }`. Use it for the row's button. `escalate_request` now returns rendered text in `draft.subject` / `draft.body`, plus `recipient_source`.

### AuditEvent

`userId, seq, at, actor, action, target, sourceRef, details, prevHash, hash`, where `hash = sha256(prevHash + canonicalJson(event))`.
The UI mirrors this in the browser (`apps/web/src/audit.ts`) until approve/send go through the policy layer.

### check_scam → `ScamCheck` (rural mode)

```ts
{ verdict: "scam" | "suspicious" | "no_signals",
  signals: { id, label: {hi, en}, strong }[],
  summary: {hi, en}, nextSteps: {hi, en}[], neverAsk: {hi, en} }
```

Never returns "safe": `no_signals` still reminds the user not to share an OTP or PIN. `neverAsk` is always present (ground rule 5).
The UI mock is rule-based (`apps/web/src/scam.ts`); the real tool can let the agent decide and fill the same shape.

### Tool names (MCP)

`discover_footprint, lookup_company, draft_request, approve_request, send_request, list_requests, classify_reply, escalate_request, export_evidence, check_scam` (rural).
Current servers also expose `match_senders, get_retention_rules, recommend_request, compute_deadline, record_request, update_status, draft_escalation, weekly_digest`.

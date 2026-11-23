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
| `evidence_message_ids` | string[] | newest first, max 20 |
| `sensitivity_score` | 0-100 | see *Prioritisation* |
| *ext* `matched`, `display_name`, `domains`, `message_count` | | |

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
| Node click "why found" | node `evidence_message_ids` | Gmail link `https://mail.google.com/mail/u/0/#all/<id>` |
| Approval screen | `draft_request` → `approve_request` → `send_request`; `undo_request` | show `tier`, `retention_note`, full `body` for `full_review`, countdown to `undo_until` |
| Status timeline | `list_requests`, `get_audit_log` | |
| Digest / WhatsApp | `weekly_digest` | `text` is ready to send (en/hi) |
| Rural flow | `check_scam` | `reply_text` for TTS; `safety_line` banner; `next_steps` |
| Templates | `servers/request-engine/templates/<lang>/<type>.md` | placeholders listed in that folder's README; `{{last_interaction}}` is also available |

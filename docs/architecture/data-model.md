# Data model

Field-by-field definitions are in the interface contract: [docs/contract.md](../contract.md). TypeScript: [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts). SQL: [`db/schema.sql`](../../db/schema.sql).

```mermaid
erDiagram
  COMPANY ||--o{ FOOTPRINT : "appears in"
  USER ||--o{ FOOTPRINT : has
  FOOTPRINT ||--o{ REQUEST : "acted on by"
  REQUEST ||--o{ REQUEST : "escalated by (parent_id)"
  REQUEST ||--o{ AUDIT_EVENT : logs
  USER ||--|| USER_SETTINGS : has
```

## Storage

| Store | When | Notes |
| --- | --- | --- |
| `FileStore` (`.data/store.json`) | default, all-in-one server | one JSON file, writes serialised in-process, atomic rename |
| `SqlStore` (Postgres) | `DATABASE_URL` set | footprints/requests/settings as JSONB documents with indexed columns; audit events as columns; appends serialised per user with an advisory lock |

Both implement the same `Store` interface ([`packages/store`](../../packages/store/src/types.ts)) and pass the same contract test. The Postgres path is tested on PGlite (Postgres compiled to WebAssembly), not yet on a hosted Postgres.

## Request lifecycle

```mermaid
stateDiagram-v2
  [*] --> draft: draft_request
  draft --> approved: approve_request (auto tier with auto mode, or user)
  approved --> draft: undo_request
  draft --> cancelled: reject_request
  approved --> sent: send_request (after undo window)
  sent --> confirmed
  sent --> id_requested
  sent --> refused_retention
  sent --> redirected
  sent --> no_reply: deadline passes
  no_reply --> escalated: escalate_request (grievance officer / DPB)
  refused_retention --> escalated: only if no valid retention duty
```

Escalations are child requests (`parent_id`, `escalation_level`) that go through the same approve/send pipeline. DPB complaint drafts have `sendable: false`.

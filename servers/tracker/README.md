# tracker MCP server

Request tracker, evidence locker and escalation drafts. Every state change appends a hash-chained audit event via `@dataexit/policy`.

Tools: `record_request`, `list_requests`, `update_status`, `export_evidence`, `draft_escalation`, `weekly_digest`. Spec: [docs/architecture/mcp-servers.md](../../docs/architecture/mcp-servers.md).

Storage is in-memory for now. Next step: back it with the `requests` and `audit_events` tables in [db/schema.sql](../../db/schema.sql).

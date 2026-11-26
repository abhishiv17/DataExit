# tracker MCP server

Tracks sent requests to an outcome: reads replies, classifies them, walks the escalation ladder, and exports evidence. Every state change appends a hash-chained audit event via `@dataexit/policy`.

Tools: `list_requests`, `check_replies`, `classify_reply`, `escalate_request`, `export_evidence`, `weekly_digest`, `get_audit_log`, `delete_my_data`. Spec: [docs/architecture/mcp-servers.md](../../docs/architecture/mcp-servers.md).

- **Replies:** rules first ([src/classify.ts](src/classify.ts)); unclear replies come back in `needs_review` for the agent to classify with `classify_reply`. Bodies are read transiently and never stored. A recorded classification must name a company reply in that request's own Gmail thread and keeps the message's date.
- **Ladder:** `planEscalation` in [src/ops.ts](src/ops.ts) is the single decision used by `escalate_request` and by `list_requests`' `next_action`. Redirects and refusals skip the reminder; a redirect goes to the address in the company's reply. Valid retention refusals of erasure are never escalated.
- **Outcomes roll up:** when an escalation in its own thread (for example, to a grievance officer) is confirmed, the original request becomes `confirmed` too.
- **Storage:** whatever `@dataexit/store` provides: a JSON file by default, Postgres when `DATABASE_URL` is set.

Run standalone: `npm run dev -w @dataexit/tracker` (stdio). Tests: [tests/src/e2e.test.ts](../../tests/src/e2e.test.ts), [tests/src/tracker.test.ts](../../tests/src/tracker.test.ts).

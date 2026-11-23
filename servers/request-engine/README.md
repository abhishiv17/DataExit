# request-engine MCP server

Drafts DPDP requests in English and Hindi, picks the right request type, computes deadlines and classifies replies.

Tools: `recommend_request`, `draft_request`, `compute_deadline`, `classify_reply`. Spec: [docs/architecture/mcp-servers.md](../../docs/architecture/mcp-servers.md).

This server only **drafts**. Sending happens through Gmail after `@dataexit/policy` approval.

## Templates

`templates/<lang>/<request_type>.md`. The first line is `Subject: ...`; the rest is the body. Placeholders:

| Placeholder | Filled by |
| --- | --- |
| `{{company_name}}` | directory |
| `{{user_name}}`, `{{user_email}}`, `{{account_identifier}}` | user profile |
| `{{date}}` | today |
| `{{section_ref}}` | `SECTION_REFS` in `@dataexit/shared` (marked `[verify]`) |
| `{{legal_basis_note}}` | statutory vs. policy-based wording, by date |
| `{{deadline_days}}` | 90 |
| `{{correction_details}}` | `correct` only |
| `{{retention_law}}` | `restrict_use` only |
| `{{original_date}}`, `{{reference}}` | escalations only |

**All templates need lawyer review before real use.**

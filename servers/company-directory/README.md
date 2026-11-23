# company-directory MCP server

Curated directory of Indian companies: domains, sector, data categories, retention duties and grievance contacts.

Tools: `lookup_company`, `match_senders`, `get_retention_rules`, `report_contact`. Spec: [docs/architecture/mcp-servers.md](../../docs/architecture/mcp-servers.md).

## Data

`data/companies.json` holds the directory (target: top 200 Indian apps). Rules for entries:

- `grievance` contacts must come from the company's own privacy policy or grievance page. Record the URL in `source` and the date in `lastChecked`.
- Never guess an email. Leave `null` and `verified: false` until sourced.
- `retentionDuties` drive the erase → restrict-use switch. Banks, NBFCs, payment apps: `rbi_kyc` + `pmla`. Telecoms: `telecom_licence`.

The seed entries below have contacts deliberately left empty.

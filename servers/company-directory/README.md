# company-directory MCP server

Looks up companies in the directory: domains, SMS sender IDs, data categories, retention rules, grievance contacts.

Tools: `lookup_company`, `get_retention_rules`, `report_contact`, `directory_status`. Spec: [docs/architecture/mcp-servers.md](../../docs/architecture/mcp-servers.md).

Data comes from [data/companies.csv](data/companies.csv) (owned by Person B; columns in [scripts/build-directory.mjs](../../scripts/build-directory.mjs); both its column names and the contract names are accepted), or from the `companies` table when `DIRECTORY_SOURCE=postgres` (load it with `npm run db:seed-directory`).

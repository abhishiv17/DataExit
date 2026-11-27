# Local setup

## Prerequisites
- Node.js 22+
- For real Gmail: a Google Cloud project (below). For Postgres: any Postgres 14+ (optional).

## Install, build, test
```bash
npm install
cp .env.example .env
npm test            # builds everything, runs unit, store (incl. Postgres via PGlite), end-to-end and MCP protocol tests
```

## Run offline (no Google account)
With no Google token, the servers use the fixture mailbox at `GMAIL_FIXTURE` (default `demo/seed-inbox/messages.json`; format in [fixtures.md](fixtures.md)) and a fixture calendar in `.data/`.

```bash
npm start           # all-in-one server on stdio
```

## Connect to Claude Code
The repo's [.mcp.json](../../.mcp.json) registers the all-in-one server as `dataexit`. Build, then open the folder in Claude Code and approve the server. Recommended: keep `approve_request` and `send_request` on "ask every time" in Claude's tool permissions.

## Connect to Claude Desktop
Add to `claude_desktop_config.json`:
```json
{ "mcpServers": { "dataexit": { "command": "node", "args": ["<repo>/servers/dataexit/dist/index.js"] } } }
```

## Connect to claude.ai (custom connector)
```bash
MCP_HTTP_SECRET=<random 24+ chars> npm run start:http      # http://127.0.0.1:8787/mcp/<secret>
```
Expose it with a tunnel and add `https://<tunnel>/mcp/<secret>` as a custom connector. The secret in the path is the only protection: use the demo account, never a personal inbox, and stop the tunnel after the demo.

## Real Gmail and Calendar
1. Google Cloud console → new project → enable **Gmail API** and **Google Calendar API**.
2. OAuth consent screen: External, testing mode; add both team members and the demo account as **test users**.
3. Credentials → OAuth client ID → **Desktop app**. Put the id and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
4. `npm run build && npm run auth:google`, open the printed URL, sign in with the demo account. The token goes to `.data/google-token.json` (git-ignored).
5. Scopes: `gmail.readonly` (search needs it; discovery still reads headers only), `gmail.send`, `calendar.events`.

## Sending safety
| `SEND_MODE` | Effect |
| --- | --- |
| `dry_run` (default without `SANDBOX_EMAIL`) | Nothing sent; `send_request` returns previews |
| `sandbox` (default with `SANDBOX_EMAIL`) | Every email goes to `SANDBOX_EMAIL`, subject prefixed `[SANDBOX → real recipient]` |
| `live` | Real companies. Demo day only, from the demo account. |

Keep `sandbox` until demo day (build plan risk: "real requests sent to real companies in testing").

## Postgres (optional)
```bash
export DATABASE_URL=postgres://...
npm run db:migrate            # applies db/schema.sql
npm run db:seed-directory     # loads servers/company-directory/data/companies.csv into companies
DIRECTORY_SOURCE=postgres npm start
```
Needed only when running the servers as separate processes.

## Demo time travel
`DATAEXIT_NOW=2027-03-01T10:00:00+05:30` starts the clock at that moment (it keeps running), so requests sent today show as overdue and the escalation ladder can be demonstrated, while undo windows still elapse.

## Useful scripts
| Script | Does |
| --- | --- |
| `npm run directory:check` | Validates `servers/company-directory/data/companies.csv`, lists missing contacts and domain clashes |
| `npm run audit:verify` | Verifies the audit hash chain in the store |

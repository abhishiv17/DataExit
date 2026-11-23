# Local setup

## Prerequisites
- Node.js 20+
- PostgreSQL 15+ (optional for the first milestone; servers fall back to JSON files)

## Install and build
```bash
npm install
cp .env.example .env
npm run build
```

## Database
```bash
createdb dataexit
npm run db:schema
```

## Run an MCP server
Each server speaks MCP over stdio:
```bash
npm run dev -w @dataexit/company-directory
npm run dev -w @dataexit/request-engine
npm run dev -w @dataexit/tracker
```

## Connect to Claude Code
From the repo root, after `npm run build`:
```bash
claude mcp add dataexit-directory -- node servers/company-directory/dist/index.js
claude mcp add dataexit-requests  -- node servers/request-engine/dist/index.js
claude mcp add dataexit-tracker   -- node servers/tracker/dist/index.js
```

## Connect to Claude (web/desktop)
Custom connectors need a remote (HTTP) MCP endpoint. For the demo, either use Claude Desktop with local stdio servers, or wrap the servers with a Streamable HTTP transport and expose them (e.g. via a tunnel). Enable the Gmail and Google Calendar connectors in Claude's settings and check that Gmail send is allowed on your plan.

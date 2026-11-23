# ADR 0001: TypeScript monorepo with npm workspaces

- Status: accepted
- Date: 2026-11-23

## Context
The context doc allowed TypeScript or Python for the MCP SDK. We need several MCP servers, a shared domain model, a web graph widget and a WhatsApp webhook.

## Decision
One TypeScript monorepo using npm workspaces: `packages/*` (shared libraries), `servers/*` (MCP servers), `apps/*` (UIs and bots). MCP servers use `@modelcontextprotocol/sdk` over stdio with `zod` schemas.

## Consequences
- One language across servers, web UI and bot; shared types without duplication.
- Python-only libraries (if needed for classification) would run as a separate service.

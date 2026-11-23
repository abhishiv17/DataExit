# Architecture overview

## Layers

```mermaid
flowchart TB
  subgraph Channels["1. User channels"]
    CHAT[Claude chat<br/>data map, approvals]
    WA[WhatsApp bot<br/>digest, quick approvals, rural voice]
  end

  AGENT["2. Data Exit agent (Claude)<br/>plans and orchestrates tool calls"]

  POLICY["3. Policy & approval layer<br/>tiers · undo window · audit log<br/>(every tool call passes through)"]

  subgraph MCP["4. MCP servers"]
    direction LR
    subgraph Existing["Existing apps (Claude connectors / ours)"]
      GMAIL[Gmail]
      GCAL[Google Calendar]
      GACC[Google account<br/>Sign in with Google]
      SMS[SMS<br/>Android companion]
      WAS[WhatsApp / Telegram]
    end
    subgraph Ours["Our servers"]
      DIR[Company Directory]
      REQ[Request Engine]
      TRK[Tracker & Evidence Locker]
      SS[Scam Shield<br/>rural mode]
      BW[Breach Watch]
    end
  end

  STORE[("5. Encrypted storage<br/>directory · footprint · requests · audit log")]

  Channels --> AGENT --> POLICY --> MCP
  Ours --> STORE
```

| Layer | Where in repo |
| --- | --- |
| Channels | `apps/web`, `apps/whatsapp-bot` (Person B) |
| Agent | Claude; server instructions and tool descriptions in `packages/runtime/src/mcp.ts` and `servers/*/src/tools.ts` |
| Policy & approval | `packages/policy` (tiers, approval state machine, audit chain) |
| Our MCP servers | `servers/discovery`, `company-directory`, `request-engine`, `tracker`, `scam-shield`; all-in-one `servers/dataexit` |
| Gmail / Calendar access | `packages/google` (OAuth, Gmail API headers-only search, UTF-8 send, Calendar; offline fixtures) |
| Storage | `packages/store` (JSON file or Postgres), `db/schema.sql` |

## Process flow

```mermaid
flowchart TD
  A[Discover footprint] --> B[Tag & prioritise]
  B --> C[User picks companies]
  C --> R{Retention duty?<br/>RBI KYC, PMLA, telecom, tax, medical}
  R -- yes --> RU[Draft 'restrict use' request]
  R -- no --> D[Draft request]
  RU --> E
  D --> E{Approval tier}
  E -- low --> S[Send & track]
  E -- medium: one tap --> S
  E -- high: review + 10-min undo --> S
  S --> O{Outcome}
  O -- Confirmed --> V[Verify & close]
  O -- ID requested --> G[Guide user; never auto-share ID]
  O -- No reply by deadline --> M[Reminder] --> GO[Grievance Officer]
  GO -- unresolved --> DPB[Draft DPB complaint<br/>user files]
  N[New signup detected] -.-> A
```

A bank citing RBI KYC rules gets a **restrict use** request instead of escalation.

## Tech stack

- Agent: Claude via MCP.
- MCP servers: TypeScript MCP SDK (see [../decisions/0001-typescript-monorepo.md](../decisions/0001-typescript-monorepo.md)).
- Storage: Postgres + encrypted per-user store.
- Graph widget: D3 or Cytoscape.
- WhatsApp Business API behind our own MCP server.
- Reply classification: rules first, LLM fallback.

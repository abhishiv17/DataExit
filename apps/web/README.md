# web — data map and approvals UI

The visual side of the wow moment. Vite + TypeScript + D3. Runs on mock JSON today (see [docs/contract.md](../../docs/contract.md)).

```bash
npm install            # from repo root
npm run demo:seed      # builds TS, regenerates demo inbox + src/mock/*.json
npm run web            # http://127.0.0.1:5173
```

## Screens
1. **Data map**: you at the centre; angle = sector, distance = time since last use (rings at 1 and 3 years), colour = sensitivity band, size = number of data categories. Filter chips; click a node for the source emails, likely data and retention note; shift-click to multi-select.
2. **Headline**: "214 companies · 61 unused for 3+ years · 12 hold Aadhaar, PAN, bank or health data" plus a one-click "select the 12".
3. **Review & approve**: one card per draft, with the request type (restrict-use flagged with the law), tier badge, source email, EN/हिन्दी toggle and the full email. Medium tier is one tap. High tier gets full review and a 10-minute undo countdown ("Skip wait" is for the demo only). Before 13 May 2027 a legal-basis banner shows.
4. **Tracker**: timeline per request with deadline progress, the WhatsApp-style weekly digest, and escalation to the grievance officer (EN/HI draft, approve).
5. **Rural: scam check**: a WhatsApp-style mock-up, Hindi first. Forward or paste a message, or use 🎤 (browser speech recognition), and get a verdict, reasons and next steps read aloud (speechSynthesis, hi-IN). Quick replies cover lost money (1930, bank, cybercrime.gov.in), SIM check (Sanchar Saathi) and loan-app clean-up. The "never asks for OTP, PIN or Aadhaar" banner is always shown.
6. **Audit log** drawer: a live hash chain with an integrity check.

## Deep links (rehearsal and backup demo)
`#review-demo` selects the 12 high-risk accounts and opens their drafts · `#tracker` · `#rural`

## Wiring to real tools
Replace the functions in `src/api.ts` (`getFootprint`, `draftRequest`, `listRequests`) and `checkScam` in `src/scam.ts` with MCP tool calls. Approve, send and undo currently log to the browser audit log (`src/audit.ts`). Route them to `approve_request` / `send_request` once they're live.

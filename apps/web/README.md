# web — data map and approvals UI

The visual side of the wow moment.

## Screens
1. **Data map**: graph of the user's footprint. Node size = sensitivity, colour = sector, faded = dormant. Clicking a node shows the email it came from.
2. **Headline stats**: "214 companies · 61 unused for 3 years · 12 hold Aadhaar, PAN or bank details".
3. **Review & approve**: selected companies, proposed request type (restrict-use flagged for banks), tier badge, EN/HI toggle, approve button, undo countdown for high tier.
4. **Tracker**: status per request, deadlines, escalate button.

## Stack (planned)
Vite + TypeScript, Cytoscape.js or D3 for the graph. For the demo it can also be an interactive page rendered by Claude from the tracker/directory output.

Not scaffolded yet; create with `npm create vite@latest web -- --template vanilla-ts` inside `apps/` when Milestone 1 starts.

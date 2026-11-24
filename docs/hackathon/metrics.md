# MVP metrics (24 Nov 2026)

Measured on the production build (`npm run build -w @dataexit/web`), the same bundle that runs on AWS Lambda. Lighthouse 12, headless Chrome; "mobile" is Lighthouse's simulated mid-range phone on slow 4G.

## Before and after today's pass

| | Before (commit `b956df3`) | After |
| --- | --- | --- |
| Live site | Old "Wapas" UI; the redesign was never deployed | Redesign live on Lambda (ap-south-1) |
| Redesign renders | **No**: blank page (`process is not defined` in the browser) | Yes, 0 console errors on all 5 views |
| Hero headline | Second line ("Then take it back.") invisible | Visible |
| Phone (390 px) | Landing page cut off on the right | Fits; no horizontal overflow |
| Rural phone mock-up | Input box below the fold at 1440×900 | Fits the viewport |
| Data map | Two identical "select 12" buttons | One clear next step |
| Stat sources | ₹4,058 cr labelled "2024" (wrong) | "since 2022, to May 2026", every number sourced in [sources.md](../research/sources.md) |
| Explains your rights | No | "What the law lets you ask for" section |
| Lighthouse SEO | 91 (no robots.txt) | 100 |
| Look and feel | Dark navy with neon green | Light theme: warm ivory, forest green, Fraunces + DM Sans, animated logo (data slipping out of a door) |
| Accessibility, all 5 views | Not measured per view | 100 on landing, map, review, tracker, scam check |

## Lighthouse (landing page)

| | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop | **97** | **100** | **100** | **100** | 0.6 s | 0.7 s | 0 ms | 0.067 |
| Mobile | **90** | **100** | **100** | **100** | — | 2.8 s | — | 0.004 |

Mobile performance varies a few points run to run. The main cost is one 465 KB script (D3, GSAP and the seeded footprint data). Next step: load the data map and its data only when the user opens the demo.

## Load and transfer

| | |
| --- | --- |
| Page weight (landing, first visit) | 302 KB desktop / 344 KB mobile (fonts trimmed to the weights we use) |
| Lambda bundle | 161 KB zipped |
| Load to network idle, live site, 1440×900 | ~1.9–2.6 s per view |
| `/api/check` (scam verdict) | Responds with verdict, score and reasons |
| `/api/tts` (ElevenLabs, Hindi) | 200, `audio/mpeg` |

## Product and code

| | |
| --- | --- |
| MCP servers / tools | 5 / 23 |
| Automated tests | 16 / 16 passing (`npm test`) |
| Company directory | 290 Indian companies, 7 grievance contacts verified from each company's privacy policy |
| Demo inbox | 656 messages → 214 companies, 61 unused 3+ years, 12 high-risk and dormant |
| Request languages | English, Hindi (templates); voice replies in Hindi, English, Kannada |
| Time to the "wow" moment | 3 clicks from the landing page: Try the demo → Select the 12 riskiest → Draft 12 requests |

## How to re-measure

```bash
npm run build -w @dataexit/web
npx vite preview --port 4173 -c apps/web/vite.config.ts   # or: cd apps/web && npx vite preview --port 4173
npx lighthouse http://127.0.0.1:4173/ --preset=desktop --only-categories=performance,accessibility,best-practices,seo
npx lighthouse http://127.0.0.1:4173/ --only-categories=performance,accessibility,best-practices,seo
npm test
```

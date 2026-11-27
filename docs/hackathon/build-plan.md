# Build plan: wHACKiest 2026, Track 1 (Make MCP Matter)

Team **Data Exit** (Dr. Ambedkar Institute of Technology). Product name: **Data Exit** (matches the PPT and the live site).

| Date | Milestone |
| --- | --- |
| **24 Nov 2026, 11:59 PM** | Submit on Devnovate: PPT (`DataExit_Track1`), public repo, 3–5 min YouTube video, team details. MVP live. |
| 26–27 Nov 2026 | Online pitch to shortlisted teams: 5 min + 3 min Q&A |
| Hack day (24 h) | Build the pilot slice below on top of the MVP |

**Goal for submission:** a judge can open one link, see the wow moment in 60 seconds, hear a scam verdict in Hindi or Kannada, and find tested MCP code behind it. That is what separates us from slide-only teams.

## Where we are (24 Nov 2026)

Live: https://isozxdci5aem2ewbe7utcwv6i40oulpk.lambda-url.ap-south-1.on.aws/

| Area | Status |
| --- | --- |
| 5 MCP servers, 23 tools, policy layer, Postgres/JSON store, Gmail/Calendar OAuth | ✅ Built, 31 tests pass (`npm test`) |
| Company directory: 290 Indian companies, retention duties, 7 verified grievance contacts | ✅ |
| Demo inbox: 656 messages → 214 companies / 61 dormant 3y+ / 12 high-risk | ✅ Deterministic (`npm run demo:seed`) |
| Web app: landing page, data map, review & approve (tiers, EN/HI, undo, audit), tracker (digest, escalation, report card) | ✅ On seeded data; redesign live since 24 Nov |
| Lighthouse (desktop / mobile): accessibility, best practices, SEO 100; performance 98 / 80–84 | ✅ [metrics.md](metrics.md) |
| Every quoted number sourced | ✅ [../research/sources.md](../research/sources.md) |
| Rural scam check: WhatsApp-style UI, Hindi voice in, never-ask banner, lost-money / SIM / loan-app flows | ✅ |
| **AWS**: live on Lambda (ap-south-1) with `check_scam` at `/api/check` | ✅ |
| **ElevenLabs**: TTS for every rural verdict (hi, en, kn) via the Lambda | ✅ |
| Web app reads live MCP tools instead of seeded JSON | ⏳ Hack day |
| WhatsApp bot, Kannada UI, Scribe STT, missed-call line | ⏳ Hack day / pilot |

## Roles

| Member | Owns | Submission tasks (24 Nov) |
| --- | --- | --- |
| **Abhishek** (lead) | Agent, MCP servers, AWS | Final repo check, live link, Devnovate form |
| **Sanvi** | WhatsApp, ElevenLabs | Record and narrate the video (Hindi rural part) |
| **Afreen** | Web app, data map | Screen-record the web flow; check it on a phone |
| **Rithikha** | Directory, templates, demo data | PPT on the template, named `DataExit_Track1`, Drive link set to "Anyone with the link" |

## Submission day checklist (24 Nov)

See [submission.md](submission.md) for the full list and form answers.

- [x] Live link works on desktop and phone (HTTPS)
- [x] README: problem, live link, screenshots, architecture, real vs mocked, team
- [x] ElevenLabs voice live; AWS deployment documented
- [ ] Repo is **public** on GitHub
- [ ] Video recorded (3–5 min), uploaded to YouTube as **unlisted** or public; link in README and form ([video-script.md](video-script.md))
- [ ] PPT exported from the template, named `DataExit_Track1`, Drive sharing "Anyone with the link can view"
- [ ] PPT updated so every claim matches the repo (see "Keep the deck honest" below)
- [ ] Devnovate form submitted before 11:30 PM (keep 30 minutes spare)

## Hack-day plan (24 hours, after shortlisting)

Ordered by what the judges see first. Each block ends with something demoable.

| Hours | Abhishek | Sanvi | Afreen | Rithikha |
| --- | --- | --- | --- | --- |
| 0–4 | Deploy `servers/dataexit --http` to Lambda behind API Gateway | WhatsApp Cloud API webhook → `/api/check` → text + ElevenLabs voice note reply | Switch `apps/web/src/api.ts` from mock JSON to MCP HTTP calls | Verify 20 more grievance contacts (banks and fintech first) |
| 4–8 | Real Gmail OAuth on the demo account; run discovery live | ElevenLabs **Scribe** for incoming voice notes (Hindi, Kannada) | Live data map from `get_data_map` | Kannada templates for erase + withdraw consent |
| 8–14 | Step Functions + EventBridge: 30-day reminder → escalation | Kannada rural flow end to end (`language: "kn"` in `check_scam`) | Approve/undo wired to `approve_request` / `undo_request` | Kannada scam rules (common phrasings) + tests |
| 14–20 | RDS Postgres (`DATABASE_URL`), S3 evidence bundle | Missed-call line: ElevenLabs Agents + Twilio (stretch) | Mobile polish, loading states | Demo data refresh; one real courtesy request in sandbox |
| 20–24 | Freeze, smoke test, backup video | Rehearse rural part | Rehearse web part | Rehearse Q&A (law, retention, privacy) |

**Cut list, from the top:** missed-call line → Step Functions (fall back to Calendar reminders) → RDS (JSON store) → Kannada templates (keep Kannada voice). **Never cut:** discovery → map → approval tiers → send, and a Hindi or Kannada voice verdict.

## Keep the deck honest

Fixed in the Canva deck on 24 Nov 2026 (`wHACKiest26_ppt.pptx`):

| Slide | Was | Now |
| --- | --- | --- |
| 1–8 | Team ID blank / `<Team ID>` | 43af82f0 |
| 2 | "400% rise in cybercrime since 2021 (Home Ministry)" | "₹22,845 cr lost to cyber fraud in 2024, up 206% on 2023 (Govt data in Parliament)" |
| 2 | "…since 2022; seniors are the prime targets" | "…since 2022" (claim not verified) |
| 4, 5, 7 | 6 MCP servers incl. Gmail, SMS, 1930 help | 5 MCP servers, 23 tools: discovery, requests, company directory, tracker, scam check |
| 4, 7 | Next.js + Prisma | TypeScript web app + D3 |

Still say "planned for pilot" when presenting these slide-4/5 items, which are not built yet: API Gateway and one Lambda per server, Step Functions, RDS, S3 Object Lock, Cognito, ElevenLabs Scribe and Agents + Twilio missed-call line. Live today: one Lambda in Mumbai serving the web app, `check_scam` and ElevenLabs TTS.

## Integration points

| From → To | Hand-off | Status |
| --- | --- | --- |
| Directory CSV → MCP directory | `servers/company-directory/data/companies.csv` | ✅ |
| MCP → web | Contract in [docs/contract.md](../contract.md) | ✅ Types shared; web still on seeded JSON |
| `check_scam` → web + WhatsApp | `/api/check` on Lambda | ✅ Web; WhatsApp on hack day |
| Templates → request engine | `servers/request-engine/templates/{en,hi}` | ✅ Need lawyer + native-speaker review |

## Risks

| Risk | Owner | Mitigation |
| --- | --- | --- |
| Live link down during judging | Abhishek | Lambda has no servers to fall over; video and local `npm run web` as backup |
| ElevenLabs quota runs out | Sanvi | Browser speech fallback is automatic; key is restricted to TTS/STT/voices |
| Gmail OAuth verification blocks real sends | Abhishek | Demo on seeded inbox; test users on unverified app |
| Wrong grievance contact | Rithikha | Only verified contacts are used; unverified ones block sending |
| A real company gets a test request | Abhishek | `SEND_MODE=sandbox` until the pitch |
| CloudFront needs AWS account verification | Abhishek | Function URL serves HTTPS today; support case for CloudFront |

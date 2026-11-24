# Demo script (target: 3 minutes)

Uses the seeded inbox in [`demo/seed-inbox`](../../demo/seed-inbox). Never demo on a real inbox.

| Time | Say / do | Shows |
| --- | --- | --- |
| 0:00 | "You've given your Aadhaar to more companies than you can name. Who has your data?" | Problem |
| 0:15 | Type **"Who has my data?"** in Claude | Agent calls Gmail + Company Directory |
| 0:35 | Graph appears: **214 companies, 61 unused for 3 years, 12 hold Aadhaar, PAN or bank details** | Discover + prioritise |
| 0:55 | Click a node: shows the welcome email it came from | Explainable |
| 1:05 | Select the 12. Agent flags 2 banks: "RBI KYC rules — they must keep this. I'll ask them to restrict use instead." | Reliable, law-aware |
| 1:30 | Review screen: tiers shown, Hindi toggle on one request, approve | Controlled |
| 1:50 | Undo one request within the 10-minute window | Controlled |
| 2:00 | Requests sent from the user's own Gmail; deadlines appear in Calendar | Existing apps |
| 2:20 | WhatsApp digest: **"5 confirmed deletion, 1 asked for ID, 1 ignored you. Escalate?"** → tap Escalate → grievance-officer draft | Follow-through, everyday |
| 2:40 | Rural mode teaser: forward a scam SMS by voice note → Hindi voice reply "This is a scam. Never share your OTP." | Social impact |
| 2:55 | "India has the law. Data Exit makes it usable." | Close |

## Running it

- **Live:** https://isozxdci5aem2ewbe7utcwv6i40oulpk.lambda-url.ap-south-1.on.aws/ (AWS Lambda, Mumbai; rural replies use ElevenLabs voice).

- `npm install && npm run demo:seed && npm run web`, then open http://127.0.0.1:5173 (use 127.0.0.1: Chrome can return HTTP 431 on localhost).
- 0:35–0:55: **Data map** tab. "Select the 12 high-risk accounts" → "Draft 12 requests".
- 1:05–1:50: **Review & approve**. The Kotak and YES Bank cards show the restrict-use note. Toggle हिन्दी on one card, approve, press Undo on another, then open **Audit log** ("hash chain intact").
- 2:20: **Tracker**. Digest bubble → "Escalate Gaana" → EN/HI grievance-officer draft → approve. Report card on the right.
- 2:40: **Rural: scam check**. Tap the "किसान योजना" or "QR कैशबैक" sample; the reply is read aloud in Hindi by ElevenLabs, and the green badge shows the `check_scam` verdict from AWS Lambda.

## Backup plan
- Deep links skip clicks if anything stalls: `#review-demo` (12 drafts ready), `#tracker`, `#rural`.
- Everything runs offline on the seeded mock data; no live Gmail needed.
- Pre-recorded screen capture of every step: see [video-script.md](video-script.md).
- If the live link fails: `npm run web` locally (browser voice instead of ElevenLabs).
- Pitch deck (11 slides, speaker notes follow this script): https://claude.ai/artifact/BpYZh21QkV4ac1AUCVuYfB

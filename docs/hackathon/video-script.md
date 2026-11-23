# Video script (target 4:00, hard limit 3–5 min)

Record at 1080p from the live link in Chrome at 110% zoom. Turn on sound for the rural part. Upload to YouTube as **unlisted**, titled "Wapas (Data Exit): wHACKiest 2026 Track 1".

| Time | Screen | Voice-over |
| --- | --- | --- |
| **0:00–0:30 Problem** | Title card, then the stats | "Every Indian has handed Aadhaar, PAN and bank details to dozens of apps. 69% don't know they can withdraw that consent. Meanwhile 1 in 5 UPI families has been hit by fraud, and ₹4,058 crore has been lost to digital-arrest scams. India now has the DPDP Act, but nobody knows which companies hold their data, who to write to, or what to say." |
| **0:30–0:45 Solution** | README hero / architecture line | "Wapas is an MCP-powered agent that finds every company holding your data and helps you take it back, inside apps you already use: Gmail, Calendar and WhatsApp. Its rural mode is a voice-first scam shield." |
| **0:45–1:20 Discover** | `#map`: hover the graph, click a dormant bank node | "Wapas reads only your Gmail headers, never your email bodies, and matches senders against our directory of 290 Indian companies. In this demo inbox: 214 companies have your data, 61 haven't been used in three years, and 12 hold Aadhaar, PAN, bank or health data. Every dot shows the exact email it came from." |
| **1:20–2:10 Draft and approve** | Click "Select the 12 high-risk accounts" → Review. Point at Kotak's restrict-use note, toggle हिन्दी, approve one card, press Undo, open the Audit log | "One click drafts 12 requests. Wapas knows the law: banks must keep KYC records under RBI rules, so instead of a request they'll refuse, it asks them to restrict use. Erasure gets a full review and a 10-minute undo. Every action goes into a hash-chained audit log, so nothing is sent without your approval and nothing can be quietly changed. Requests go out in English or Hindi to the verified grievance officer." |
| **2:10–2:40 Follow through** | `#tracker`: digest bubble, Escalate Gaana, report card | "Wapas tracks every reply. Five companies confirmed deletion, one asked for ID, and one ignored us, so with one tap Wapas drafts the escalation to their grievance officer. Companies get a public report card." |
| **2:40–3:25 Rural mode** | `#rural`: tap "बिजली बिल", let the Hindi voice play; switch to English and tap "डिजिटल अरेस्ट"; point at the green `check_scam on AWS Lambda` badge | "For village users the same agent becomes a scam shield. Forward a message or just speak. The verdict comes from our check_scam MCP tool running on AWS Lambda in Mumbai, and ElevenLabs reads it aloud in Hindi or English, with Kannada voice already live in the same API. Every reply ends the same way: we will never ask for your OTP, PIN or Aadhaar. If you've already lost money, it tells you to call 1930 now." |
| **3:25–3:50 Technical approach** | VS Code: `servers/` tree, `npm test` passing, `.mcp.json`; then `docs/architecture/deployment-aws.md` | "Under the hood: 5 MCP servers and 23 tools in TypeScript (discovery, company directory, request engine, tracker and scam shield), all gated by a policy layer, with 16 automated tests. It runs in Claude today. It's live on AWS Lambda, and the pilot adds API Gateway, Step Functions for legal deadlines, RDS and an S3 evidence locker." |
| **3:50–4:00 Close** | Team slide | "India has the law. Wapas makes it usable. We're team Data Exit from Dr. Ambedkar Institute of Technology. Thank you." |

## Recording tips

- Use the deep links (`#map`, `#review-demo`, `#tracker`, `#rural`) so you never wait on clicks.
- Before recording, open the Rural tab once and play any reply, so the browser allows audio.
- Record the voice-over separately if the room is noisy, then lay it over the screen capture.
- Keep the video under 5:00. Judges stop watching at the limit.

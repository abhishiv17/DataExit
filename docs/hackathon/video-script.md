# Video script (target 4:15, hard limit 3–5 min)

Matches the live site as of 24 Nov 2026. Record at 1920×1080 from the live link in Chrome at 100% zoom, sound on for the rural part. Upload to YouTube as **unlisted**, titled "Data Exit: wHACKiest 2026 Track 1 (Make MCP Matter)".

Every number below is sourced in [../research/sources.md](../research/sources.md).

| Time | Screen | Voice-over |
| --- | --- | --- |
| **0:00–0:25 Hook + problem** | Landing hero: the inbox scan plays, counters climb to 214 and 148. Scroll to "The problem". | "Every Indian has handed their Aadhaar, PAN and bank details to dozens of apps. 69% of us don't know we can take that consent back. One in five families with a UPI user has been hit by fraud, and Indians have lost over four thousand crore rupees to digital-arrest scams since 2022." |
| **0:25–0:45 Solution** | Scroll to "What the law lets you ask for", then "How Data Exit works". | "India's DPDP Act gives you the right to withdraw consent, erase, restrict and correct your data. But nobody knows which companies hold it, who to write to, or what to say. Data Exit is an AI agent, built on MCP, that does the paperwork. You make every decision." |
| **0:45–1:25 Step 1: Discover** | Click **Try the 2-minute demo**. Hover a few dots. Click a bank far from the centre (Kotak). Point at "Why we found it". | "This is a made-up inbox, Priya's. Data Exit reads only email headers, never bodies, and matches the senders against 290 Indian companies. 214 companies have her data. 61 she hasn't used in three years. Further from the centre means unused for longer; orange means ID, bank or health data. Every dot shows the exact email it came from." |
| **1:25–2:20 Step 2: Approve** | Click **Select the 12 riskiest**, then **Draft 12 requests**. On Kotak: point at the restrict-use note, click **Show email**, toggle **हिन्दी**. Approve one card, show the 10-minute countdown, press **Undo**. Open **Audit log**. | "One click drafts twelve requests, each addressed to the company's grievance officer. Watch Kotak: you asked to erase, but RBI rules say banks must keep KYC records. So instead of a request they'll refuse, Data Exit asks them to restrict use. The same letter in Hindi. Nothing goes out until you approve, and high-risk requests wait ten minutes so you can undo. Every step goes into a hash-chained audit log." |
| **2:20–2:50 Step 3: Track** | Click **Next: track the replies**. Point at the WhatsApp digest, click **Escalate Gaana**, show the drafted escalation, then the report card. | "Data Exit tracks every 90-day deadline and reads the replies. Five companies confirmed deletion, one asked for ID, and Gaana ignored us, so one tap drafts the escalation to their grievance officer. Each company gets a report card." |
| **2:50–3:35 Rural mode** | Click **Scam check**. Tap **Electricity bill**; let the Hindi voice play. Point at the green "MCP check_scam on AWS Lambda (Mumbai)" line. Switch to **English**, tap **Digital arrest**. | "In villages the biggest data risk is fraud, so the same agent becomes a scam shield on WhatsApp. Forward a message or just speak. The verdict comes from our check_scam MCP tool running on AWS Lambda in Mumbai, and ElevenLabs reads it aloud in Hindi, English or Kannada. Every reply says the same thing: we will never ask for your OTP, PIN or Aadhaar. And if money is already gone, it tells you to call 1930 now." |
| **3:35–4:05 Technical approach** | Landing page "Under the hood" section (pipeline lights up), then the repo: `servers/` tree and `npm test` (16 passing). | "Under the hood: five MCP servers and 23 tools in TypeScript, orchestrated by Claude. Discovery, company directory, request engine, tracker and scam shield. Every tool call passes a policy layer: an approval tier, an undo window and an audit event. It's live on AWS Lambda in Mumbai with ElevenLabs voice. The pilot adds API Gateway, Step Functions for the legal deadlines, Postgres and an S3 evidence locker." |
| **4:05–4:15 Close** | Back to the landing hero. | "India has the law. Data Exit makes it usable. We're team Data Exit from Dr. Ambedkar Institute of Technology. Thank you." |

## Recording tips

- Deep links skip clicks if you need a retake: `#map`, `#review-demo` (12 drafts ready), `#tracker`, `#rural`.
- Open the rural tab once and play any reply before recording, so the browser allows audio.
- Record the voice-over separately if the room is noisy, then lay it over the screen capture.
- Stay under 5:00. Judges stop at the limit.

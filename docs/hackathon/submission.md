# Submission: wHACKiest 2026 (deadline 24 Nov 2026, 11:59 PM)

Submit everything on the **Devnovate** platform. Keep 30 minutes spare; late entries are not accepted.

## Checklist

| # | Item | Requirement | Owner | Done |
| --- | --- | --- | --- | --- |
| 1 | PPT | The official template only, no extra slides. File name `DataExit_Track1`. Uploaded to Google Drive, sharing set to **"Anyone with the link can view"**. Test the link in an incognito window. | Rithikha | ☐ |
| 2 | GitHub repo | **Public**. README shows the live link, screenshots and how to run. Do not commit `.env`. | Abhishek | ☐ |
| 3 | Video | 3–5 minutes on YouTube, **public or unlisted**. Covers problem, solution, technical approach and a prototype walkthrough. Script: [video-script.md](video-script.md). | Sanvi + Afreen | ☐ |
| 4 | Live MVP link | https://isozxdci5aem2ewbe7utcwv6i40oulpk.lambda-url.ap-south-1.on.aws/ | Abhishek | ✅ |
| 5 | Team details | Names, USNs, college, track | Abhishek | ☐ |
| 6 | Bonus tracks | Mention **Best Use of AWS** and **Best Use of ElevenLabs** in the form and the video | Abhishek | ☐ |

Before submitting, check:
- [ ] Repo → Settings → Danger zone → visibility is **Public**
- [ ] `git log` has no secrets: `git log -p | grep -i "sk_"` returns nothing
- [ ] Live link opens on a phone; Rural tab → tap a sample → you hear the reply
- [ ] Video link plays in an incognito window
- [ ] Drive link opens in an incognito window without a sign-in prompt
- [ ] Video link pasted into README (replace `VIDEO_LINK` below)

## Form answers (copy and paste)

**Team name:** Data Exit
**Track:** Track 1: Make MCP Matter
**College:** Dr. Ambedkar Institute of Technology

| Member | USN |
| --- | --- |
| Abhishek M Shivanagoudar (lead) | 1DA24CS004 |
| Sanvi Y Gowda | 1DA24CS168 |
| Afreen Hossain | 1DA24CS013 |
| Rithikha R | 1DA24CS157 |

**Project name:** Data Exit

**One-liner:** An MCP-powered agent that finds every company holding your data and helps you take it back under India's DPDP Act, with a voice-first scam shield for rural users.

**Description (short):**
Indians have handed Aadhaar, PAN and bank details to hundreds of apps, and 69% don't know they can take that consent back. Data Exit reads only Gmail headers to find every company holding your data (214 in our demo inbox), ranks them by risk, and drafts the right DPDP request in English or Hindi, addressed to the verified grievance officer. Every action passes an approval tier, a 10-minute undo and a hash-chained audit log. It knows the law: RBI KYC and other retention rules turn "erase" into "restrict use". It then tracks replies, escalates and drafts a Data Protection Board complaint. Rural mode uses the same agent as a scam shield: forward or speak a suspicious message and hear the verdict in Hindi or Kannada. Built as 5 MCP servers with 23 tools and 16 passing tests, live on AWS Lambda (Mumbai) with ElevenLabs voice.

**Live link:** https://isozxdci5aem2ewbe7utcwv6i40oulpk.lambda-url.ap-south-1.on.aws/
**Repo:** https://github.com/abhishiv17/DataExit
**Video:** VIDEO_LINK
**PPT:** DRIVE_LINK

**Tech stack:** TypeScript, Model Context Protocol (`@modelcontextprotocol/sdk`), Claude, Gmail + Calendar APIs, Postgres, Vite + D3, AWS Lambda (ap-south-1) + S3, ElevenLabs Multilingual TTS / Eleven v3.

**How we use AWS:** The live MVP runs on AWS Lambda in Mumbai. One function serves the web app, runs the same `check_scam` code as our MCP server, and proxies ElevenLabs so the API key never reaches the browser. The pilot moves each MCP server to its own Lambda behind API Gateway, with Step Functions + EventBridge for the 30/90-day request deadlines, RDS Postgres, S3 Object Lock + KMS for the evidence locker, and Cognito.

**How we use ElevenLabs:** Every rural-mode scam verdict is read aloud with ElevenLabs Multilingual TTS in Hindi and English, and Kannada through Eleven v3. People who can't read a long SMS can still hear "This is a scam, never share your OTP". Next: Scribe for incoming WhatsApp voice notes, and ElevenLabs Agents + Twilio for a missed-call helpline for feature phones.

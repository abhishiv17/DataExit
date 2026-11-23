# whatsapp-bot

WhatsApp Business API webhook, exposed to the agent through our own MCP server.

## City mode
- Weekly digest: "5 confirmed deletion, 1 asked for ID, 1 ignored you. Escalate?"
- Quick approvals for low/medium tier (high tier always goes to full review in chat).

## Rural mode ("Is this a scam?")
- User forwards a message, screenshot or voice note.
- Bot replies in the user's language, by voice.
- **Every conversation includes: "I will never ask for your OTP, PIN or Aadhaar."**
- After a fraud: call 1930, draft cybercrime.gov.in complaint, bank fraud contact.

See [docs/product/rural-mode.md](../../docs/product/rural-mode.md).

Env vars: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`.

Milestone 4; not scaffolded yet.

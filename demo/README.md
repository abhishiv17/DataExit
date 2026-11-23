# demo

Assets for the hackathon demo. **Never use a real inbox or real personal data.**

## Seed inbox (`seed-inbox/`)

`npm run demo:seed` (deterministic) regenerates:

| File | What |
| --- | --- |
| `inbox.mbox` | ~650 fictional signup / welcome / OTP / receipt / newsletter emails, 7 sent requests and 6 replies, for persona Priya Demo (`persona.json`). Import into the demo Gmail account (e.g. Gmail API `users.messages.import`). **Import only; never send.** |
| `messages.json` | Metadata index of every message (no bodies) |
| `../apps/web/src/mock/*.json` | Contract-shaped mock tool outputs for the UI |

The generator checks the wow numbers against `persona.json` and fails if they drift:
- 214 companies, 61 unused 3+ years, 12 of those high-sensitivity (2 banks → restrict-use, 10 → erase).
- Earlier batch of 7 requests sent ~108 days ago: 5 confirmed, 1 asked for ID, 1 no reply (overdue → escalate).

Shift the demo date with `SEED_NOW=2026-12-05 npm run demo:seed`.

Sender addresses use the real company domains so discovery matches the directory. Reply and grievance addresses (`grievance@<domain>`) are **placeholders** and must not be treated as real contacts.

- `report-card/`: mock company report card (response rate, median days). *(todo)*

Script: [docs/hackathon/demo-script.md](../docs/hackathon/demo-script.md).

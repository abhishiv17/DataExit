# What Claude gives us vs. what we build

## Already possible with Claude connectors

| Capability | Notes |
| --- | --- |
| Gmail search & read threads | Discovery and reply reading |
| Gmail send / reply / forward | Since Aug 2026, with approval by default (paid plans). Some docs still say read-only; **check the account's connector settings**. |
| Google Calendar | Deadline reminders |
| Interactive pages / diagrams | Data-map visual for the demo |
| Scheduled tasks | Weekly re-scans and follow-ups |

**Decision (build phase):** our servers call the Gmail and Calendar APIs themselves (`packages/google`) instead of relying on Claude's connectors. That way `send_request` can enforce approval, the undo window, sandbox mode and the send limit in our code, and the demo does not depend on a paid-plan connector setting. Claude's connectors remain an option for read-only browsing.

## We build

| Item | Where |
| --- | --- |
| Company Directory, Request Engine, Tracker MCP servers (added as custom connectors) | `servers/*` — **core engineering** |
| Policy & approval layer, audit log | `packages/policy` |
| SMS/OTP scanning | `apps/android-sms` (future) |
| WhatsApp integration (Business API behind our MCP server) | `apps/whatsapp-bot` |
| Storage | `db/` |

**Not possible today:** instant reaction to new mail → use scheduled checks.

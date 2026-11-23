# Privacy by design

An app about data rights has to hold as little data as possible itself.

## We store

- Company matches and message **IDs**, dates and sender domains (Gmail metadata).
- Requests we drafted and sent, their status and the audit log.
- User's name and email needed to fill request templates.

## We never store

- Email bodies (read transiently to classify, then discarded).
- SMS content (parsed on the device; only the company match leaves the phone).
- ID documents (Aadhaar, PAN, KYC). If a company asks for ID, we guide the user; we never auto-share.
- OTPs, PINs. The rural bot never asks for them.

## Principles

1. **Metadata first**: Gmail search on headers/senders before any body read.
2. **Explainable**: every suggestion shows the message it came from.
3. **Reversible**: undo window for high-tier actions; everything logged.
4. **User owns the exit**: one-click export and one-click delete of everything Data Exit holds.
5. **Encryption**: per-user store encrypted with a per-user key (`USER_STORE_KEY` in dev).
6. **Assisted mode**: helpers act with consent; nothing stored on the helper's device; helper actions logged as `actor = helper:<id>`.

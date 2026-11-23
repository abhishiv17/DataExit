# The law: DPDP Act 2023 + DPDP Rules 2025

> Not legal advice. Section numbers below were noted from memory and are marked **[verify]** until checked against the official text.

## Roles

- **Data Principal**: the user.
- **Data Fiduciary**: the company. It is also responsible for its processors.
- **Consent Manager**: an entity registered with the Data Protection Board (DPB). Must be an Indian company with net worth of at least ₹2 crore. Registration opened 13 Nov 2026; none listed yet.

## Phased commencement

Rules notified 13–14 Nov 2025.

| Phase | Effective | What switches on |
| --- | --- | --- |
| I | 13–14 Nov 2025 | Definitions, Data Protection Board set-up |
| II | 13 Nov 2026 | Consent Manager registration (Rule 4) |
| III | **13 May 2027** | Notice, consent, security, breach reporting, data-principal rights (erasure, correction, access) |

**Product implication:** before 13 May 2027, requests are not yet enforceable under the statute. Label them *policy-based / courtesy requests* and pitch as "get ready now". The Request Engine reads the current date and picks the right wording.

## Rights we use

| Right | Section | Request type in our code |
| --- | --- | --- |
| Withdraw consent | s.6 [verify] | `withdraw_consent` |
| Act via a Consent Manager | s.6(7)–(9) [verify] | future integration |
| Summary of data held / access | s.11 [verify] | `access` |
| Correction and erasure | s.12 [verify] | `correct`, `erase` |
| Grievance redressal | s.13 [verify] | escalation step |
| Nominate someone | s.14 [verify] | future: nominee / family mode |
| Erase once purpose is served | s.8(7) [verify] | argument in `erase` |

Marketing opt-out (`stop_marketing`) and `restrict_use` are drafted as consent withdrawal limited to specific purposes.

## Deadlines

Companies may take **up to 90 days** to respond. The tracker sets the deadline from the send date and schedules reminders before it.

## Retention overrides

Other laws override erasure:

- RBI KYC directions (banks, NBFCs, payment apps)
- PMLA (record-keeping for financial transactions)
- Telecom licence conditions
- Tax records
- Medical records rules

For companies under these, the agent proposes **restrict use** (stop processing beyond the legal purpose; no marketing, no sharing) instead of erasure, and does **not** escalate a refusal to erase.

## Escalation ladder

1. Request to the company's contact / DPO.
2. No reply or unsatisfactory reply by deadline → **Grievance Officer** (s.13 [verify]).
3. Still unresolved → draft a **Data Protection Board complaint**. The user reviews and files it themselves.

## Before submission: checklist

- [ ] Verify every section number against the gazette text.
- [ ] Confirm grievance-redressal timelines in the Rules.
- [ ] Have templates reviewed by a lawyer.
- [ ] Confirm DPB complaint procedure and portal.

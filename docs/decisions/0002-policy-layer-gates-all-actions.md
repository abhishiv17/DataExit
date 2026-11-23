# ADR 0002: Policy layer gates every action

- Status: accepted
- Date: 2026-11-23

## Context
"Controlled" is a judging criterion and wrong deletions cause real harm.

## Decision
All state-changing tools require an approval token issued by `packages/policy`. The policy layer classifies the tier, collects approval, enforces the 10-minute undo window for high tier, and appends a hash-chained audit event. Tools reject calls without a valid token.

## Consequences
- Slightly more plumbing per tool.
- Every action is explainable and reversible within the window, and the audit log is tamper-evident.

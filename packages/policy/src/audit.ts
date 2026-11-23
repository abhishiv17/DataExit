import { createHash, randomUUID } from "node:crypto";
import type { AuditEvent, AuditInput } from "@dataexit/shared";

// Append-only, hash-chained audit log.
// hash = sha256(prev_hash + canonical_json(event without hash)); the next event's prev_hash is this hash.

export const GENESIS_HASH = "0".repeat(64);

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function hashEvent(event: Omit<AuditEvent, "hash">): string {
  return createHash("sha256").update(event.prev_hash + canonicalJson(event)).digest("hex");
}

/** Build the next event in a user's chain. Stores call this inside their append lock. */
export function buildAuditEvent(
  userId: string,
  prev: Pick<AuditEvent, "seq" | "hash"> | null,
  input: AuditInput,
  now: Date,
): AuditEvent {
  const unhashed: Omit<AuditEvent, "hash"> = {
    id: randomUUID(),
    user_id: userId,
    seq: (prev?.seq ?? 0) + 1,
    actor: input.actor,
    action: input.action,
    approval: input.approval ?? null,
    target: input.target ?? null,
    details: input.details ?? {},
    timestamp: now.toISOString(),
    prev_hash: prev?.hash ?? GENESIS_HASH,
  };
  return { ...unhashed, hash: hashEvent(unhashed) };
}

/** Verifies a full chain (ordered by seq). Returns the seq of the first broken event, or null. */
export function verifyAuditChain(events: readonly AuditEvent[]): { ok: boolean; broken_at: number | null; length: number } {
  let prev = GENESIS_HASH;
  let expectedSeq = 1;
  for (const e of events) {
    const { hash, ...rest } = e;
    if (e.seq !== expectedSeq || e.prev_hash !== prev || hashEvent(rest) !== hash) {
      return { ok: false, broken_at: e.seq, length: events.length };
    }
    prev = hash;
    expectedSeq++;
  }
  return { ok: true, broken_at: null, length: events.length };
}

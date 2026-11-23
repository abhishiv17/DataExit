import { createHash } from "node:crypto";
import type { AuditEvent } from "@dataexit/shared";

// Append-only, hash-chained audit log. hash = sha256(prevHash + canonicalJson(event)).

export const GENESIS_HASH = "0".repeat(64);

type Unhashed = Omit<AuditEvent, "prevHash" | "hash">;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashEvent(prevHash: string, event: Unhashed): string {
  return createHash("sha256").update(prevHash + canonicalJson(event)).digest("hex");
}

export class AuditLog {
  private events: AuditEvent[] = [];

  append(event: Omit<Unhashed, "seq" | "at">): AuditEvent {
    const prevHash = this.events.at(-1)?.hash ?? GENESIS_HASH;
    const unhashed: Unhashed = {
      ...event,
      seq: this.events.length + 1,
      at: new Date().toISOString(),
    };
    const full: AuditEvent = { ...unhashed, prevHash, hash: hashEvent(prevHash, unhashed) };
    this.events.push(full);
    return full;
  }

  all(): readonly AuditEvent[] {
    return this.events;
  }

  /** Returns the seq of the first broken event, or null if the chain is intact. */
  static verify(events: readonly AuditEvent[]): number | null {
    let prev = GENESIS_HASH;
    for (const e of events) {
      const { prevHash, hash, ...rest } = e;
      if (prevHash !== prev || hashEvent(prev, rest) !== hash) return e.seq;
      prev = hash;
    }
    return null;
  }
}

// Browser mirror of packages/policy/src/audit.ts so the demo can show a live hash chain
// before approve_request is wired. Same canonical JSON and sha256(prevHash + json) rule.
// Replace with the policy layer's events once the tool is live.

import type { AuditAction, AuditActor, AuditEvent } from "@dataexit/shared/ui";

export const GENESIS_HASH = "0".repeat(64);

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

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Listener = (events: readonly AuditEvent[]) => void;

export class BrowserAuditLog {
  private events: AuditEvent[] = [];
  private listeners: Listener[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private userId: string) {}

  onChange(fn: Listener) { this.listeners.push(fn); }

  append(e: { actor: AuditActor; action: AuditAction; target: string; sourceRef: string | null; details: Record<string, unknown> }): Promise<AuditEvent> {
    // Serialise appends so seq and prevHash stay consistent.
    const p = this.queue.then(async () => {
      const prevHash = this.events.at(-1)?.hash ?? GENESIS_HASH;
      const unhashed = { userId: this.userId, ...e, seq: this.events.length + 1, at: new Date().toISOString() };
      const full: AuditEvent = { ...unhashed, prevHash, hash: await sha256(prevHash + canonicalJson(unhashed)) };
      this.events.push(full);
      this.listeners.forEach((fn) => fn(this.events));
      return full;
    });
    this.queue = p;
    return p;
  }

  all(): readonly AuditEvent[] { return this.events; }

  async verify(): Promise<number | null> {
    let prev = GENESIS_HASH;
    for (const e of this.events) {
      const { prevHash, hash, ...rest } = e;
      if (prevHash !== prev || (await sha256(prev + canonicalJson(rest))) !== hash) return e.seq;
      prev = hash;
    }
    return null;
  }
}

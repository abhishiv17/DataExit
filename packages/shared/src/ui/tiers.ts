import type { ApprovalTier, RequestType, Sector } from "./types.js";

// See docs/architecture/approval-and-audit.md.

const BASE_TIER: Record<RequestType, ApprovalTier> = {
  stop_marketing: "low",
  withdraw_consent: "medium",
  access: "medium",
  correct: "medium",
  restrict_use: "medium",
  erase: "high",
};

const HIGH_RISK_SECTORS: ReadonlySet<Sector> = new Set([
  "bank",
  "insurance",
  "government",
  "health",
]);

const RANK: Record<ApprovalTier, number> = { low: 0, medium: 1, high: 2 };

export function classifyTier(type: RequestType, sector: Sector): ApprovalTier {
  const base = BASE_TIER[type];
  const floor: ApprovalTier = HIGH_RISK_SECTORS.has(sector) ? "high" : "low";
  return RANK[base] >= RANK[floor] ? base : floor;
}

export const UNDO_WINDOW_MS = Number(process.env.UNDO_WINDOW_SECONDS ?? 600) * 1000;

export interface ApprovalDecision {
  tier: ApprovalTier;
  /** true if the action can run without asking (low tier + auto-mode on). */
  autoApproved: boolean;
  /** When the action may actually execute (after the undo window for high tier). */
  executeAfter: Date;
}

export function decide(
  type: RequestType,
  sector: Sector,
  opts: { lowTierAuto: boolean; approvedAt?: Date },
): ApprovalDecision {
  const tier = classifyTier(type, sector);
  const now = opts.approvedAt ?? new Date();
  return {
    tier,
    autoApproved: tier === "low" && opts.lowTierAuto,
    executeAfter: tier === "high" ? new Date(now.getTime() + UNDO_WINDOW_MS) : now,
  };
}

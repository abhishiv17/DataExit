import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Directory } from "@dataexit/directory";
import { classifyTier, isHighRiskCompany } from "@dataexit/policy";
import { audit, defineTool, UserFacingError, type Ctx, type Register } from "@dataexit/runtime";
import { adjustForRetention, retentionConvertsErase, retentionLabel, type Company } from "@dataexit/shared";

function describe(c: Company) {
  return {
    ...c,
    display_name: Directory.displayName(c),
    retention_law: retentionLabel(c.retention_rule),
    erase_becomes_restrict: retentionConvertsErase(c.retention_rule),
    always_full_review: isHighRiskCompany(c),
    recipient: c.grievance_email ?? c.support_email ?? null,
  };
}

export function lookupCompany(ctx: Ctx, a: { id?: string; domain?: string; sms_sender_id?: string; name?: string }) {
  if (!a.id && !a.domain && !a.sms_sender_id && !a.name) {
    throw new UserFacingError("BAD_INPUT", "Give one of id, domain, sms_sender_id or name.");
  }
  const c =
    (a.id && ctx.directory.get(a.id)) ||
    (a.domain && ctx.directory.byDomain(a.domain)) ||
    (a.sms_sender_id && ctx.directory.bySmsSender(a.sms_sender_id)) ||
    (a.name && ctx.directory.byName(a.name)) ||
    null;
  return { found: !!c, company: c ? describe(c) : null };
}

export const registerDirectory: Register = (server, ctx) => {
  defineTool(
    server,
    ctx,
    "lookup_company",
    {
      description:
        "Look up a company in the Data Exit directory by id, email domain (subdomains match), SMS sender ID (e.g. VM-HDFCBK-S) or brand/legal name. " +
        "Returns data categories, sensitivity, retention rule, grievance contact and whether erasure becomes restrict-use.",
      inputSchema: {
        id: z.string().optional(),
        domain: z.string().optional(),
        sms_sender_id: z.string().optional(),
        name: z.string().optional(),
      },
      annotations: { title: "Look up company", readOnlyHint: true },
    },
    async (a, c) => lookupCompany(c, a),
  );

  defineTool(
    server,
    ctx,
    "get_retention_rules",
    {
      description:
        "Explain which laws oblige a company to keep data (RBI KYC, PMLA, SEBI, telecom, insurance, medical, tax), " +
        "what a requested action becomes, and its approval tier.",
      inputSchema: {
        company_id: z.string(),
        requested_type: z.enum(["stop_marketing", "withdraw_consent", "access", "correct", "erase", "restrict"]).default("erase"),
      },
      annotations: { title: "Retention rules", readOnlyHint: true },
    },
    async (a, c) => {
      const company = c.directory.get(a.company_id);
      if (!company) throw new UserFacingError("UNKNOWN_COMPANY", `No company with id ${a.company_id}.`);
      const adj = adjustForRetention(a.requested_type, company.retention_rule);
      return {
        company_id: company.id,
        retention_rule: company.retention_rule,
        retention_law: retentionLabel(company.retention_rule),
        requested_type: a.requested_type,
        becomes: adj.type,
        reason: adj.reason,
        tier: classifyTier(adj.type, company),
      };
    },
  );

  defineTool(
    server,
    ctx,
    "report_contact",
    {
      description:
        "Queue a grievance contact for a company (from the user or a web page) for human review. Does not change the directory.",
      inputSchema: {
        company_id: z.string(),
        email: z.string().email().optional(),
        url: z.string().url().optional(),
        source: z.string().describe("Where the contact was found, e.g. the privacy policy URL"),
      },
      annotations: { title: "Report contact", readOnlyHint: false },
    },
    async (a, c) => {
      const file = join(c.config.dataDir, "directory-reports.jsonl");
      mkdirSync(c.config.dataDir, { recursive: true });
      appendFileSync(file, JSON.stringify({ ...a, reported_at: c.now().toISOString() }) + "\n");
      await audit(c, { actor: "agent", action: "report_contact", target: a.company_id, details: { source: a.source } });
      return { queued: true, review_file: file };
    },
  );

  defineTool(
    server,
    ctx,
    "directory_status",
    {
      description: "Directory size and data-quality issues (missing grievance contacts, unknown categories). For the team, not end users.",
      inputSchema: {},
      annotations: { title: "Directory status", readOnlyHint: true },
    },
    async (_a, c) => ({
      companies: c.directory.size,
      with_grievance_email: c.directory.all().filter((x) => x.grievance_email).length,
      verified: c.directory.all().filter((x) => x.grievance_verified).length,
      issues: c.directory.issues,
    }),
  );
};

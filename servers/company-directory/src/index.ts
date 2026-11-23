#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  adjustForRetention,
  isHighSensitivity,
  RETENTION_LABELS,
  sensitivityScore,
} from "@dataexit/shared";
import { Directory } from "./directory.js";

const directory = Directory.load();
const server = new McpServer({ name: "dataexit-company-directory", version: "0.1.0" });

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

server.registerTool(
  "lookup_company",
  {
    description: "Look up an Indian company by email domain or name. Returns its data categories, sensitivity, retention duties and grievance contact.",
    inputSchema: { domain: z.string().optional(), name: z.string().optional() },
  },
  async ({ domain, name }) => {
    const c = (domain && directory.byDomainName(domain)) || (name && directory.byName(name)) || null;
    return json(c && { ...c, sensitivity: sensitivityScore(c.dataCategories) });
  },
);

server.registerTool(
  "match_senders",
  {
    description: "Match sender domains (from Gmail metadata of signup/welcome/OTP/receipt mail) to known companies. Pass message IDs so each match cites its source.",
    inputSchema: {
      senders: z.array(z.object({ domain: z.string(), messageId: z.string(), date: z.string().optional() })),
    },
  },
  async ({ senders }) => {
    const matched = new Map<string, { companyId: string; name: string; sensitivity: number; highSensitivity: boolean; sourceRefs: string[]; lastSeen?: string }>();
    const unmatched = new Set<string>();
    for (const s of senders) {
      const c = directory.byDomainName(s.domain);
      if (!c) { unmatched.add(s.domain); continue; }
      const m = matched.get(c.id) ?? {
        companyId: c.id, name: c.name,
        sensitivity: sensitivityScore(c.dataCategories),
        highSensitivity: isHighSensitivity(c),
        sourceRefs: [],
      };
      m.sourceRefs.push(s.messageId);
      if (s.date && (!m.lastSeen || s.date > m.lastSeen)) m.lastSeen = s.date;
      matched.set(c.id, m);
    }
    return json({ matched: [...matched.values()], unmatched: [...unmatched] });
  },
);

server.registerTool(
  "get_retention_rules",
  {
    description: "Get laws that oblige a company to keep data (RBI KYC, PMLA, telecom, tax, medical) and whether erasure should become a restrict-use request.",
    inputSchema: { companyId: z.string() },
  },
  async ({ companyId }) => {
    const c = directory.get(companyId);
    if (!c) return json({ error: "unknown company" });
    return json({
      companyId,
      duties: c.retentionDuties.map((d) => ({ duty: d, law: RETENTION_LABELS[d] })),
      eraseBecomes: adjustForRetention("erase", c.retentionDuties),
    });
  },
);

server.registerTool(
  "report_contact",
  {
    description: "Queue a user- or web-reported grievance contact for a company for human review. Does not change the directory directly.",
    inputSchema: { companyId: z.string(), email: z.string().email().optional(), url: z.string().url().optional(), source: z.string() },
  },
  async (input) => {
    // TODO: persist to a review queue (db table directory_reports).
    return json({ queued: true, ...input });
  },
);

await server.connect(new StdioServerTransport());

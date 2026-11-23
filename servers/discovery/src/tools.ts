import { z } from "zod";
import { defineTool, type Register } from "@dataexit/runtime";
import { checkNewSignups, discoverFootprint, getDataMap } from "./ops.js";

export const registerDiscovery: Register = (server, ctx) => {
  defineTool(
    server,
    ctx,
    "discover_footprint",
    {
      description:
        "Answer 'Who has my data?'. Scans the user's Gmail headers (never bodies) for signup, OTP, order and receipt emails, " +
        "matches senders to the Company Directory, and saves the footprint. Returns headline numbers and the top-risk companies.",
      inputSchema: {
        since: z.string().optional().describe("ISO date to scan from; default is the configured lookback (10 years)"),
        max_messages: z.number().int().positive().max(5000).optional(),
      },
      annotations: { title: "Discover footprint", readOnlyHint: false, openWorldHint: true },
    },
    (a, c) => discoverFootprint(c, a),
  );

  defineTool(
    server,
    ctx,
    "get_data_map",
    {
      description:
        "Return the saved footprint as graph JSON for the data-map widget: headline numbers, nodes sorted by risk score (0-100), " +
        "an 'others' cluster beyond the node cap, and top_risk_dormant (riskiest accounts unused for 1+ year).",
      inputSchema: {
        limit: z.number().int().positive().max(500).default(80),
        unused_months: z.number().int().min(0).optional().describe("Only companies unused for at least this many months"),
        company_ids: z.array(z.string()).optional(),
      },
      annotations: { title: "Data map", readOnlyHint: true },
    },
    (a, c) => getDataMap(c, a),
  );

  defineTool(
    server,
    ctx,
    "check_new_signups",
    {
      description:
        "Re-scan Gmail since the last scan and list newly found companies with a privacy summary and an auto-expiry suggestion. " +
        "Intended for a scheduled daily or weekly task.",
      inputSchema: {},
      annotations: { title: "Check new signups", openWorldHint: true },
    },
    (_a, c) => checkNewSignups(c),
  );
};

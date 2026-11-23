#!/usr/bin/env node
// npm run audit:verify — checks that the user's audit log hash chain is intact.
import { verifyAuditChain } from "@dataexit/policy";
import { createContext, silentLogger } from "@dataexit/runtime";

const ctx = await createContext("verify-audit", { log: silentLogger });
const chain = await ctx.store.listAudit(ctx.userId);
const v = verifyAuditChain(chain);
console.log(v.ok ? `Audit chain intact: ${v.length} events.` : `Audit chain BROKEN at event ${v.broken_at} of ${v.length}.`);
await ctx.close();
process.exit(v.ok ? 0 : 1);

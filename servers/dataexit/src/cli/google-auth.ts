#!/usr/bin/env node
// npm run auth:google — one-time OAuth sign-in for the demo Gmail account.
import { runGoogleAuthFlow } from "@dataexit/google";
import { loadConfig } from "@dataexit/runtime";

const config = loadConfig();
if (!config.google.clientId || !config.google.clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first (see docs/development/setup.md).");
  process.exit(1);
}
await runGoogleAuthFlow(config.google, (s) => console.log(s));

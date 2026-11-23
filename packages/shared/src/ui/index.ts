// Legacy shapes used by the web UI (apps/web), the directory build script and the demo generator.
// They predate the build-plan contract (docs/contract.md), which the MCP servers use.
// Import as "@dataexit/shared/ui". New code should use "@dataexit/shared".
// Migration: when the UI switches from mock JSON to live tools, move it to the contract types and delete this folder.
export * from "./types.js";
export * from "./sensitivity.js";
export * from "./legal.js";
export * from "./tiers.js";

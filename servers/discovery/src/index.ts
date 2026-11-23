#!/usr/bin/env node
import { runStdio } from "@dataexit/runtime";
import { registerDiscovery } from "./tools.js";

await runStdio("dataexit-discovery", "0.2.0", [registerDiscovery]);

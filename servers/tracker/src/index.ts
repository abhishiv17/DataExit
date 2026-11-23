#!/usr/bin/env node
import { runStdio } from "@dataexit/runtime";
import { registerTracker } from "./tools.js";

await runStdio("dataexit-tracker", "0.2.0", [registerTracker]);

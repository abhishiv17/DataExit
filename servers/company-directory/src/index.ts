#!/usr/bin/env node
import { runStdio } from "@dataexit/runtime";
import { registerDirectory } from "./tools.js";

await runStdio("dataexit-company-directory", "0.2.0", [registerDirectory]);

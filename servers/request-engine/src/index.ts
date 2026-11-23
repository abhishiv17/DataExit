#!/usr/bin/env node
import { runStdio } from "@dataexit/runtime";
import { registerRequestEngine } from "./tools.js";

await runStdio("dataexit-request-engine", "0.2.0", [registerRequestEngine]);

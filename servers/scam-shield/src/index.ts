#!/usr/bin/env node
import { runStdio } from "@dataexit/runtime";
import { registerScamShield } from "./tools.js";

await runStdio("dataexit-scam-shield", "0.1.0", [registerScamShield]);

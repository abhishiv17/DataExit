import { registerDirectory } from "@dataexit/company-directory";
import { registerDiscovery } from "@dataexit/discovery";
import { registerRequestEngine } from "@dataexit/request-engine";
import type { Register } from "@dataexit/runtime";
import { registerScamShield } from "@dataexit/scam-shield";
import { registerTracker } from "@dataexit/tracker";

export const ALL_REGISTERS: Register[] = [
  registerDiscovery,
  registerDirectory,
  registerRequestEngine,
  registerTracker,
  registerScamShield,
];

export const SERVER_NAME = "dataexit";
export const SERVER_VERSION = "0.2.0";

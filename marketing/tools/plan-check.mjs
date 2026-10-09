#!/usr/bin/env node
// Validate a run's plan.json against the plan v1 schema (validatePlan in lib/run.mjs).
// Usage: node marketing/tools/plan-check.mjs <runDir>   Prints one error per line; exit 1 if any.
import path from "node:path";

import { readPlan, validatePlan } from "./lib/run.mjs";

const runDir = process.argv[2];
if (!runDir) {
  console.error("usage: plan-check.mjs <runDir>");
  process.exit(2);
}

let errors;
try {
  errors = validatePlan(readPlan(path.resolve(runDir)));
} catch (err) {
  errors = [`plan.json unreadable: ${err.message}`];
}
for (const e of errors) console.log(e);
console.log(errors.length ? `plan-check: ${errors.length} error(s)` : "plan-check: ok");
process.exit(errors.length ? 1 : 0);

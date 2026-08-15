#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RETIRED_EXECUTABLES = [
  ".github/workflows/docker-publish.yml",
  "infra/build-and-push.sh",
  "infra/cloudflare-tunnel-config.yml",
  "infra/deploy.sh",
  "infra/docker-compose.deploy.yml",
  "infra/docker-compose.frontend.yml",
  "infra/docker-compose.services.yml",
  "infra/docker-compose.supabase.yml",
  "infra/seed-prod-middlewest-accounts.sh",
  "infra/seed-prod-middlewest-accounts.sql",
  "infra/seed-prod-test-account.sh",
  "infra/seed-prod-test-account.sql",
  "scripts/deploy-edge-functions.sh",
  "scripts/remote-db.sh",
];

const RETIRED_DIRECTORIES = ["infra/coolify"];
const ACTIVE_DOC_ROOTS = [
  "docs/README.md",
  "docs/engineering",
  "docs/operations",
];
const ACTIVE_CONFIG_ROOTS = ["package.json", ".github/workflows", "infra"];

const RETIRED_PATH_PATTERN =
  /(?:infra\/(?:build-and-push|deploy)\.sh|scripts\/(?:remote-db|deploy-edge-functions)\.sh|infra\/coolify\/|docker-compose\.(?:deploy|frontend|services|supabase)\.yml|cloudflare-tunnel-config\.yml|docker-publish\.yml)/i;
const RETIRED_PLATFORM_PATTERN =
  /(?:coolify|ghcr\.io|192\.168\.1\.14|cfargotunnel\.com|cloudflared|cloudflare\s+tunnel)/i;
const PROCEDURE_PATTERN =
  /(?:\bdeploy\b|\brun\b|\bexecute\b|\bssh\b|\brestart\b|\bconfigure\b|\bset\b|\bupdate\b|\bpaste\b|\bpush\b|\bpull\b)/i;
const NEGATION_PATTERN =
  /(?:\bretired\b|\bdead\b|\bnever\b|\bdeny\b|\bblock(?:ed|s)?\b|\bremoved?\b|\barchive(?:d)?\b|\bhistorical\b|\bused\b|\bdo not\b)/i;

function walkFiles(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return [relative];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? walkFiles(root, child) : [child];
  });
}

export function findRetiredDeployReferences(root) {
  const findings = [];

  for (const relative of RETIRED_EXECUTABLES) {
    if (fs.existsSync(path.join(root, relative))) {
      findings.push(`${relative}: retired executable still exists`);
    }
  }
  for (const relative of RETIRED_DIRECTORIES) {
    if (fs.existsSync(path.join(root, relative))) {
      findings.push(`${relative}: retired executable directory still exists`);
    }
  }

  const activeFiles = [...ACTIVE_DOC_ROOTS, ...ACTIVE_CONFIG_ROOTS]
    .flatMap((relative) => walkFiles(root, relative))
    .filter((relative) => !relative.includes(`${path.sep}_archive${path.sep}`));

  for (const relative of activeFiles) {
    const absolute = path.join(root, relative);
    if (!fs.statSync(absolute).isFile()) continue;
    const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const pathReference = RETIRED_PATH_PATTERN.test(line);
      const retiredProcedure =
        RETIRED_PLATFORM_PATTERN.test(line) && PROCEDURE_PATTERN.test(line);
      if ((pathReference || retiredProcedure) && !NEGATION_PATTERN.test(line)) {
        findings.push(`${relative}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  return findings;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = findRetiredDeployReferences(root);
  if (findings.length > 0) {
    console.error(
      "Retired deployment references found:\n" + findings.join("\n"),
    );
    process.exitCode = 1;
  } else {
    console.log("Retired deployment reference gate passed.");
  }
}

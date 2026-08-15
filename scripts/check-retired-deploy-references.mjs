#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_MARKER = "[retired-deploy-reference-allow]";

const RETIRED_PATHS = [
  ".github/workflows/docker-publish.yml", // [retired-deploy-reference-allow]
  "infra/.env.example", // [retired-deploy-reference-allow]
  "infra/Dockerfile.edge-runtime", // [retired-deploy-reference-allow]
  "infra/Dockerfile.nestjs", // [retired-deploy-reference-allow]
  "infra/Dockerfile.nextjs", // [retired-deploy-reference-allow]
  "infra/build-and-push.sh", // [retired-deploy-reference-allow]
  "infra/cloudflare-tunnel-config.yml", // [retired-deploy-reference-allow]
  "infra/coolify/", // [retired-deploy-reference-allow]
  "infra/deploy.sh", // [retired-deploy-reference-allow]
  "infra/docker-compose.deploy.yml", // [retired-deploy-reference-allow]
  "infra/docker-compose.frontend.yml", // [retired-deploy-reference-allow]
  "infra/docker-compose.services.yml", // [retired-deploy-reference-allow]
  "infra/docker-compose.supabase.yml", // [retired-deploy-reference-allow]
  "infra/seed-prod-middlewest-accounts.sh", // [retired-deploy-reference-allow]
  "infra/seed-prod-middlewest-accounts.sql", // [retired-deploy-reference-allow]
  "infra/seed-prod-test-account.sh", // [retired-deploy-reference-allow]
  "infra/seed-prod-test-account.sql", // [retired-deploy-reference-allow]
  "infra/volumes/", // [retired-deploy-reference-allow]
  "scripts/deploy-edge-functions.sh", // [retired-deploy-reference-allow]
  "scripts/remote-db.sh", // [retired-deploy-reference-allow]
];

const RETIRED_CONTENT_RULES = [
  {
    label: "retired executable or configuration path",
    pattern:
      /(?:\.github\/workflows\/docker-publish\.yml|infra\/\.env\.example|infra\/Dockerfile\.(?:edge-runtime|nestjs|nextjs)|infra\/(?:build-and-push|deploy)\.sh|infra\/cloudflare-tunnel-config\.yml|infra\/coolify\/|infra\/docker-compose\.(?:deploy|frontend|services|supabase)\.yml|infra\/seed-prod-(?:middlewest-accounts|test-account)\.(?:sh|sql)|infra\/volumes\/|scripts\/(?:deploy-edge-functions|remote-db)\.sh)/i, // [retired-deploy-reference-allow]
  },
  {
    label: "retired deployment platform procedure",
    pattern:
      /(?:\bcoolify\b.{0,120}\b(?:deploy|deployment|ssh|configure|restart|pull|push|build)\b|\b(?:deploy|deployment|ssh|configure|restart|pull|push|build)\b.{0,120}\bcoolify\b|ghcr\.io\/kodeman|cfargotunnel\.com|cloudflared\s+tunnel|192\.168\.1\.14)/i, // [retired-deploy-reference-allow]
  },
  {
    label: "retired self-hosted Supabase procedure",
    pattern:
      /(?:self[- ]hosted\s+supabase.{0,120}\b(?:deploy|deployment|production|prod|run|compose|host)\b|\b(?:deploy|deployment|production|prod|run|compose|host)\b.{0,120}self[- ]hosted\s+supabase)/i, // [retired-deploy-reference-allow]
  },
  {
    label: "NextAuth installation, environment guidance, or runtime import",
    pattern:
      /(?:\b(?:npm|pnpm|yarn)\s+(?:add|install)\s+next-auth\b|\bNEXTAUTH_(?:URL|SECRET|DEBUG)\b|\bfrom\s+["']next-auth(?:\/[^"']+)?["']|\brequire\(["']next-auth(?:\/[^"']+)?["'])/i, // [retired-deploy-reference-allow]
  },
];

function trackedFiles(root) {
  const output = execFileSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function normalized(relative) {
  return relative.replaceAll("\\", "/").toLowerCase();
}

function isRetiredPath(relative) {
  const candidate = normalized(relative);
  return RETIRED_PATHS.some((retired) => {
    const target = retired.toLowerCase();
    return target.endsWith("/") ? candidate.startsWith(target) : candidate === target;
  });
}

function readTrackedText(root, relative) {
  const absolute = path.join(root, relative);
  let content;
  try {
    content = fs.lstatSync(absolute).isSymbolicLink()
      ? Buffer.from(fs.readlinkSync(absolute))
      : fs.readFileSync(absolute);
  } catch {
    return null;
  }
  if (content.includes(0)) return null;
  return content.toString("utf8");
}

export function findRetiredDeployReferences(root) {
  const findings = [];
  for (const relative of trackedFiles(root)) {
    const candidate = normalized(relative);
    if (candidate.startsWith("docs/_archive/")) continue;
    if (isRetiredPath(relative)) {
      findings.push(`${relative}: retired executable or configuration remains tracked`);
      continue;
    }

    const content = readTrackedText(root, relative);
    if (content === null) continue;
    content.split(/\r?\n/).forEach((line, index) => {
      if (line.includes(ALLOW_MARKER)) return;
      for (const rule of RETIRED_CONTENT_RULES) {
        if (rule.pattern.test(line)) {
          findings.push(`${relative}:${index + 1}: ${rule.label}: ${line.trim()}`);
          break;
        }
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
    console.error("Retired deployment references found:\n" + findings.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Retired deployment reference gate passed.");
  }
}

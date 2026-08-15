#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOW_MARKER_PATTERN =
  /\[retired-deploy-reference-allow:\s*([^\]\r\n]*\S[^\]\r\n]*)\s*\]/i;
const ANY_ALLOW_MARKER_PATTERN =
  /\[retired-deploy-reference-allow(?:[^\]]*)?\]/i;

export function retiredReferenceAllow(reason) {
  return `[retired-deploy-reference-allow: ${reason}]`;
}

const POLICY_SOURCE_PATHS = new Set([
  ".claude/settings.json",
  "scripts/check-retired-deploy-references.mjs",
  "scripts/check-retired-deploy-references.test.mjs",
  "scripts/hooks/core.mjs",
  "scripts/hooks/core.test.mjs",
  "scripts/hooks/patina-hooks.mjs",
]);

const RETIRED_PATHS = [
  ".github/workflows/docker-publish.yml",
  "infra/.env.example",
  "infra/Dockerfile.edge-runtime",
  "infra/Dockerfile.nestjs",
  "infra/Dockerfile.nextjs",
  "infra/build-and-push.sh",
  "infra/cloudflare-tunnel-config.yml",
  "infra/coolify/",
  "infra/coolify-deploy.sh",
  "infra/coolify-setup.sh",
  "infra/deploy.sh",
  "infra/docker-compose.deploy.yml",
  "infra/docker-compose.frontend.yml",
  "infra/docker-compose.services.yml",
  "infra/docker-compose.supabase.yml",
  "infra/seed-prod-middlewest-accounts.sh",
  "infra/seed-prod-middlewest-accounts.sql",
  "infra/seed-prod-test-account.sh",
  "infra/seed-prod-test-account.sql",
  "infra/volumes/",
  "scripts/deploy-edge-functions.sh",
  "scripts/remote-db.sh",
  "supabase/functions/main/",
];

const RETIRED_BASENAMES = new Set([
  "build-and-push.sh",
  "cloudflare-tunnel-config.yml",
  "coolify-deploy.sh",
  "coolify-setup.sh",
  "deploy-edge-functions.sh",
  "docker-publish.yml",
  "remote-db.sh",
]);

const RETIRED_CONTENT_RULES = [
  {
    label: "retired executable or configuration path",
    pattern:
      /(?:\.github\/workflows\/docker-publish\.yml|infra\/\.env\.example|infra\/dockerfile\.(?:edge-runtime|nestjs|nextjs)|infra\/(?:build-and-push|deploy)\.sh|infra\/cloudflare-tunnel-config\.yml|infra\/coolify(?:\/|-(?:deploy|setup)\.sh)|infra\/docker-compose\.(?:deploy|frontend|services|supabase)\.yml|infra\/seed-prod-(?:middlewest-accounts|test-account)\.(?:sh|sql)|infra\/volumes\/|scripts\/(?:deploy-edge-functions|remote-db)\.sh|supabase\/functions\/main(?:\/index\.ts)?|\b(?:coolify-deploy|coolify-setup|deploy-edge-functions|remote-db)\.sh\b)/i,
  },
  {
    label: "retired deployment platform procedure",
    pattern:
      /(?:\bcoolify\b.{0,120}\b(?:deploy|deployment|ssh|configure|restart|pull|push|build)\b|\b(?:deploy|deployment|ssh|configure|restart|pull|push|build)\b.{0,120}\bcoolify\b|ghcr\.io\/kodeman|cfargotunnel\.com|cloudflared\s+tunnel|192\.168\.1\.14)/i,
  },
  {
    label: "retired self-hosted Supabase procedure",
    pattern:
      /(?:self[- ]hosted\s+supabase.{0,120}\b(?:deploy|deployment|production|prod|run|compose|host)\b|\b(?:deploy|deployment|production|prod|run|compose|host)\b.{0,120}self[- ]hosted\s+supabase)/i,
  },
  {
    label: "retired mobile deployment target or host",
    pattern:
      /(?:\bselfhosted\b|(?:storage|realtime|search|ml)\.patina\.cloud)/i,
  },
  {
    label: "NextAuth installation, environment guidance, or runtime import",
    pattern:
      /(?:\b(?:npm|pnpm|yarn)\s+(?:add|install)\s+next-auth\b|\bNEXTAUTH_(?:URL|SECRET|DEBUG)\b|\bfrom\s+["']next-auth(?:\/[^"']+)?["']|\brequire\(["']next-auth(?:\/[^"']+)?["'])/i,
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
  return relative
    .replaceAll("\\", "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase();
}

function isRetiredPath(relative) {
  const candidate = normalized(relative);
  if (RETIRED_BASENAMES.has(path.posix.basename(candidate))) return true;
  return RETIRED_PATHS.some((retiredPath) => {
    const target = normalized(retiredPath);
    return target.endsWith("/") ? candidate.startsWith(target) : candidate === target;
  });
}

function isApprovedProse(relative) {
  return /\.(?:html?|md|mdx)$/i.test(relative);
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
    if (POLICY_SOURCE_PATHS.has(candidate)) continue;
    if (isRetiredPath(relative)) {
      findings.push(`${relative}: retired executable or configuration remains tracked`);
      continue;
    }

    const content = readTrackedText(root, relative);
    if (content === null) continue;
    content.split(/\r?\n/).forEach((line, index) => {
      if (ANY_ALLOW_MARKER_PATTERN.test(line)) {
        if (!isApprovedProse(relative)) {
          findings.push(
            `${relative}:${index + 1}: allow marker is permitted only in reviewed prose files`,
          );
          return;
        }
        const marker = line.match(ALLOW_MARKER_PATTERN);
        if (!marker || !marker[1].trim()) {
          findings.push(
            `${relative}:${index + 1}: allow marker requires a nonempty rationale`,
          );
          return;
        }
        return;
      }
      const normalizedLine = normalized(line);
      for (const rule of RETIRED_CONTENT_RULES) {
        if (rule.pattern.test(normalizedLine)) {
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

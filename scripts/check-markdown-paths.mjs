#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CHECKED_MARKDOWN_FILES = [
  ".agents/skills/README.md",
  "apps/client-portal/WEBSOCKET_FIX_SUMMARY.md",
  "docs/prds/consolidated/09-help-guidance.md",
  "docs/prds/consolidated/12-platform-infra.md",
];

const LINK_PATTERN = /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g;

function localDestination(raw) {
  const destination = raw.replace(/^<|>$/g, "");
  if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(destination)) return null;
  const withoutFragment = destination.split(/[?#]/, 1)[0];
  if (!withoutFragment) return null;
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

export function findBrokenMarkdownPaths(
  root,
  checkedFiles = CHECKED_MARKDOWN_FILES,
) {
  const findings = [];
  for (const relative of checkedFiles) {
    const documentPath = path.join(root, relative);
    if (!fs.existsSync(documentPath)) {
      findings.push(`${relative}: checked Markdown file is missing`);
      continue;
    }

    const content = fs.readFileSync(documentPath, "utf8");
    for (const match of content.matchAll(LINK_PATTERN)) {
      const destination = localDestination(match[1]);
      if (!destination) continue;
      const target = destination.startsWith("/")
        ? path.resolve(root, destination.slice(1))
        : path.resolve(path.dirname(documentPath), destination);
      const withinRoot = target === root || target.startsWith(`${root}${path.sep}`);
      if (!withinRoot) {
        findings.push(`${relative}: link escapes repository: ${match[1]}`);
      } else if (!fs.existsSync(target)) {
        findings.push(`${relative}: missing link target: ${match[1]}`);
      }
    }
  }
  return findings;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = findBrokenMarkdownPaths(root);
  if (findings.length) {
    console.error(`Broken checked Markdown paths:\n${findings.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("Checked Markdown path gate passed.");
  }
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ALLOW_MARKER,
  findRetiredDeployReferences,
} from "./check-retired-deploy-references.mjs";

async function repo(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "patina-retired-gate-"));
  execFileSync("git", ["init", "-q", root]);
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content);
  }
  execFileSync("git", ["-C", root, "add", "--", ...Object.keys(files)]);
  return root;
}

test("flags every tracked retired executable, configuration, and volume path", async () => {
  const root = await repo({
    "infra/CooLiFy/deploy.yaml": "service: stale\n", // [retired-deploy-reference-allow]
    "infra/Dockerfile.nestjs": "FROM node:20\n", // [retired-deploy-reference-allow]
    "infra/volumes/db/roles.sql": "select 1;\n", // [retired-deploy-reference-allow]
    "scripts/deploy-edge-functions.sh": "#!/bin/sh\n", // [retired-deploy-reference-allow]
  });
  const findings = findRetiredDeployReferences(root);
  assert.equal(findings.length, 4);
  assert.ok(findings.some((finding) => finding.includes("infra/CooLiFy")));
  assert.ok(findings.some((finding) => finding.includes("infra/volumes")));
});

test("scans canonical PRDs and handoffs, not only selected documentation roots", async () => {
  const root = await repo({
    "docs/prds/consolidated/12-platform-infra.md": "Deploy with Coolify today.\n", // [retired-deploy-reference-allow]
    "docs/prds/auth.md": "Set NEXTAUTH_SECRET before the production build.\n", // [retired-deploy-reference-allow]
    "handoffs/release.md": "Pull ghcr.io/kodeman/patina:latest.\n", // [retired-deploy-reference-allow]
    "random/deploy.txt": "Run cloudflared tunnel for production.\n", // [retired-deploy-reference-allow]
  });
  const findings = findRetiredDeployReferences(root);
  assert.equal(findings.length, 4);
  assert.ok(findings.some((finding) => finding.startsWith("docs/prds/consolidated/")));
  assert.ok(findings.some((finding) => finding.startsWith("handoffs/")));
});

test("excludes only docs/_archive and requires the exact allow marker", async () => {
  const root = await repo({
    "docs/_archive/deploy.md": "Run ./infra/deploy.sh now.\n", // [retired-deploy-reference-allow]
    "docs/operations/allowed.md": `Deploy with Coolify. ${ALLOW_MARKER}\n`, // [retired-deploy-reference-allow]
    "docs/operations/not-allowed.md": "Coolify is retired; never deploy there.\n", // [retired-deploy-reference-allow]
  });
  const findings = findRetiredDeployReferences(root);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /not-allowed\.md/);
});

test("ignores untracked files and tracked binary content", async () => {
  const root = await repo({ "tracked.bin": Buffer.from("Coolify deploy\0binary") }); // [retired-deploy-reference-allow]
  await writeFile(path.join(root, "untracked.md"), "Deploy with Coolify.\n"); // [retired-deploy-reference-allow]
  assert.deepEqual(findRetiredDeployReferences(root), []);
});

test("mandatory pre-push hook cannot bypass the tracked-file gate", async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const hook = await readFile(path.join(root, ".husky/pre-push"), "utf8");
  const runner = await readFile(path.join(root, "scripts/hooks/patina-hooks.mjs"), "utf8");
  assert.match(hook, /patina-hooks\.mjs pre-push/);
  assert.doesNotMatch(hook, /\|\|\s*true/);
  assert.match(runner, /check-retired-deploy-references\.mjs/); // [retired-deploy-reference-allow]
});

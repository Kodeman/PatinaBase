import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findRetiredDeployReferences } from "./check-retired-deploy-references.mjs";

test("flags retired executable files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patina-retired-gate-"));
  await mkdir(path.join(root, "infra"), { recursive: true });
  await writeFile(path.join(root, "infra/deploy.sh"), "#!/bin/sh\n");

  assert.ok(
    findRetiredDeployReferences(root).some((finding) =>
      finding.includes("infra/deploy.sh"),
    ),
  );
});

test("flags active procedures but allows explicit retirement notices and archives", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patina-retired-gate-"));
  await mkdir(path.join(root, "docs/operations"), { recursive: true });
  await mkdir(path.join(root, "docs/_archive/operations"), { recursive: true });
  await writeFile(
    path.join(root, "docs/operations/deploy.md"),
    [
      "Deploy through Coolify now.",
      "Pull ghcr.io/kodeman/patina:latest.",
      "Run cloudflared tunnel for production.",
      "Coolify is retired; never deploy there.",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "docs/_archive/operations/deploy.md"),
    "Run ./infra/deploy.sh\n",
  );

  const findings = findRetiredDeployReferences(root);
  assert.equal(findings.length, 3);
  assert.match(findings[0], /Deploy through Coolify now/);
  assert.match(findings[1], /ghcr\.io/);
  assert.match(findings[2], /cloudflared tunnel/);
});

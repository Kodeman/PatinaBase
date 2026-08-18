import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findRetiredDeployReferences,
  retiredReferenceAllow,
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
    "infra/CooLiFy/deploy.yaml": "service: stale\n",
    "nested/infra/CooLiFy/deploy.yaml": "service: stale nested\n",
    "infra/Dockerfile.nestjs": "FROM node:20\n",
    "infra/volumes/db/roles.sql": "select 1;\n",
    "nested/infra/CooLiFy-Deploy.sh": "#!/bin/sh\n",
    "scripts/deploy-edge-functions.sh": "#!/bin/sh\n",
    "supabase/functions/main/index.ts": "Deno.serve(() => new Response());\n",
  });
  const findings = findRetiredDeployReferences(root);
  assert.equal(findings.length, 7);
  assert.ok(findings.some((finding) => finding.includes("infra/CooLiFy")));
  assert.ok(findings.some((finding) => finding.includes("infra/volumes")));
  assert.ok(findings.some((finding) => finding.includes("functions/main")));
});

test("scans canonical PRDs and handoffs, not only selected documentation roots", async () => {
  const root = await repo({
    "docs/prds/consolidated/12-platform-infra.md": "Deploy with Coolify today.\n",
    "docs/prds/auth.md": "Set NEXTAUTH_SECRET before the production build.\n",
    "handoffs/release.md": "Pull ghcr.io/kodeman/patina:latest.\n",
    "random/deploy.txt": "Run cloudflared tunnel for production.\n",
  });
  const findings = findRetiredDeployReferences(root);
  assert.equal(findings.length, 4);
  assert.ok(findings.some((finding) => finding.startsWith("docs/prds/consolidated/")));
  assert.ok(findings.some((finding) => finding.startsWith("handoffs/")));
});

test("excludes archives and accepts only reasoned prose markers", async () => {
  const root = await repo({
    "docs/_archive/deploy.md": "Run ./infra/deploy.sh now.\n",
    "AGENTS.md": `Deploy with Coolify. ${retiredReferenceAllow("documents the retired platform prohibition")}\n`,
    "docs/operations/not-allowed.md": "Coolify is retired; never deploy there.\n",
  });
  const findings = findRetiredDeployReferences(root);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /not-allowed\.md/);
});

test("rejects empty, legacy, non-allowlisted, and executable MDX markers", async () => {
  const root = await repo({
    "AGENTS.md": "Deploy with Coolify. [retired-deploy-reference-allow:]\n",
    "CLAUDE.md": "Deploy with Coolify. [retired-deploy-reference-allow]\n",
    "docs/operations/unreviewed.md": `Deploy with Coolify. ${retiredReferenceAllow("not an approved marker location")}\n`,
    "apps/portal/page.mdx": `Deploy with Coolify. ${retiredReferenceAllow("executable prose")}\n`,
    "src/config.ts": `const target = "Coolify deploy"; // ${retiredReferenceAllow("test fixture")}\n`,
  });
  const findings = findRetiredDeployReferences(root);
  assert.equal(findings.length, 5);
  assert.equal(
    findings.filter((finding) => finding.includes("nonempty rationale")).length,
    2,
  );
  assert.equal(
    findings.filter((finding) => finding.includes("reviewed prose allowlist")).length,
    3,
  );
});

test("normalizes retired reference variants and blocks mobile legacy targets", async () => {
  const root = await repo({
    "docs/ops.md": [
      "Run infra\\coolify\\coolify-deploy.sh.",
      "Run infra/coolify-deploy.sh.",
      "Run coolify-deploy.sh.",
      "case selfHosted",
      "wss://realtime.patina.cloud/socket",
    ].join("\n"),
  });
  assert.equal(findRetiredDeployReferences(root).length, 5);
});

test("explicit policy sources may name blocked targets", async () => {
  const root = await repo({
    ".claude/settings.json": '{"deny":["Bash(ssh *192.168.1.14*)"]}\n',
    "scripts/hooks/core.mjs": 'const blocked = "infra/coolify-deploy.sh";\n',
    "scripts/hooks/core.test.mjs": 'assert(blocks("selfHosted"));\n',
    "scripts/hooks/patina-hooks.mjs": 'run("scripts/check-retired-deploy-references.mjs");\n',
    "scripts/check-retired-deploy-references.mjs": "export {};\n",
    "scripts/check-retired-deploy-references.test.mjs": "export {};\n",
  });
  assert.deepEqual(findRetiredDeployReferences(root), []);
});

test("preserves local Supabase, root Docker, MinIO, and Cloudflare units", async () => {
  const root = await repo({
    "docker-compose.yml": "services:\n  minio:\n    image: minio/minio\n",
    "docs/local.md": "Use http://127.0.0.1:54321 and http://localhost:9000.\n",
    "infra/orders-worker/wrangler.jsonc": '{"name":"patina-orders-worker"}\n',
  });
  assert.deepEqual(findRetiredDeployReferences(root), []);
});

test("ignores untracked files and tracked binary content", async () => {
  const root = await repo({ "tracked.bin": Buffer.from("Coolify deploy\0binary") });
  await writeFile(path.join(root, "untracked.md"), "Deploy with Coolify.\n");
  assert.deepEqual(findRetiredDeployReferences(root), []);
});

test("mandatory pre-push hook cannot bypass the tracked-file gate", async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const hook = await readFile(path.join(root, ".husky/pre-push"), "utf8");
  const runner = await readFile(path.join(root, "scripts/hooks/patina-hooks.mjs"), "utf8");
  assert.match(hook, /patina-hooks\.mjs pre-push/);
  assert.doesNotMatch(hook, /\|\|\s*true/);
  assert.match(runner, /check-retired-deploy-references\.mjs/);
  assert.match(runner, /check-markdown-paths\.mjs/);
});

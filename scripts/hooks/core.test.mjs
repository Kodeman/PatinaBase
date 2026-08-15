import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  agentHookOutput,
  classifyPaths,
  createDeployPlan,
  evaluateCommand,
  inspectPaths,
  scanSecrets,
} from "./core.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

test("command policy blocks dangerous shortcuts and retired production paths", async () => {
  const blocked = [
    "git add -A",
    "git add .",
    "pnpm dev",
    "./infra/build-and-push.sh designer-portal", // [retired-deploy-reference-allow]
    "supabase db push",
    "npx wrangler deploy",
    "cd apps/designer-portal && npx opennextjs-cloudflare build",
  ];

  for (const command of blocked) {
    const findings = await evaluateCommand(command, {
      root: repoRoot,
      cwd: repoRoot,
      env: {},
    });
    assert.ok(
      findings.some((finding) => finding.blocking),
      command,
    );
  }
});

test("command policy allows scoped development, staging, and explicit emergency deploy sessions", async () => {
  for (const command of [
    "pnpm dev:minimal",
    "git add scripts/hooks/core.mjs",
  ]) {
    const findings = await evaluateCommand(command, {
      root: repoRoot,
      cwd: repoRoot,
      env: {},
    });
    assert.equal(
      findings.some((finding) => finding.blocking),
      false,
      command,
    );
  }

  const findings = await evaluateCommand("supabase db push", {
    root: repoRoot,
    cwd: repoRoot,
    env: { PATINA_ALLOW_LOCAL_PROD_DEPLOY: "1" },
  });
  assert.equal(
    findings.some((finding) => finding.blocking),
    false,
  );
});

test("database resets are denied when the portal environment points at production", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "patina-hooks-"));
  await mkdir(path.join(root, "apps/designer-portal"), { recursive: true });
  await writeFile(
    path.join(root, "apps/designer-portal/.env.local"),
    "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\n",
  );

  const findings = await evaluateCommand("pnpm supabase:reset", {
    root,
    cwd: root,
    env: {},
  });
  assert.ok(
    findings.some(
      (finding) => finding.id === "local-db-target" && finding.blocking,
    ),
  );
});

test("path classifier uses real service builds and fans shared packages to consumers", async () => {
  const servicePlan = await classifyPaths(
    ["services/orders/src/orders.service.ts"],
    { root: repoRoot },
  );
  assert.ok(
    servicePlan.checks.some((check) =>
      check.command.includes("@patina/orders build"),
    ),
  );
  assert.equal(
    servicePlan.checks.some((check) =>
      check.command.includes("@patina/orders type-check"),
    ),
    false,
  );

  const packagePlan = await classifyPaths(["packages/types/src/index.ts"], {
    root: repoRoot,
  });
  assert.ok(packagePlan.affectedUnits.includes("@patina/types"));
  assert.ok(packagePlan.affectedUnits.some((unit) => unit.endsWith("-portal")));
});

test("shared edge-function edits enumerate importers and tests with the Deno config", async () => {
  const plan = await classifyPaths(["supabase/functions/_shared/sms.ts"], {
    root: repoRoot,
  });
  assert.equal(plan.edge, true);
  assert.ok(plan.edgeFunctions.includes("sms-dispatch"));
  assert.ok(
    plan.checks.some((check) =>
      check.command.includes("supabase/functions/deno.json"),
    ),
  );
});

test("edge runtime config changes fan out to every deployable function", async () => {
  const plan = await classifyPaths(["supabase/functions/deno.json"], {
    root: repoRoot,
  });

  assert.equal(plan.edge, true);
  assert.ok(plan.edgeFunctions.length > 10);
  assert.ok(plan.edgeFunctions.includes("automation-processor"));
  assert.ok(
    plan.checks.some((check) =>
      check.command.includes("automation-processor/index.ts"),
    ),
  );
});

test("repository policy catches secret material and invalid tracked artifacts", async () => {
  const secrets = scanSecrets(
    "STRIPE_SECRET_KEY=" + "sk_" + "live_" + "123456789012345678901234",
  );
  assert.ok(secrets.some((finding) => finding.id === "secret-stripe"));

  const findings = await inspectPaths(
    ["infra/.env.bak-production", "deno.lock"],
    {
      root: repoRoot,
      contentProvider: async () => "",
    },
  );
  assert.ok(
    findings.some((finding) => finding.id === "forbidden-sensitive-file"),
  );
  assert.ok(findings.some((finding) => finding.id === "root-deno-lock"));
});

test("deployment plans preserve the production dependency order", async () => {
  const plan = await createDeployPlan(
    [
      "supabase/migrations/00432_example.sql",
      "supabase/functions/_shared/sms.ts",
      "services/orders/src/main.ts",
      "apps/designer-portal/src/app/page.tsx",
    ],
    { root: repoRoot, baseSha: "base", releaseSha: "release" },
  );

  assert.deepEqual(
    plan.phases.map((phase) => phase.name),
    ["migrations", "edge-functions", "workers", "portals", "smoke"],
  );
  assert.ok(
    plan.phases[0].commands.some((item) => item.command === "supabase db push"),
  );
  assert.ok(
    plan.phases[3].commands.some((item) =>
      item.command.endsWith("deploy-portal.sh designer"),
    ),
  );
});

test("deployment planning fans shared packages into service workers and portals", async () => {
  const plan = await createDeployPlan(["packages/types/src/index.ts"], {
    root: repoRoot,
    baseSha: "base",
    releaseSha: "release",
  });

  assert.ok(plan.workers.includes("orders"));
  assert.ok(plan.workers.includes("projects"));
  assert.ok(plan.portals.includes("designer"));
});

test("agent output denies blockers and attaches advisory context otherwise", () => {
  const denied = agentHookOutput("PreToolUse", [
    { id: "x", severity: "error", blocking: true, message: "blocked" },
  ]);
  assert.equal(denied.continue, false);
  assert.equal(denied.hookSpecificOutput.permissionDecision, "deny");

  const allowed = agentHookOutput("PreToolUse", [
    { id: "x", severity: "warning", blocking: false, message: "heads up" },
  ]);
  assert.equal(allowed.continue, true);
  assert.match(allowed.hookSpecificOutput.additionalContext, /heads up/);
});

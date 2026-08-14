#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  agentHookOutput,
  auditRepository,
  changedPaths,
  classifyPaths,
  createDeployPlan,
  evaluateCommand,
  executeDeployPlan,
  extractCommand,
  formatFindings,
  inspectPaths,
  resolveRepoRoot,
  runChecks,
  sessionFindings,
} from "./core.mjs";

const root = resolveRepoRoot();
const [command = "help", ...args] = process.argv.slice(2);

function option(name, fallback) {
  const equals = args.find((item) => item.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function has(name) {
  return args.includes(name);
}

async function stdinJson() {
  if (process.stdin.isTTY) return {};
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function git(argsToRun) {
  return execFileSync("git", ["-C", root, ...argsToRun], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function defaultBase() {
  for (const candidate of ["origin/main", "main", "HEAD^"]) {
    try {
      git(["rev-parse", "--verify", candidate]);
      return candidate;
    } catch {
      // Try the next base available in shallow and brand-new repositories.
    }
  }
  return "HEAD";
}

function githubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  fs.appendFileSync(
    outputFile,
    `${name}=${typeof value === "string" ? value : JSON.stringify(value)}\n`,
  );
}

async function stagedContent(item) {
  try {
    return git(["show", `:${item}`]);
  } catch {
    return "";
  }
}

function toolPaths(payload) {
  const input = payload?.tool_input ?? {};
  const values = [input.file_path, input.path, input.target_file];
  if (Array.isArray(input.paths)) values.push(...input.paths);
  return values
    .filter((value) => typeof value === "string")
    .map((value) =>
      path.isAbsolute(value) ? path.relative(root, value) : value,
    )
    .filter((value) => value && !value.startsWith(".."));
}

async function agent(eventName) {
  const payload = await stdinJson();
  let findings = [];
  if (eventName === "PreToolUse") {
    findings = await evaluateCommand(extractCommand(payload), {
      root,
      cwd: payload.cwd || root,
      env: process.env,
    });
  } else if (eventName === "SessionStart") {
    findings = sessionFindings(root);
  } else if (eventName === "PostToolUse") {
    const paths = toolPaths(payload);
    findings = paths.length ? await inspectPaths(paths, { root }) : [];
  } else if (eventName === "Stop") {
    const paths = changedPaths({ root, includeUntracked: true });
    findings = await inspectPaths(paths, { root });
  }
  printJson(agentHookOutput(eventName, findings));
}

async function preCommit() {
  const paths = changedPaths({ root, staged: true });
  const findings = await inspectPaths(paths, {
    root,
    contentProvider: stagedContent,
  });
  if (findings.length) process.stderr.write(`${formatFindings(findings)}\n`);
  const formattable = paths.filter(
    (item) =>
      item !== "pnpm-lock.yaml" &&
      /\.(?:[cm]?[jt]sx?|json|css|scss|md|ya?ml)$/.test(item),
  );
  if (formattable.length) {
    const result = spawnSync(
      "pnpm",
      ["exec", "prettier", "--check", "--ignore-unknown", ...formattable],
      { cwd: root, stdio: "inherit" },
    );
    if (result.status !== 0) {
      process.stderr.write(
        "[WARN] Staged files have formatting drift; this is advisory locally.\n",
      );
    }
  }
  if (findings.some((entry) => entry.blocking)) process.exitCode = 1;
}

function commitMessage() {
  const file = args[0];
  if (!file || !fs.existsSync(file)) return;
  const subject = fs.readFileSync(file, "utf8").split(/\r?\n/)[0].trim();
  if (!subject || subject.startsWith("Merge ") || subject.startsWith("Revert "))
    return;
  const conventional =
    /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-z0-9._/-]+\))?!?: .+/;
  if (!conventional.test(subject)) {
    process.stderr.write(
      "[BLOCK] Commit subject must use Conventional Commits, for example `feat(automation): add lifecycle hooks`.\n",
    );
    process.exitCode = 1;
  }
}

async function policy() {
  const staged = has("--staged");
  const base = option("--base", staged ? undefined : defaultBase());
  const head = option("--head", "HEAD");
  const paths = changedPaths({
    root,
    base,
    head,
    staged,
    includeUntracked: has("--include-untracked"),
  });
  const findings = await inspectPaths(paths, {
    root,
    contentProvider: staged ? stagedContent : undefined,
  });
  if (has("--json")) printJson({ paths, findings });
  else process.stdout.write(`${formatFindings(findings)}\n`);
  if (has("--strict") && findings.some((entry) => entry.blocking))
    process.exitCode = 1;
}

async function verify() {
  const base = option("--base", defaultBase());
  const head = option("--head", "HEAD");
  const paths = changedPaths({
    root,
    base,
    head,
    includeUntracked: has("--include-untracked"),
  });
  const plan = await classifyPaths(paths, { root });
  if (has("--json") || !has("--run")) printJson(plan);
  if (has("--run")) {
    const result = runChecks(plan.checks, { root, strict: has("--strict") });
    if (!result.passed)
      process.stderr.write("\nAffected verification has failures.\n");
    process.exitCode = result.exitCode;
  }
}

async function prePush() {
  const base = option("--base", defaultBase());
  const head = option("--head", "HEAD");
  const paths = changedPaths({ root, base, head });
  const verification = await classifyPaths(paths, { root });
  const localBudget = Number(option("--max-checks", "12"));

  if (verification.checks.length > localBudget) {
    process.stdout.write(
      `Affected plan contains ${verification.checks.length} checks, above the local push budget of ${localBudget}. CI will run the full plan.\n`,
    );
    process.stdout.write(
      `${verification.checks.map((check) => `- ${check.command}`).join("\n")}\n`,
    );
    return;
  }

  const result = runChecks(verification.checks, { root, strict: false });
  if (!result.passed)
    process.stderr.write("\nAffected verification has advisory failures.\n");
}

async function plan() {
  const base = option("--base", defaultBase());
  const head = option("--head", "HEAD");
  const paths = changedPaths({ root, base, head });
  const classified = await classifyPaths(paths, { root });
  githubOutput("changed_paths", classified.changedPaths);
  githubOutput("checks", classified.checks);
  githubOutput("node", classified.node);
  githubOutput("database", classified.database);
  githubOutput("edge", classified.edge);
  githubOutput("ios_patina", classified.iosPatina);
  githubOutput("ios_capture", classified.iosCapture);
  githubOutput("aesthete", classified.aesthete);
  printJson(classified);
}

async function deploymentPlan() {
  const base = option("--base", defaultBase());
  const release = option("--release", "HEAD");
  const baseSha = git(["rev-parse", base]).trim();
  const releaseSha = git(["rev-parse", release]).trim();
  const paths = changedPaths({ root, base: baseSha, head: releaseSha });
  const manifest = await createDeployPlan(paths, {
    root,
    baseSha,
    releaseSha,
    scope: option("--scope", "affected"),
    reason: option("--reason"),
    requestedBy: option("--requested-by"),
  });
  const output = option("--output");
  if (output)
    fs.writeFileSync(
      path.resolve(root, output),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  else printJson(manifest);
}

function deploy() {
  const manifestFile = option("--manifest");
  if (!manifestFile) throw new Error("--manifest is required");
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(root, manifestFile), "utf8"),
  );
  const results = executeDeployPlan(manifest, {
    root,
    dryRun: has("--dry-run"),
  });
  const record = { releaseSha: manifest.releaseSha, results };
  const output = option("--output");
  if (output)
    fs.writeFileSync(
      path.resolve(root, output),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  printJson(record);
}

async function audit() {
  const findings = await auditRepository(root);
  if (has("--json"))
    printJson({ generatedAt: new Date().toISOString(), findings });
  else process.stdout.write(`${formatFindings(findings)}\n`);
}

async function main() {
  switch (command) {
    case "agent":
      return agent(args[0]);
    case "pre-commit":
      return preCommit();
    case "commit-msg":
      return commitMessage();
    case "pre-push":
      return prePush();
    case "policy":
      return policy();
    case "verify":
      return verify();
    case "plan":
      return plan();
    case "deploy-plan":
      return deploymentPlan();
    case "deploy":
      return deploy();
    case "audit":
      return audit();
    default:
      process.stdout.write(
        "Usage: patina-hooks <agent|pre-commit|commit-msg|pre-push|policy|verify|plan|deploy-plan|deploy|audit> [options]\n",
      );
  }
}

main().catch((error) => {
  process.stderr.write(`patina-hooks: ${error.message}\n`);
  process.exitCode = 1;
});

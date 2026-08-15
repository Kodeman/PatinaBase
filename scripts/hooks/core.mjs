import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORTALS = ["admin", "client", "designer", "manufacturer"];
const RETIRED_DEPLOY_PATTERNS = [
  /(?:^|[\s;&|])(?:\.\/)?infra\/deploy\.sh(?:\s|$)/,
  /(?:^|[\s;&|])(?:\.\/)?infra\/build-and-push\.sh(?:\s|$)/,
  /(?:^|[\s;&|])(?:\.\/)?scripts\/remote-db\.sh(?:\s|$)/,
  /(?:^|[\s;&|])(?:\.\/)?scripts\/deploy-edge-functions\.sh(?:\s|$)/,
  /infra\/coolify\//,
  /coolify\.patina\.cloud/,
];

const PROD_MUTATION_PATTERNS = [
  /\bsupabase\s+db\s+push\b/,
  /\bsupabase\s+functions\s+deploy\b/,
  /\bsupabase\s+secrets\s+set\b/,
  /\bwrangler\s+deploy\b/,
  /(?:^|[\s;&|])(?:\.\/)?infra\/deploy-portal\.sh\b/,
];

const LOCAL_DB_MUTATION_PATTERN =
  /\b(?:supabase(?::|\s+)(?:reset|db\s+reset)|seed(?::|\s)|db\s+reset)\b/;

const WORKER_CONFIG = {
  orders: {
    dir: "infra/orders-worker",
    name: "patina-orders-worker",
    smoke: "https://patina-orders-worker.kody-be3.workers.dev/v1/health",
  },
  projects: {
    dir: "infra/projects-worker",
    name: "patina-projects-worker",
    smoke: "https://patina-projects-worker.kody-be3.workers.dev/v1/health",
  },
  "media-svc": {
    dir: "infra/media-svc-worker",
    name: "patina-media-svc-worker",
    smoke: "https://patina-media-svc-worker.kody-be3.workers.dev/health",
  },
  media: {
    dir: "infra/media-worker",
    name: "patina-media-worker",
    smoke: "https://patina-media-worker.kody-be3.workers.dev/health",
  },
  inference: {
    dir: "infra/inference-worker",
    name: "patina-inference-worker",
    smoke: "https://patina-inference-worker.kody-be3.workers.dev/healthz",
  },
};

function finding(id, severity, blocking, message, remediation) {
  return {
    id,
    severity,
    blocking,
    message,
    ...(remediation ? { remediation } : {}),
  };
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function unique(values) {
  return [...new Set(values)];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function git(root, args, options = {}) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

export function resolveRepoRoot(cwd = process.cwd()) {
  try {
    return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    return path.resolve(cwd);
  }
}

function workspaceManifests(root) {
  const manifests = [];
  for (const parent of ["apps", "packages", "services", "studios"]) {
    const parentPath = path.join(root, parent);
    if (!fs.existsSync(parentPath)) continue;
    for (const entry of fs.readdirSync(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relativeDir = `${parent}/${entry.name}`;
      const manifestPath = path.join(root, relativeDir, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath);
      manifests.push({
        name: manifest.name,
        dir: relativeDir,
        scripts: manifest.scripts ?? {},
        dependencies: {
          ...(manifest.dependencies ?? {}),
          ...(manifest.devDependencies ?? {}),
          ...(manifest.peerDependencies ?? {}),
        },
      });
    }
  }
  return manifests.filter((manifest) => manifest.name);
}

function affectedWorkspaces(paths, root) {
  const manifests = workspaceManifests(root);
  const byName = new Map(
    manifests.map((manifest) => [manifest.name, manifest]),
  );
  const direct = new Set();

  const rootWide = paths.some((item) =>
    [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "turbo.json",
    ].includes(item),
  );
  if (rootWide) {
    for (const manifest of manifests) direct.add(manifest.name);
  } else {
    for (const manifest of manifests) {
      if (
        paths.some(
          (item) =>
            item === manifest.dir || item.startsWith(`${manifest.dir}/`),
        )
      )
        direct.add(manifest.name);
    }
  }

  const reverse = new Map();
  for (const manifest of manifests) {
    for (const dependency of Object.keys(manifest.dependencies)) {
      if (!byName.has(dependency)) continue;
      if (!reverse.has(dependency)) reverse.set(dependency, new Set());
      reverse.get(dependency).add(manifest.name);
    }
  }

  const affected = new Set(direct);
  const queue = [...direct];
  while (queue.length) {
    const current = queue.shift();
    for (const consumer of reverse.get(current) ?? []) {
      if (affected.has(consumer)) continue;
      affected.add(consumer);
      queue.push(consumer);
    }
  }

  return {
    direct,
    affected,
    manifests,
    byName,
  };
}

function hasFlatLintConfig(root, dir) {
  return ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs"].some(
    (name) => fs.existsSync(path.join(root, dir, name)),
  );
}

function addCheck(checks, check) {
  if (!checks.some((candidate) => candidate.command === check.command))
    checks.push(check);
}

function workspaceChecks(workspaceState, root) {
  const checks = [];
  const ordered = [...workspaceState.affected]
    .map((name) => workspaceState.byName.get(name))
    .filter(Boolean)
    .sort((left, right) => {
      const leftDirect = workspaceState.direct.has(left.name) ? 0 : 1;
      const rightDirect = workspaceState.direct.has(right.name) ? 0 : 1;
      return leftDirect - rightDirect || left.dir.localeCompare(right.dir);
    });

  for (const manifest of ordered) {
    const isRetainedService = [
      "@patina/orders",
      "@patina/media",
      "@patina/projects",
    ].includes(manifest.name);
    const isAdmin = manifest.name === "@patina/admin-portal";
    const gate =
      isRetainedService || isAdmin
        ? manifest.scripts.build
          ? "build"
          : null
        : manifest.scripts["type-check"]
          ? "type-check"
          : manifest.scripts.build
            ? "build"
            : null;

    if (gate) {
      addCheck(checks, {
        id: `${manifest.name}:${gate}`,
        scope: manifest.name,
        command: `pnpm --filter ${manifest.name} ${gate}`,
        tier: "fast",
      });
    }

    if (manifest.scripts.test) {
      addCheck(checks, {
        id: `${manifest.name}:test`,
        scope: manifest.name,
        command: `pnpm --filter ${manifest.name} test`,
        tier: "fast",
      });
    }

    if (
      manifest.scripts.lint &&
      !manifest.scripts.lint.includes("--fix") &&
      hasFlatLintConfig(root, manifest.dir)
    ) {
      addCheck(checks, {
        id: `${manifest.name}:lint`,
        scope: manifest.name,
        command: `pnpm --filter ${manifest.name} lint`,
        tier: "fast",
      });
    }

    if (manifest.name === "@patina/extension" && manifest.scripts.build) {
      addCheck(checks, {
        id: `${manifest.name}:build`,
        scope: manifest.name,
        command: `pnpm --filter ${manifest.name} build`,
        tier: "fast",
      });
    }
  }

  return checks;
}

function edgeImporters(root, sharedPaths) {
  const functionsRoot = path.join(root, "supabase/functions");
  if (!fs.existsSync(functionsRoot)) return [];
  const needles = sharedPaths.map((item) =>
    path.basename(item, path.extname(item)),
  );
  const importers = [];
  for (const entry of fs.readdirSync(functionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const indexFile = path.join(functionsRoot, entry.name, "index.ts");
    if (!fs.existsSync(indexFile)) continue;
    const source = fs.readFileSync(indexFile, "utf8");
    if (needles.some((needle) => source.includes(`_shared/${needle}`)))
      importers.push(entry.name);
  }
  return importers.sort();
}

function deployableEdgeFunctions(root) {
  const functionsRoot = path.join(root, "supabase/functions");
  if (!fs.existsSync(functionsRoot)) return [];
  return fs
    .readdirSync(functionsRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith("_") &&
        fs.existsSync(path.join(functionsRoot, entry.name, "index.ts")),
    )
    .map((entry) => entry.name)
    .sort();
}

function edgePlan(paths, root) {
  const edgePaths = paths.filter((item) =>
    item.startsWith("supabase/functions/"),
  );
  if (!edgePaths.length) return { edge: false, edgeFunctions: [], checks: [] };

  const availableFunctions = deployableEdgeFunctions(root);
  const availableSet = new Set(availableFunctions);
  const shared = edgePaths.filter(
    (item) =>
      item.startsWith("supabase/functions/_shared/") && item.endsWith(".ts"),
  );
  const directFunctions = edgePaths
    .map((item) => item.split("/")[2])
    .filter((name) => availableSet.has(name));
  const runtimeWide = edgePaths.some((item) =>
    [
      "supabase/functions/deno.json",
      "supabase/functions/import_map.json",
    ].includes(item),
  );
  const edgeFunctions = unique(
    runtimeWide
      ? availableFunctions
      : [...directFunctions, ...edgeImporters(root, shared)],
  ).sort();
  const checks = [];

  for (const name of edgeFunctions) {
    const indexFile = `supabase/functions/${name}/index.ts`;
    if (!fs.existsSync(path.join(root, indexFile))) continue;
    addCheck(checks, {
      id: `edge:${name}:check`,
      scope: `edge:${name}`,
      command: `deno check --config supabase/functions/deno.json ${indexFile}`,
      tier: "fast",
    });
  }

  for (const item of edgePaths) {
    const testFile = item.endsWith(".test.ts")
      ? item
      : item.replace(/\.ts$/, ".test.ts");
    if (!fs.existsSync(path.join(root, testFile))) continue;
    addCheck(checks, {
      id: `edge-test:${testFile}`,
      scope: "edge-tests",
      command: `deno test --allow-all --config supabase/functions/deno.json ${testFile}`,
      tier: "fast",
    });
  }

  return { edge: true, edgeFunctions, checks };
}

export async function classifyPaths(
  rawPaths,
  { root = resolveRepoRoot() } = {},
) {
  const paths = unique(rawPaths.map(normalizePath).filter(Boolean)).sort();
  const workspaceState = affectedWorkspaces(paths, root);
  const checks = workspaceChecks(workspaceState, root);
  const edges = edgePlan(paths, root);
  for (const check of edges.checks) addCheck(checks, check);

  const database = paths.some(
    (item) =>
      item.startsWith("supabase/migrations/") ||
      item.startsWith("supabase/seed/") ||
      item.startsWith("supabase/tests/"),
  );
  const iosPatina = paths.some((item) =>
    item.startsWith("apps/mobile/Patina/"),
  );
  const iosCapture = paths.some((item) =>
    item.startsWith("apps/mobile/Capture/"),
  );
  const aesthete = paths.some((item) =>
    item.startsWith("services/aesthete-inference/"),
  );

  if (aesthete) {
    addCheck(checks, {
      id: "aesthete:test",
      scope: "services/aesthete-inference",
      command: "make -C services/aesthete-inference test",
      tier: "fast",
    });
  }

  return {
    changedPaths: paths,
    affectedUnits: [...workspaceState.affected].sort(),
    affectedWorkspaceDirs: [...workspaceState.affected]
      .map((name) => workspaceState.byName.get(name)?.dir)
      .filter(Boolean)
      .sort(),
    checks,
    node: workspaceState.affected.size > 0 || aesthete,
    database,
    edge: edges.edge,
    edgeFunctions: edges.edgeFunctions,
    iosPatina,
    iosCapture,
    aesthete,
  };
}

function readDotenvValue(file, variable) {
  if (!fs.existsSync(file)) return undefined;
  let result;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(
      new RegExp(`^\\s*(?:export\\s+)?${variable}=(.*)$`),
    );
    if (!match) continue;
    result = match[1].trim().replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
  }
  return result;
}

function portalSupabaseUrl(root, env) {
  if (Object.prototype.hasOwnProperty.call(env, "NEXT_PUBLIC_SUPABASE_URL"))
    return env.NEXT_PUBLIC_SUPABASE_URL;
  return readDotenvValue(
    path.join(root, "apps/designer-portal/.env.local"),
    "NEXT_PUBLIC_SUPABASE_URL",
  );
}

function posthogFindings(root) {
  const file = path.join(root, "apps/designer-portal/.env.local");
  const required = {
    NEXT_PUBLIC_POSTHOG_KEY: (value) => value?.startsWith("phc_"),
    NEXT_PUBLIC_POSTHOG_HOST: Boolean,
    NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV: (value) => value === "true",
  };
  const missing = Object.entries(required)
    .filter(([name, predicate]) => !predicate(readDotenvValue(file, name)))
    .map(([name]) => name);
  if (!missing.length) return [];
  return [
    finding(
      "posthog-dev-env",
      "warning",
      false,
      `PostHog dev env is incomplete (${missing.join(", ")}); feature flags will fail closed.`,
      "Set the PostHog values or NEXT_PUBLIC_FLAG_OVERRIDES in apps/designer-portal/.env.local, then restart dev.",
    ),
  ];
}

export async function evaluateCommand(
  command,
  { root = resolveRepoRoot(), cwd = root, env = process.env } = {},
) {
  const findings = [];
  const normalized = String(command ?? "").trim();
  if (!normalized) return findings;

  if (/(?:^|[;&|]\s*)git\s+add\s+(?:-A|--all|\.)(?:\s|$)/.test(normalized)) {
    findings.push(
      finding(
        "explicit-git-paths",
        "error",
        true,
        "Broad git staging is forbidden in this repository.",
        "Stage explicit pathspecs only.",
      ),
    );
  }

  if (/(?:^|[;&|]\s*)pnpm\s+dev(?:\s|$)/.test(normalized)) {
    findings.push(
      finding(
        "selective-dev",
        "error",
        true,
        "Bare `pnpm dev` fans out to the entire monorepo.",
        "Use dev:minimal, dev:designer, dev:admin, dev:client, dev:frontend, or dev:backend.",
      ),
    );
  }

  for (const pattern of RETIRED_DEPLOY_PATTERNS) {
    if (!pattern.test(normalized)) continue;
    findings.push(
      finding(
        "retired-production-path",
        "error",
        true,
        "This command targets retired Coolify/GHCR production infrastructure.",
        "Use the Cloudflare/Supabase production workflow.",
      ),
    );
    break;
  }

  if (/\bopennextjs-cloudflare\s+build\b/.test(normalized)) {
    findings.push(
      finding(
        "raw-portal-build",
        "error",
        true,
        "Raw OpenNext builds bypass the portal stale-dist guard.",
        "Use infra/deploy-portal.sh through the approved production workflow.",
      ),
    );
  }

  if (
    env.PATINA_ALLOW_LOCAL_PROD_DEPLOY !== "1" &&
    PROD_MUTATION_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    findings.push(
      finding(
        "manual-production-approval",
        "error",
        true,
        "Direct agent-driven production mutations are disabled.",
        "Dispatch the protected production workflow. For an explicitly authorized emergency local session, launch the agent with PATINA_ALLOW_LOCAL_PROD_DEPLOY=1.",
      ),
    );
  }

  if (LOCAL_DB_MUTATION_PATTERN.test(normalized)) {
    const url = portalSupabaseUrl(root, env);
    if (url && !/(?:localhost|127\.0\.0\.1)/.test(url)) {
      findings.push(
        finding(
          "local-db-target",
          "error",
          true,
          `Database reset/seed refused because NEXT_PUBLIC_SUPABASE_URL points at ${url}.`,
          "Point the portal at http://127.0.0.1:54321 before destructive local work.",
        ),
      );
    } else if (!url) {
      findings.push(
        finding(
          "local-db-target-unknown",
          "warning",
          false,
          "Could not confirm that the portal points at local Supabase.",
          "Set NEXT_PUBLIC_SUPABASE_URL to http://127.0.0.1:54321 before resetting or seeding.",
        ),
      );
    }
  }

  if (
    /\bpnpm\s+dev:(?:designer|minimal|client|admin|frontend)\b/.test(normalized)
  ) {
    findings.push(...posthogFindings(root));
  }

  if (
    /\bdeno\s+(?:test|check|run)\b/.test(normalized) &&
    path.resolve(cwd) === path.resolve(root) &&
    !normalized.includes("--config supabase/functions/deno.json") &&
    normalized.includes("supabase/functions")
  ) {
    findings.push(
      finding(
        "deno-config",
        "warning",
        false,
        "Deno is being run from the repo root without the shared function config.",
        "Add --config supabase/functions/deno.json to avoid root deno.lock pollution.",
      ),
    );
  }

  return findings;
}

export function scanSecrets(content) {
  const text = String(content ?? "");
  const findings = [];
  const patterns = [
    [
      "secret-private-key",
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      "Private key material",
    ],
    [
      "secret-stripe",
      /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
      "Stripe secret key",
    ],
    [
      "secret-github",
      /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
      "GitHub token",
    ],
    ["secret-aws", /\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
    ["secret-slack", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, "Slack token"],
    ["secret-resend", /\bre_[A-Za-z0-9]{20,}\b/, "Resend key"],
  ];
  for (const [id, pattern, label] of patterns) {
    if (pattern.test(text))
      findings.push(
        finding(
          id,
          "error",
          true,
          `${label} detected in changed content.`,
          "Remove the secret, rotate it if exposed, and store it in the approved secret manager.",
        ),
      );
  }

  for (const token of text.match(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  ) ?? []) {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
      );
      if (payload.role === "service_role") {
        findings.push(
          finding(
            "secret-supabase-service-role",
            "error",
            true,
            "Supabase service-role JWT detected in changed content.",
            "Remove and rotate the service-role key.",
          ),
        );
        break;
      }
    } catch {
      // A JWT-shaped string that cannot be decoded is not enough evidence to block.
    }
  }
  return findings;
}

function sensitivePathFinding(item) {
  const base = path.posix.basename(item);
  if (base === ".env.example" || base.endsWith(".env.example")) return null;
  if (base.endsWith(".example")) return null;
  if (
    /(?:^|\/)\.env(?:\.|$)/.test(item) ||
    /\.env\.(?:bak|backup)|\.bak(?:[-.]|$)/i.test(item)
  ) {
    return finding(
      "forbidden-sensitive-file",
      "error",
      true,
      `Sensitive environment/backup file must not be committed: ${item}`,
      "Remove it from the index and store required values as secrets.",
    );
  }
  if (/(?:^|\/)(?:\.parcel-cache|CMakeFiles|\.DS_Store)(?:\/|$)/.test(item)) {
    return finding(
      "forbidden-generated-file",
      "error",
      true,
      `Generated/cache artifact must not be committed: ${item}`,
      "Remove it from the index and update .gitignore if necessary.",
    );
  }
  return null;
}

function migrationFindings(root, paths) {
  const findings = [];
  const changed = paths.filter(
    (item) => item.startsWith("supabase/migrations/") && item.endsWith(".sql"),
  );
  if (!changed.length) return findings;
  const migrationDir = path.join(root, "supabase/migrations");
  if (!fs.existsSync(migrationDir)) return findings;
  const files = fs
    .readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"));
  const numbers = new Map();
  for (const file of files) {
    const match = file.match(/^(\d{5})_/);
    if (!match) continue;
    if (!numbers.has(match[1])) numbers.set(match[1], []);
    numbers.get(match[1]).push(file);
  }
  for (const item of changed) {
    const name = path.posix.basename(item);
    if (!/^\d{5}_[a-z0-9_]+\.sql$/.test(name)) {
      findings.push(
        finding(
          "migration-name",
          "error",
          true,
          `Migration name violates NNNNN_snake_case.sql: ${name}`,
          "Rename it using the next hand-numbered five-digit prefix.",
        ),
      );
    }
    const number = name.slice(0, 5);
    if ((numbers.get(number) ?? []).length > 1) {
      findings.push(
        finding(
          "migration-number-collision",
          "error",
          true,
          `Migration number ${number} is used by: ${(numbers.get(number) ?? []).join(", ")}`,
          "Renumber the undeployed migration against the target branch tip.",
        ),
      );
    }
  }
  return findings;
}

function migrationContentFindings(item, content) {
  if (!item.startsWith("supabase/migrations/") || !item.endsWith(".sql"))
    return [];
  const findings = [];
  if (
    /CREATE\s+TABLE/i.test(content) &&
    !/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(content)
  ) {
    findings.push(
      finding(
        "migration-rls-review",
        "warning",
        false,
        `${item} creates a table without enabling RLS in the same file.`,
        "Add RLS and policies now, or document why the table is intentionally private/internal.",
      ),
    );
  }
  if (
    /SECURITY\s+DEFINER/i.test(content) &&
    !/SET\s+search_path/i.test(content)
  ) {
    findings.push(
      finding(
        "migration-search-path",
        "error",
        true,
        `${item} defines a SECURITY DEFINER function without a pinned search_path.`,
        "Add SET search_path to the function definition.",
      ),
    );
  }
  if (
    /\b(?:uuid_generate_v[45]|http_post|cron\.schedule)\s*\(/i.test(content) &&
    !/(?:extensions\.|net\.|cron\.)/i.test(content)
  ) {
    findings.push(
      finding(
        "migration-extension-qualification",
        "warning",
        false,
        `${item} may call an extension function without schema qualification.`,
        "Schema-qualify extension functions so Strata push search_path differences cannot break the migration.",
      ),
    );
  }
  return findings;
}

export async function inspectPaths(
  rawPaths,
  { root = resolveRepoRoot(), contentProvider } = {},
) {
  const paths = unique(rawPaths.map(normalizePath).filter(Boolean)).sort();
  const findings = [];
  const provider =
    contentProvider ??
    (async (item) => {
      const absolute = path.join(root, item);
      if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory())
        return "";
      if (fs.statSync(absolute).size > 2 * 1024 * 1024) return "";
      return fs.readFileSync(absolute, "utf8");
    });

  for (const item of paths) {
    const sensitive = sensitivePathFinding(item);
    if (sensitive) findings.push(sensitive);
    if (item === "deno.lock")
      findings.push(
        finding(
          "root-deno-lock",
          "error",
          true,
          "Root deno.lock is generated pollution; edge functions use lock:false.",
          "Remove it and rerun Deno with --config supabase/functions/deno.json.",
        ),
      );

    const absolute = path.join(root, item);
    if (
      fs.existsSync(absolute) &&
      fs.statSync(absolute).isFile() &&
      fs.statSync(absolute).size > 10 * 1024 * 1024
    ) {
      findings.push(
        finding(
          "oversized-file",
          "error",
          true,
          `Changed file exceeds 10 MiB: ${item}`,
          "Compress it or use the repository-approved large-file path.",
        ),
      );
    }

    let content = "";
    try {
      content = await provider(item);
    } catch {
      content = "";
    }
    findings.push(
      ...scanSecrets(content).map((entry) => ({
        ...entry,
        message: `${entry.message} (${item})`,
      })),
    );
    findings.push(...migrationContentFindings(item, content));

    if (item.startsWith("services/projects/src/") && item.endsWith(".ts")) {
      const sibling = path.join(root, item.replace(/\.ts$/, ".js"));
      if (fs.existsSync(sibling))
        findings.push(
          finding(
            "projects-js-shadow",
            "warning",
            false,
            `${item} is shadowed by a tracked JavaScript sibling.`,
            "Remove/regenerate the stale artifact or prove the test imports the TypeScript source.",
          ),
        );
    }
  }
  findings.push(...migrationFindings(root, paths));
  return findings;
}

export function extractCommand(payload) {
  return (
    payload?.tool_input?.command ??
    payload?.tool_input?.cmd ??
    payload?.tool_input?.args?.cmd ??
    payload?.command ??
    ""
  );
}

export function formatFindings(findings) {
  if (!findings.length) return "No hook findings.";
  return findings
    .map((entry) => {
      const marker = entry.blocking ? "BLOCK" : entry.severity.toUpperCase();
      return `[${marker}] ${entry.message}${entry.remediation ? ` ${entry.remediation}` : ""}`;
    })
    .join("\n");
}

export function agentHookOutput(eventName, findings) {
  const message = formatFindings(findings);
  const blocker = findings.find((entry) => entry.blocking);
  if (eventName === "PreToolUse") {
    if (blocker) {
      return {
        continue: false,
        stopReason: blocker.message,
        systemMessage: message,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: message,
        },
      };
    }
    return {
      continue: true,
      ...(findings.length ? { systemMessage: message } : {}),
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        ...(findings.length ? { additionalContext: message } : {}),
      },
    };
  }
  return {
    continue: true,
    ...(findings.length ? { systemMessage: message } : {}),
    ...(["SessionStart", "PostToolUse"].includes(eventName) && findings.length
      ? {
          hookSpecificOutput: {
            hookEventName: eventName,
            additionalContext: message,
          },
        }
      : {}),
  };
}

export function changedPaths({
  root = resolveRepoRoot(),
  base,
  head = "HEAD",
  staged = false,
  includeUntracked = false,
} = {}) {
  let output = "";
  try {
    if (staged)
      output = git(root, [
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "--diff-filter=ACMR",
      ]);
    else if (base)
      output = git(root, [
        "diff",
        "--name-only",
        "-z",
        "--diff-filter=ACMR",
        base,
        head,
      ]);
    else
      output = git(root, [
        "diff",
        "--name-only",
        "-z",
        "--diff-filter=ACMR",
        "HEAD",
      ]);
  } catch {
    output = "";
  }
  const paths = output.split("\0").filter(Boolean).map(normalizePath);
  if (includeUntracked) {
    try {
      paths.push(
        ...git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
          .split("\0")
          .filter(Boolean)
          .map(normalizePath),
      );
    } catch {
      // A non-Git directory simply has no untracked paths to add.
    }
  }
  return unique(paths).sort();
}

function portalSmoke(portal) {
  const suffix = portal === "manufacturer" ? "/" : "/api/version";
  return `https://patina-${portal}-portal.kody-be3.workers.dev${suffix}`;
}

function disablesJwt(root, functionName) {
  const config = path.join(root, "supabase/config.toml");
  if (!fs.existsSync(config)) return false;
  const source = fs.readFileSync(config, "utf8");
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`\\[functions\\.${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`),
  );
  return Boolean(match?.[1].match(/verify_jwt\s*=\s*false/));
}

export async function createDeployPlan(
  rawPaths,
  {
    root = resolveRepoRoot(),
    baseSha,
    releaseSha,
    scope = "affected",
    reason,
    requestedBy,
  } = {},
) {
  const classified = await classifyPaths(rawPaths, { root });
  const all = scope === "all";
  const migrations = rawPaths
    .filter(
      (item) =>
        item.startsWith("supabase/migrations/") && item.endsWith(".sql"),
    )
    .sort();
  const portals = PORTALS.filter(
    (portal) =>
      all || classified.affectedWorkspaceDirs.includes(`apps/${portal}-portal`),
  );
  const workers = [];
  const touches = (prefix) =>
    rawPaths.some((item) => item === prefix || item.startsWith(`${prefix}/`));
  const affectsWorkspace = (dir) =>
    classified.affectedWorkspaceDirs.includes(dir);

  if (
    all ||
    affectsWorkspace("services/orders") ||
    touches("infra/orders-worker")
  )
    workers.push("orders");
  if (
    all ||
    affectsWorkspace("services/projects") ||
    touches("infra/projects-worker")
  )
    workers.push("projects");
  if (
    all ||
    affectsWorkspace("services/media") ||
    touches("infra/media-svc-worker")
  )
    workers.push("media-svc");
  if (all || touches("infra/media-worker")) workers.push("media");
  if (
    all ||
    touches("services/aesthete-inference") ||
    touches("infra/inference-worker")
  )
    workers.push("inference");

  const allFunctions = deployableEdgeFunctions(root);
  const edgeFunctions = all ? allFunctions : classified.edgeFunctions;

  const phases = [
    {
      name: "migrations",
      commands:
        all || migrations.length
          ? [{ unit: "database", command: "supabase db push" }]
          : [],
    },
    {
      name: "edge-functions",
      commands: edgeFunctions.map((name) => ({
        unit: `edge:${name}`,
        command: `supabase functions deploy ${name}${disablesJwt(root, name) ? " --no-verify-jwt" : ""}`,
      })),
    },
    {
      name: "workers",
      commands: workers.map((name) => ({
        unit: `worker:${name}`,
        command:
          name === "inference"
            ? `make -C services/aesthete-inference export && (cd ${WORKER_CONFIG[name].dir} && npx wrangler deploy)`
            : `(cd ${WORKER_CONFIG[name].dir} && npx wrangler deploy)`,
      })),
    },
    {
      name: "portals",
      commands: portals.map((name) => ({
        unit: `portal:${name}`,
        command: `./infra/deploy-portal.sh ${name}`,
      })),
    },
    {
      name: "smoke",
      commands: [
        ...workers
          .filter((name) => WORKER_CONFIG[name].smoke)
          .map((name) => ({
            unit: `smoke:worker:${name}`,
            command: `curl --fail --silent --show-error ${WORKER_CONFIG[name].smoke}`,
          })),
        ...portals.map((name) => ({
          unit: `smoke:portal:${name}`,
          command: `curl --fail --silent --show-error ${portalSmoke(name)}`,
        })),
      ],
    },
  ];

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    baseSha,
    releaseSha,
    scope,
    reason,
    requestedBy,
    changedPaths: unique(rawPaths.map(normalizePath)).sort(),
    migrations,
    edgeFunctions,
    workers,
    portals,
    phases,
  };
}

export function runChecks(
  checks,
  { root = resolveRepoRoot(), strict = false } = {},
) {
  const results = [];
  for (const check of checks) {
    process.stdout.write(`\n==> ${check.id}\n$ ${check.command}\n`);
    const result = spawnSync("/bin/bash", ["-lc", check.command], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    results.push({
      ...check,
      exitCode: result.status ?? 1,
      passed: result.status === 0,
    });
  }
  return {
    results,
    passed: results.every((result) => result.passed),
    exitCode: strict && results.some((result) => !result.passed) ? 1 : 0,
  };
}

export function sessionFindings(root = resolveRepoRoot()) {
  const findings = [];
  try {
    const branch =
      git(root, ["branch", "--show-current"]).trim() || "<detached>";
    const status = git(root, ["status", "--porcelain"])
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    const commonDir = path.resolve(
      root,
      git(root, ["rev-parse", "--git-common-dir"]).trim(),
    );
    const gitDir = path.resolve(
      root,
      git(root, ["rev-parse", "--git-dir"]).trim(),
    );
    findings.push(
      finding(
        "session-checkout",
        "info",
        false,
        `Checkout ${root} on ${branch}; ${status.length} dirty path(s); ${gitDir === commonDir ? "main checkout" : "linked worktree"}.`,
      ),
    );
    const worktrees = git(root, ["worktree", "list", "--porcelain"])
      .split(/\r?\n/)
      .filter((line) => line.startsWith("worktree ")).length;
    if (worktrees > 25)
      findings.push(
        finding(
          "worktree-count",
          "warning",
          false,
          `${worktrees} linked worktrees are registered.`,
          "Run scripts/repo-gc.sh from the main checkout for a safe dry-run report.",
        ),
      );
  } catch {
    findings.push(
      finding(
        "session-checkout",
        "warning",
        false,
        "Could not inspect Git checkout state.",
      ),
    );
  }
  const url = portalSupabaseUrl(root, process.env);
  if (url)
    findings.push(
      finding(
        "session-supabase-target",
        /localhost|127\.0\.0\.1/.test(url) ? "info" : "warning",
        false,
        `Designer portal Supabase target: ${url}.`,
      ),
    );
  return findings;
}

export async function auditRepository(root = resolveRepoRoot()) {
  const findings = [...sessionFindings(root)];
  if (fs.existsSync(path.join(root, ".github/workflows/docker-publish.yml"))) { // [retired-deploy-reference-allow]
    findings.push(
      finding(
        "legacy-docker-workflow",
        "error",
        false,
        "The retired GHCR/Coolify Docker workflow is still active.",
        "Remove it after the Cloudflare production workflow is validated.",
      ),
    );
  }
  if (!fs.existsSync(path.join(root, ".codex/hooks.json")))
    findings.push(
      finding(
        "codex-hook-config",
        "warning",
        false,
        "Tracked Codex hook configuration is missing.",
      ),
    );
  const migrationPaths = fs.existsSync(path.join(root, "supabase/migrations"))
    ? fs
        .readdirSync(path.join(root, "supabase/migrations"))
        .filter((name) => name.endsWith(".sql"))
        .map((name) => `supabase/migrations/${name}`)
    : [];
  findings.push(...migrationFindings(root, migrationPaths));

  const manifests = workspaceManifests(root);
  for (const manifest of manifests) {
    if (!manifest.scripts.build && !manifest.scripts["type-check"]) {
      findings.push(
        finding(
          "workspace-no-type-gate",
          "warning",
          false,
          `${manifest.name} has neither a build nor type-check script.`,
        ),
      );
    }
    if (manifest.scripts.lint?.includes("--fix")) {
      findings.push(
        finding(
          "mutating-lint-script",
          "warning",
          false,
          `${manifest.name} lint mutates files via --fix; hooks will not invoke it automatically.`,
        ),
      );
    }
  }
  return findings;
}

export function executeDeployPlan(
  plan,
  { root = resolveRepoRoot(), dryRun = false } = {},
) {
  if (
    !dryRun &&
    (process.env.GITHUB_ACTIONS !== "true" ||
      process.env.PATINA_PRODUCTION_DEPLOY !== "1")
  ) {
    throw new Error(
      "Production plan execution is restricted to the protected GitHub Actions environment.",
    );
  }
  const currentSha = git(root, ["rev-parse", "HEAD"]).trim();
  if (plan.releaseSha && plan.releaseSha !== currentSha)
    throw new Error(
      `Manifest releaseSha ${plan.releaseSha} does not match checkout ${currentSha}.`,
    );
  const results = [];
  for (const phase of plan.phases) {
    for (const item of phase.commands) {
      if (dryRun) {
        results.push({ phase: phase.name, ...item, exitCode: 0, dryRun: true });
        continue;
      }
      const result = spawnSync("/bin/bash", ["-lc", item.command], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      });
      results.push({
        phase: phase.name,
        ...item,
        exitCode: result.status ?? 1,
      });
      if (result.status !== 0)
        throw new Error(
          `Deployment command failed in ${phase.name}: ${item.command}`,
        );
    }
  }
  return results;
}

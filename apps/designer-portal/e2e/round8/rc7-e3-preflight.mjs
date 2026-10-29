#!/usr/bin/env node
// RC7-E3 mandatory preflight. Run it, and require exit 0, before every E3
// Playwright command:
//   node e2e/round8/rc7-e3-preflight.mjs && pnpm exec playwright test -c playwright.round8.config.ts ...
// The shared round-8 global setup (global-setup.ts:11-15) falls back to the
// shared stack's 54322 when SUPABASE_DB_URL is unset and loads fixtures before
// any spec guard runs. This refuses first, unless the API and DB URLs point at
// the E3 block (56121/56122 on 127.0.0.1) and the DB's system identifier is
// the one captured for this stack in RC7_E3_SYSTEM_IDENTIFIER.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// RC7_E3_API_PORT / RC7_E3_DB_PORT move the guard to another owned block.
const API_PORT = process.env.RC7_E3_API_PORT ?? "56121";
const DB_PORT = process.env.RC7_E3_DB_PORT ?? "56122";

function refuse(reason) {
  console.error(`RC7-E3 preflight refused: ${reason}`);
  process.exit(1);
}

function parse(name) {
  const raw = process.env[name];
  if (!raw) refuse(`${name} is not set`);
  try {
    return new URL(raw);
  } catch {
    return refuse(`${name} is not a URL`);
  }
}

if ([API_PORT, DB_PORT].some((port) => port === "54321" || port === "54322")) {
  refuse("the shared stack ports 54321/54322 are never an owned block");
}
const api = parse("NEXT_PUBLIC_SUPABASE_URL");
if (api.hostname !== "127.0.0.1" || api.port !== API_PORT) {
  refuse(`NEXT_PUBLIC_SUPABASE_URL must be 127.0.0.1:${API_PORT}`);
}
const db = parse("SUPABASE_DB_URL");
if (db.hostname !== "127.0.0.1" || db.port !== DB_PORT) {
  refuse(`SUPABASE_DB_URL must be 127.0.0.1:${DB_PORT}`);
}
const expected = process.env.RC7_E3_SYSTEM_IDENTIFIER;
if (!expected || !/^\d+$/.test(expected)) {
  refuse(
    "RC7_E3_SYSTEM_IDENTIFIER (captured at this stack's start) is not set",
  );
}

const env = { ...process.env };
for (const key of [
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSYSCONFDIR",
]) {
  delete env[key];
}
const psql =
  ["/opt/homebrew/opt/libpq/bin/psql", "/usr/local/opt/libpq/bin/psql"].find(
    (p) => existsSync(p),
  ) ?? "psql";
let actual;
try {
  actual = execFileSync(
    psql,
    [
      "-X",
      "-At",
      db.toString(),
      "-c",
      "SELECT system_identifier::text FROM pg_control_system()",
    ],
    { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
} catch {
  refuse(
    `cannot read the system identifier on 127.0.0.1:${DB_PORT} (stack down or unreachable)`,
  );
}
if (actual !== expected) {
  refuse(`system identifier ${actual} is not the captured ${expected}`);
}
console.log(
  `RC7-E3 preflight ok: 127.0.0.1:${API_PORT}/${DB_PORT}, system identifier ${actual}`,
);

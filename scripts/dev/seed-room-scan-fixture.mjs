#!/usr/bin/env node
// Uploads the Elena Ruiz "Formal Dining Room" CapturedRoom fixture to the
// local `room-scans` bucket, patches her room_scans row's URL columns, and
// (by default) invokes parse-room-scan against it — LOCAL SUPABASE ONLY.
//
// Hard-fails if the resolved Supabase URL isn't localhost/127.0.0.1: this
// script uploads storage objects and mutates a room_scans row with
// service_role, and must never be pointed at Strata prod.
//
// Usage:
//   pnpm dev:seed-room-fixture              # upload + patch + attempt parse
//   pnpm dev:seed-room-fixture --no-parse    # skip the parse invoke step
//
// Prerequisites: `pnpm supabase:start` + a `pnpm supabase:reset` that ran
// with `./seed/leads_room_scans.sql` wired into config.toml [db.seed]
// sql_paths (so Elena's profile + "Formal Dining Room" scan row exist).
//
// Reads connection info from `supabase status -o env` (run from supabase/),
// falling back to SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'supabase/seed/fixtures/room-scans');
const JSON_FIXTURE_PATH = path.join(FIXTURE_DIR, 'elena-formal-dining.captured_room.json');
const USDZ_FIXTURE_PATH = path.join(FIXTURE_DIR, 'elena-formal-dining.scan.usdz');

const ELENA_EMAIL = 'elena.ruiz@example.com';
const SCAN_NAME = 'Formal Dining Room';
const BUCKET = 'room-scans';

function parseArgs(argv) {
  const opts = { parse: true };
  for (const a of argv.slice(2)) {
    if (a === '--parse') opts.parse = true;
    else if (a === '--no-parse') opts.parse = false;
    else {
      console.error(`unknown option: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function loadLocalSupabaseEnv() {
  let url = process.env.SUPABASE_URL;
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const out = execFileSync('supabase', ['status', '-o', 'env'], {
      cwd: path.join(REPO_ROOT, 'supabase'),
      encoding: 'utf8',
    });
    for (const line of out.split('\n')) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      if (!m) continue;
      const [, key, val] = m;
      if (key === 'API_URL') url = url ?? val;
      if (key === 'SERVICE_ROLE_KEY') serviceRoleKey = serviceRoleKey ?? val;
    }
  } catch (err) {
    console.error(`warning: \`supabase status -o env\` failed (${err.message}) — falling back to env vars`);
  }

  if (!url || !serviceRoleKey) {
    console.error(
      'error: could not resolve Supabase URL / service_role key.\n' +
        '  Run `pnpm supabase:start` first, or export SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.'
    );
    process.exit(1);
  }
  return { url, serviceRoleKey };
}

function assertLocal(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(`FATAL: SUPABASE_URL "${url}" is not a valid URL.`);
    process.exit(1);
  }
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!isLocal) {
    console.error(
      `FATAL: refusing to run against non-local Supabase URL "${url}" (host="${host}").\n` +
        '  This script uploads storage objects and mutates room_scans with a\n' +
        '  service_role key — it must NEVER run against Strata prod or any\n' +
        '  *.supabase.co project. Start local Supabase with `pnpm supabase:start`\n' +
        '  and re-run.'
    );
    process.exit(1);
  }
}

// ---- REST / Storage helpers ------------------------------------------------

async function restGet(env, table, query) {
  const res = await fetch(`${env.url}/rest/v1/${table}?${query}`, {
    headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` },
  });
  if (!res.ok) {
    throw new Error(`GET ${table}?${query} -> HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function restPatch(env, table, query, body) {
  const res = await fetch(`${env.url}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${table}?${query} -> HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function storageUpload(env, bucket, objectPath, data, contentType) {
  const res = await fetch(`${env.url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: data,
  });
  if (!res.ok) {
    throw new Error(`upload ${bucket}/${objectPath} -> HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function storageList(env, bucket, prefix) {
  const res = await fetch(`${env.url}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix, limit: 100 }),
  });
  if (!res.ok) {
    throw new Error(`list ${bucket}/${prefix} -> HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function publicUrl(env, bucket, objectPath) {
  // Same URL shape the iOS uploader writes via
  // `client.storage.from(bucket).getPublicURL(path:)` — a fixed string form,
  // independent of the bucket's actual public/private flag (room-scans is
  // private; downstream readers use this same path with an authenticated
  // request, exactly as existing rows already do).
  return `${env.url}/storage/v1/object/public/${bucket}/${objectPath}`;
}

// ---- main -------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);
  const env = loadLocalSupabaseEnv();
  assertLocal(env.url);
  console.log(`Local Supabase: ${env.url}`);

  if (!existsSync(JSON_FIXTURE_PATH)) {
    console.error(`error: fixture not found at ${JSON_FIXTURE_PATH}`);
    process.exit(1);
  }

  // 1. Resolve Elena's profile id + her 'Formal Dining Room' scan id. Never
  //    hardcoded — both are gen_random_uuid() per reset.
  const profiles = await restGet(
    env,
    'profiles',
    `email=eq.${encodeURIComponent(ELENA_EMAIL)}&select=id,email`
  );
  if (profiles.length === 0) {
    console.error(
      `error: no profile found for ${ELENA_EMAIL}.\n` +
        '  Has the local stack been reset with leads_room_scans.sql wired into\n' +
        '  supabase/config.toml [db.seed] sql_paths? Run `pnpm supabase:reset`.'
    );
    process.exit(1);
  }
  const elena = profiles[0];
  console.log(`Elena's profile: ${elena.id} (${elena.email})`);

  const scans = await restGet(
    env,
    'room_scans',
    `user_id=eq.${elena.id}&name=eq.${encodeURIComponent(SCAN_NAME)}&select=id,name,status,captured_room_json_url,model_url`
  );
  if (scans.length === 0) {
    console.error(`error: no room_scans row named "${SCAN_NAME}" for ${ELENA_EMAIL}.`);
    process.exit(1);
  }
  const scan = scans[0];
  console.log(`Elena's scan: ${scan.id} ("${scan.name}", status=${scan.status})`);

  // 2. Upload the fixture(s). Path mirrors RoomScanStoragePath ordering
  //    ({folder}/{userId}/{scanId}/{filename}), scan-id as segment 3 (00287
  //    fixed the RLS read policy to match this exact convention).
  const jsonObjectPath = `captured_room/${elena.id}/${scan.id}/captured_room.json`;
  await storageUpload(env, BUCKET, jsonObjectPath, readFileSync(JSON_FIXTURE_PATH), 'application/json');
  const jsonURL = publicUrl(env, BUCKET, jsonObjectPath);
  console.log(`Uploaded captured_room.json -> ${BUCKET}/${jsonObjectPath}`);

  let modelURL = scan.model_url ?? null;
  if (existsSync(USDZ_FIXTURE_PATH)) {
    const usdzObjectPath = `usdz/${elena.id}/${scan.id}/scan.usdz`;
    await storageUpload(env, BUCKET, usdzObjectPath, readFileSync(USDZ_FIXTURE_PATH), 'model/vnd.usdz+zip');
    modelURL = publicUrl(env, BUCKET, usdzObjectPath);
    console.log(`Uploaded scan.usdz -> ${BUCKET}/${usdzObjectPath}`);
  } else {
    console.log('No fixture USDZ found — skipping model_url upload (the JSON is what the parser reads).');
  }

  // 3. Patch the row. Status stays 'ready' — untouched.
  const patchBody = { captured_room_json_url: jsonURL };
  if (modelURL) patchBody.model_url = modelURL;
  const patched = await restPatch(env, 'room_scans', `id=eq.${scan.id}`, patchBody);
  console.log('Patched room_scans row:', patched[0]);

  // 4. Invoke the parser — tolerate its absence. parse-room-scan only exists
  //    on room-view/parser, a different branch than this loader ships on;
  //    `supabase functions serve` here can't serve a function it doesn't have.
  if (opts.parse) {
    const fnURL = `${env.url}/functions/v1/parse-room-scan`;
    try {
      const res = await fetch(fnURL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: scan.id }),
      });
      if (res.status === 404) {
        console.log('parser not on this branch — run at integration gate (parse-room-scan 404)');
      } else if (!res.ok) {
        console.log(
          `parse-room-scan responded HTTP ${res.status}: ${await res.text()} ` +
            '— treating as not-available-here, run at integration gate.'
        );
      } else {
        console.log('parse-room-scan invoked:', await res.text());
      }
    } catch (err) {
      console.log(`parser not on this branch — run at integration gate (${err.message})`);
    }
  } else {
    console.log('--no-parse passed — skipping parse invoke step.');
  }

  // 5. Verification summary.
  console.log('\n=== Verification summary ===');

  const finalScan = (
    await restGet(
      env,
      'room_scans',
      `id=eq.${scan.id}&select=id,name,status,captured_room_json_url,model_url`
    )
  )[0];
  console.log('room_scans row:', finalScan);

  const listing = await storageList(env, BUCKET, `captured_room/${elena.id}/${scan.id}`).catch((err) => {
    console.log(`storage list failed: ${err.message}`);
    return [];
  });
  console.log(
    `storage object(s) under captured_room/${elena.id}/${scan.id}/:`,
    listing.map((o) => o.name)
  );

  const geomRows = await restGet(env, 'room_scan_geometry_elements', `scan_id=eq.${scan.id}&select=id`).catch(
    (err) => {
      console.log(`room_scan_geometry_elements SELECT failed (expected pre-parse): ${err.message}`);
      return [];
    }
  );
  console.log(`room_scan_geometry_elements count for this scan: ${geomRows.length}`);

  const docs = await restGet(env, 'room_scan_documents', `scan_id=eq.${scan.id}&select=*`).catch((err) => {
    console.log(`room_scan_documents SELECT failed (view may not exist on this branch): ${err.message}`);
    return [];
  });
  console.log('room_scan_documents row:', docs[0] ?? '(none)');
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

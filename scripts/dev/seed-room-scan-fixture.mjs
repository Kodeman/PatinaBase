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
//   pnpm dev:seed-room-fixture               # upload + patch + parse + photos
//   pnpm dev:seed-room-fixture --no-parse    # skip the parse invoke step
//   pnpm dev:seed-room-fixture --no-photos   # skip the photo seeding step
//   pnpm dev:seed-room-fixture --photos-only # ONLY (re)seed the 6 fixture photos
//
// Photo step (Room View PHOTOS program, W2/W3-T8; I76): uploads 6 tiny
// checked-in JPEGs (supabase/seed/fixtures/room-scans/photos/) to the local
// `room-scans` bucket at photos/{elenaUid}/{scanId}/auto_00000N.jpg and
// inserts 6 room_scan_images rows carrying a computed camera_transform each
// — a synthetic row-major ARFrame pose (cameraTransformFacing(), below) built
// by taking a hand-picked PLAN position, converting it to this scan's WORLD
// frame via the INVERSE of photo-poses.ts's own de-rotation math
// (planToWorld(), θ=-15°, offset {x:6.2374, z:-1.6416} — the real values
// parse-room-scan produced for this fixture), and orienting every camera to
// face the room's plan centre (7.0046, 7.0046) at a fixed 1.45 m eye height —
// so `photoPlanPose()` recovers EXACTLY the intended plan position/heading
// back out, and photo-markers.tsx/photo-marker-objects.ts draw a Plan tick +
// Orbit frustum at that same spot. Five poses spread around the 14×14 ft
// room for coverage; #5/#6 sit ~0.67 ft apart (< the 1.5 ft cluster radius),
// deliberately forming one 2-photo cluster; #1 is `is_primary`. Idempotent:
// deletes this scan's existing `room_scan_images` rows first, then
// re-inserts all 6 — safe to re-run (`--photos-only`) after any other
// re-seed. LOCAL ONLY (same host guard as the rest of the file).
//
// Prerequisites: `pnpm supabase:start` + a `pnpm supabase:reset` that ran
// with `./seed/leads_room_scans.sql` wired into config.toml [db.seed]
// sql_paths (so Elena's profile + "Formal Dining Room" scan row exist).
//
// Reads connection info from `supabase status -o env` (run from supabase/),
// falling back to SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.
//
// The parse-invoke step (§4) sends this SAME `supabase status` service_role
// key as the Authorization bearer — which is an ES256 JWT and 401s against
// the local edge runtime's verify_jwt check (it only validates HS256, signed
// with the CLI's standard local JWT secret; Kong itself accepts either, so
// this only bites function-to-function calls, not REST/Storage). The script
// treats a non-2xx parse response as "not available on this branch" and
// moves on, so a 401 here reads as a skip, not a loud failure — if you need
// to invoke parse-room-scan by hand (curl) instead of through this script,
// fetch the correct HS256 key from the local Vault seed
// (supabase/seed/99-local-edge-settings.sql) with:
//   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -tAc \
//     "select decrypted_secret from vault.decrypted_secrets where name='app.settings.service_role_key';"

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
  const opts = { parse: true, photos: true, photosOnly: false };
  for (const a of argv.slice(2)) {
    if (a === '--parse') opts.parse = true;
    else if (a === '--no-parse') opts.parse = false;
    else if (a === '--photos') opts.photos = true;
    else if (a === '--no-photos') opts.photos = false;
    else if (a === '--photos-only') opts.photosOnly = true;
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

async function restPost(env, table, body) {
  const res = await fetch(`${env.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${table} -> HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function restDelete(env, table, query) {
  const res = await fetch(`${env.url}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      Prefer: 'return=representation',
    },
  });
  if (!res.ok) {
    throw new Error(`DELETE ${table}?${query} -> HTTP ${res.status}: ${await res.text()}`);
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

// ---- photo fixtures ---------------------------------------------------------
//
// Camera-transform math mirrors apps/designer-portal/src/lib/room-view/
// photo-poses.ts + its test's `planToWorld`/`yawCam` helpers EXACTLY, so a
// pose computed here lands where photo-markers.tsx will draw it. Elena's
// parser provenance: θ=-15°, offset {x:6.2374, z:-1.6416} (from the fixture's
// own parse — see photo-poses.test.ts). Room is 14.0092 × 14.0092 ft; the
// table sits dead-centre at plan (7.0046, 7.0046). Every photo faces the room
// centre so the heading strokes point inward.

const PHOTOS_DIR = path.join(FIXTURE_DIR, 'photos');
const M_TO_FT = 3.28084;
const PROV = { yawDeg: -15, off: { x: 6.2374, z: -1.6416 } };
const ROOM_CENTRE = { x: 7.0046, z: 7.0046 };

// plan feet (NW origin, x→east, z→south) → the world XZ (metres) that lands
// there — inverse of photo-poses.ts's mapping (rotate by +θ).
function planToWorld(px, pz) {
  const t = (PROV.yawDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const rx = px / M_TO_FT + PROV.off.x;
  const rz = pz / M_TO_FT + PROV.off.z;
  return { x: rx * c - rz * s, z: rx * s + rz * c };
}

// A row-major camera_transform standing at plan `at`, facing plan `faceTo`.
function cameraTransformFacing(at, faceTo, eyeM = 1.45) {
  const w = planToWorld(at.x, at.z);
  // desired PLAN heading (photo-poses convention: 0°=+x, 90°=+z, CW)
  const planHeadingDeg = (Math.atan2(faceTo.z - at.z, faceTo.x - at.x) * 180) / Math.PI;
  // headingDeg = worldHeadingDeg − originYawDeg  ⇒  worldHeadingDeg = H + yaw
  const whRad = ((planHeadingDeg + PROV.yawDeg) * Math.PI) / 180;
  const fwX = Math.cos(whRad);
  const fwZ = Math.sin(whRad);
  // yawCam forward = (−sinφ, 0, −cosφ); solve φ so forward = (fwX, fwZ)
  const phi = Math.atan2(-fwX, -fwZ);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  // row-major [ c 0 s tx ; 0 1 0 ty ; −s 0 c tz ; 0 0 0 1 ]
  return [c, 0, s, w.x, 0, 1, 0, eyeM, -s, 0, c, w.z, 0, 0, 0, 1];
}

// Verification replica of photo-poses.ts's photoPlanPose — prints where each
// seeded transform actually lands, so the seed log is its own proof.
function poseCheck(t) {
  const theta = (PROV.yawDeg * Math.PI) / 180;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const rx = t[3] * c + t[11] * s;
  const rz = -t[3] * s + t[11] * c;
  let hd = (Math.atan2(-t[10], -t[2]) * 180) / Math.PI - PROV.yawDeg;
  hd = ((hd % 360) + 360) % 360;
  return {
    x: (rx - PROV.off.x) * M_TO_FT,
    z: (rz - PROV.off.z) * M_TO_FT,
    heading: hd,
  };
}

// 6 photos: one is_primary, and #5/#6 sit ~0.67 ft apart (a 1.5-ft cluster).
const FIXTURE_PHOTOS = [
  { file: 'auto_000001.jpg', plan: { x: 2.5, z: 2.5 }, primary: true, caption: 'By the entry', role: 'coverage_early' },
  { file: 'auto_000002.jpg', plan: { x: 11.0, z: 6.8 }, primary: false, caption: null, role: 'coverage_mid' },
  { file: 'auto_000003.jpg', plan: { x: 11.5, z: 11.5 }, primary: false, caption: 'South-east corner', role: 'coverage_mid' },
  { file: 'auto_000004.jpg', plan: { x: 7.0, z: 2.2 }, primary: false, caption: null, role: 'feature_window' },
  { file: 'auto_000005.jpg', plan: { x: 3.8, z: 10.6 }, primary: false, caption: 'Sideboard wall', role: 'coverage_late' },
  { file: 'auto_000006.jpg', plan: { x: 4.4, z: 10.9 }, primary: false, caption: null, role: 'coverage_late' },
];

async function seedPhotos(env, elena, scan) {
  console.log('\n=== Seeding fixture photos ===');
  if (!existsSync(PHOTOS_DIR)) {
    console.error(`error: fixture photos dir not found at ${PHOTOS_DIR}`);
    process.exit(1);
  }

  // Idempotent: clear this scan's existing photo rows first.
  const removed = await restDelete(env, 'room_scan_images', `scan_id=eq.${scan.id}`);
  console.log(`Cleared ${removed.length} existing room_scan_images row(s) for this scan.`);

  const baseTime = Date.parse('2026-07-16T15:20:00Z');
  const rows = [];
  for (let i = 0; i < FIXTURE_PHOTOS.length; i++) {
    const fx = FIXTURE_PHOTOS[i];
    const filePath = path.join(PHOTOS_DIR, fx.file);
    if (!existsSync(filePath)) {
      console.error(`error: fixture photo missing at ${filePath}`);
      process.exit(1);
    }
    const objectPath = `photos/${elena.id}/${scan.id}/${fx.file}`;
    await storageUpload(env, BUCKET, objectPath, readFileSync(filePath), 'image/jpeg');
    const url = publicUrl(env, BUCKET, objectPath);

    const transform = cameraTransformFacing(fx.plan, ROOM_CENTRE);
    const pose = poseCheck(transform);
    console.log(
      `  ${fx.file}: plan(${fx.plan.x}, ${fx.plan.z}) → pose(${pose.x.toFixed(2)}, ${pose.z.toFixed(2)}) heading ${pose.heading.toFixed(0)}°`,
    );

    rows.push({
      scan_id: scan.id,
      role: fx.role,
      is_primary: fx.primary,
      display_order: i + 1,
      image_url: url,
      thumbnail_url: url, // self-thumb OK locally (no derivative lane here)
      mime_type: 'image/jpeg',
      photo_kind: 'auto',
      caption: fx.caption,
      captured_at: new Date(baseTime + i * 45_000).toISOString(),
      camera_transform: transform,
      quality_score: 0.7 + i * 0.02,
      width: 240,
      height: 240,
    });
  }

  const inserted = await restPost(env, 'room_scan_images', rows);
  console.log(`Inserted ${inserted.length} room_scan_images row(s).`);

  // Distance between the two cluster members — proof the pair is within 1.5 ft.
  const a = FIXTURE_PHOTOS[4].plan;
  const b = FIXTURE_PHOTOS[5].plan;
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  console.log(`Cluster pair (#5,#6) plan distance: ${d.toFixed(2)} ft (< 1.5 ft → clusters).`);
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

  // --photos-only: skip the JSON upload / patch / parse; just (re)seed photos.
  if (opts.photosOnly) {
    await seedPhotos(env, elena, scan);
    console.log('\n--photos-only passed — skipped JSON upload + parse.');
    return;
  }

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

  if (opts.photos) {
    await seedPhotos(env, elena, scan);
  } else {
    console.log('\n--no-photos passed — skipping photo seeding step.');
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

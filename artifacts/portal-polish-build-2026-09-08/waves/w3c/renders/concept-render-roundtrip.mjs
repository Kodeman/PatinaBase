// Wave 3c — the program's FIRST REAL STORAGE ROUND-TRIP.
//
// Every wave up to here proved D8/A3's delete-before-null ordering by unit test
// (`invocationCallOrder`). Nothing had ever put an object into the private
// `room-renders` bucket (00580) or taken one out. This does, against the local
// stack, signed in as the seeded designer, through the real UI:
//
//   node concept-render-roundtrip.mjs upload   → open the act, choose a PNG,
//                                                caption it, Upload
//   node concept-render-roundtrip.mjs remove   → press Remove on the standing
//                                                render
//
// Between the two runs the caller checks postgres: the four `project_rooms`
// columns and the `storage.objects` row. The point of the split is that the
// database is read while the object is genuinely standing, not inferred from
// the DOM.
//
// Target: Aspen Loft Refresh / Living Room, whose `designer_id` IS
// designer@patina.dev — so `app_private.is_project_studio_member` (the gate on
// all four storage policies) is satisfied by the real signed-in session, not by
// a service-role bypass.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import zlib from 'node:zlib';

const OUT =
  '/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int3c/artifacts/portal-polish-build-2026-09-08/waves/w3c/renders';
const BASE = 'http://localhost:3000';
const EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

const PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d1'; // Aspen Loft Refresh
const ROOM_ID = 'b0000000-0000-0000-0000-0000000d2c0b'; // Living Room
const FILE_NAME = 'w3c-roundtrip.png';
const CAPTION = 'Wave 3c round-trip proof';

const mode = process.argv[2];
if (!['upload', 'remove'].includes(mode)) {
  console.error('usage: concept-render-roundtrip.mjs <upload|remove>');
  process.exit(2);
}

/** A real 8x8 PNG, built here so the round-trip carries no checked-in binary. */
function makePng(path) {
  const w = 8;
  const h = 8;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      raw[o++] = 44; // charcoal-ish, so the plate is visible in a screenshot
      raw[o++] = 41;
      raw[o++] = 38;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path, png);
  return png.length;
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

async function signIn(page) {
  await page.addInitScript((k) => {
    try {
      localStorage.setItem(k, '1');
    } catch {}
  }, WELCOME_SHOWN_KEY);
  await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  if (!page.url().includes('/auth/signin')) return;
  const disclosure = page.getByRole('button', {
    name: /sign in with email|use email and password instead/i,
  });
  await disclosure.first().waitFor({ state: 'visible', timeout: 20000 });
  await disclosure.first().click();
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|people|library|rooms|room|drafting|compose|preferences)/, {
    timeout: 90000,
  });
}

async function dismiss(page) {
  const skip = page.getByRole('button', { name: /skip for now/i });
  if (await skip.count()) {
    await skip.first().click();
    await page.waitForTimeout(900);
  }
}

const out = { mode, steps: [] };
const step = (name, detail) => {
  out.steps.push({ name, detail });
  console.log(`· ${name}: ${JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !page.url().includes('/auth/signin')) errs.push(m.text().slice(0, 200));
  });

  await signIn(page);
  await page.goto(`${BASE}/doc/${PROJECT_ID}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  await dismiss(page);

  // The FF&E region folds when it has no lines; the concept-render act lives
  // inside it, so unfold before looking for the room.
  let room = page.locator(`[data-concept-render-room="${ROOM_ID}"]`);
  if ((await room.count()) === 0) {
    const unfold = page.getByRole('button', { name: /pieces|ff&e|furnishings/i });
    step('ffe-unfold-candidates', await unfold.count());
    for (let i = 0; i < (await unfold.count()); i++) {
      await unfold.nth(i).click().catch(() => {});
      await page.waitForTimeout(1200);
      if ((await room.count()) > 0) break;
    }
  }
  await room.first().waitFor({ state: 'attached', timeout: 30000 });
  await room.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  step('room-container-found', await room.count());
  step('room-container-text', (await room.first().innerText().catch(() => '')).slice(0, 160));

  if (mode === 'upload') {
    const png = `${OUT}/${FILE_NAME}`;
    step('png-generated-bytes', makePng(png));

    const add = room.first().getByRole('button', { name: /add a concept render/i });
    await add.waitFor({ state: 'visible', timeout: 30000 });
    await add.click();
    await page.waitForTimeout(800);

    await room.first().locator('input[type="file"]').setInputFiles(png);
    await page.waitForTimeout(500);
    await room.first().getByLabel(/^caption$/i).fill(CAPTION);
    await page.waitForTimeout(300);

    const upload = room.first().getByRole('button', { name: /^upload$/i });
    await upload.waitFor({ state: 'visible', timeout: 15000 });
    await upload.click();

    // The act closes and the standing plate appears once the row is written.
    await room
      .first()
      .getByRole('button', { name: /^remove$/i })
      .waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(1500);
    step('standing-caption', (await room.first().innerText().catch(() => '')).slice(0, 200));
    step('plate-img-count', await room.first().locator('img').count());
    await room.first().screenshot({ path: `${OUT}/concept-render-standing.png` });
  }

  if (mode === 'remove') {
    const remove = room.first().getByRole('button', { name: /^remove$/i });
    await remove.waitFor({ state: 'visible', timeout: 30000 });
    await remove.click();
    await room
      .first()
      .getByRole('button', { name: /add a concept render/i })
      .waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(1200);
    step('after-remove-text', (await room.first().innerText().catch(() => '')).slice(0, 200));
    step('plate-img-count', await room.first().locator('img').count());
    await room.first().screenshot({ path: `${OUT}/concept-render-removed.png` });
  }

  out.consoleErrors = errs;
  await ctx.close();
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/roundtrip-${mode}.json`, JSON.stringify(out, null, 2));
}

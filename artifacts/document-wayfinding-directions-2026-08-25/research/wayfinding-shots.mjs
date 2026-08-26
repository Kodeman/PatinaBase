/**
 * E1 evidence:shots-flag-off — The Document Wayfinding Review (2026-08-25).
 *
 * Ported from apps/designer-portal/scripts/the-document-track3-shots.mjs and
 * repaired for the current codebase:
 *   (a) login ported from e2e/fixtures/auth.ts (the old "portal" route wait
 *       is gone — the app lands on /desk now, and sign-in is collapsed
 *       behind a disclosure button).
 *   (b) hide-dev-overlays init script ported from e2e/helpers/hide-dev-overlays.ts
 *       (TanStack Query devtools toggle can swallow clicks in dev).
 *   (c) shot(name, fn, {full}) — fullPage:true for paper/route shots,
 *       fullPage:false (viewport) for rails/⌘K/drawer/sheet shots.
 *   (d) psql helper points at 127.0.0.1:54322 (unused directly here — ids
 *       come from state-ladder.json, already resolved via psql upstream).
 *   (e) OUT dir is the absolute artifacts/shots directory for this program.
 *   (f) every doc/room/board/drafting id resolved from state-ladder.json.
 *   (g) width-conditional shot lists (SHOT_W drives which blocks run).
 *   (h) at SHOT_W=390 the context uses viewport 390x844, isMobile, hasTouch,
 *       deviceScaleFactor 2.
 *
 * Run three passes from apps/designer-portal:
 *   SHOT_W=1440 SHOT_H=900 SHOT_PREFIX=w1440- node <this file>
 *   SHOT_W=1280 SHOT_H=900 SHOT_PREFIX=w1280- node <this file>
 *   SHOT_W=390  SHOT_H=844 SHOT_PREFIX=m390-  node <this file>
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT = '/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/shots/';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const done = [];
const failed = [];

const W = Number(process.env.SHOT_W) || 1440;
const H = Number(process.env.SHOT_H) || 900;
const PREFIX = process.env.SHOT_PREFIX || '';
const MOBILE = W < 700;

// ── State ladder (resolved doc ids) ──
//
// DRIFT NOTE (found at harness-run time, psql-verified against the live local
// stack): the local Supabase DB was reset/reseeded some time after E0 wrote
// state-ladder.json — every FIXED-uuid row (b0…d1/d3/d4/002/001, the
// direction/discovery ids) survived unchanged, but rows with a generated
// `gen_random_uuid()` default did not: the 5 `lead` rows and the Chen/Olsen
// `project` rows all got new random ids on reseed. This broke `brief` and
// `project_rich`. It ALSO wiped the install/care RPC-driven state (both
// projects were back to active_section='project' with no phase in
// document_state) — redone below with the exact same RPC chain E0 documented
// in 00-env-and-seeds.md §5 (expire_client_decision → advance_project_phase
// ×2 for install; advance_project_phase ×2 → close_project for care),
// verified via psql before this script ran. Corrected ids only (state-ladder.json
// itself, an E0 deliverable, is left untouched):
const LADDER = JSON.parse(
  readFileSync(path.join(__dirname, 'state-ladder.json'), 'utf8'),
);
const S = LADDER.states;
const EXTRA = LADDER.extra;
S.brief = {
  ...S.brief,
  id: 'def699b9-4ffa-4d8e-8a9f-17b3d7db84fd',
  title: 'Full Room',
  note: 'CORRECTED at E1 shot-time — the original 6d18a14c… lead id from state-ladder.json no longer exists after a DB reseed; this is a current lead row with active_section=brief.',
};
S.project_rich = {
  ...S.project_rich,
  id: '2992a486-b2bd-4139-9e51-33ed1621c59c',
  title: 'Chen Residence',
  note: 'CORRECTED at E1 shot-time — the original 67b836e8… Chen id from state-ladder.json no longer exists after a DB reseed; re-verified via psql that this current Chen Residence row still ties Olsen for richest active project (3 project_ffe_items, 4 purchase_orders), matching E0\'s original tiebreak.',
};

const TEST_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev';
const TEST_PASSWORD = process.env.DESIGNER_E2E_PASSWORD ?? 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

// ── hide-dev-overlays (ported from e2e/helpers/hide-dev-overlays.ts) ──
async function hideDevOverlays(page) {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style');
      style.setAttribute('data-e2e-hide-dev-overlays', '');
      style.textContent =
        '.tsqd-open-btn-container, .tsqd-main-panel { display: none !important; pointer-events: none !important; }';
      document.head?.appendChild(style);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject);
    } else {
      inject();
    }
  });
}

// ── auth (ported from e2e/fixtures/auth.ts) ──
async function signIn(page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
  }, WELCOME_SHOWN_KEY);

  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, {
        timeout: 30_000,
        waitUntil: 'networkidle',
      });
      if (!page.url().includes('/auth/signin')) return;

      const disclosure = page.getByRole('button', {
        name: /sign in with email|use email and password instead/i,
      });
      await disclosure.first().waitFor({ state: 'visible', timeout: 15_000 });
      await disclosure.first().click();

      const emailInput = page.getByLabel(/email/i).first();
      await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
      await emailInput.fill(TEST_EMAIL);

      const passwordInput = page.getByLabel(/password/i).first();
      await passwordInput.fill(TEST_PASSWORD);

      await page.getByRole('button', { name: /^sign in$/i }).click();

      await page.waitForURL(
        /\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/,
        { timeout: 60_000 },
      );
      console.log('✓ signed in as', TEST_EMAIL);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await page.waitForTimeout(500);
    }
  }
  throw new Error(`Authentication failed after ${maxAttempts} attempts: ${lastError?.message ?? 'unknown'}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  isMobile: MOBILE,
  hasTouch: MOBILE,
  deviceScaleFactor: MOBILE ? 2 : 1,
});
const page = await context.newPage();
await hideDevOverlays(page);
page.setDefaultTimeout(20_000);

const shot = async (name, fn, { full = false } = {}) => {
  try {
    await fn();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}${PREFIX}${name}.png`, fullPage: full });
    done.push(name);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed.push(`${name}: ${e.message?.split('\n')[0]}`);
    console.log(`✗ ${name} — ${e.message?.split('\n')[0]}`);
    try {
      await page.screenshot({ path: `${OUT}${PREFIX}${name}.png`, fullPage: full });
    } catch {}
  }
};

/** Clip-capture: screenshot just the bounding box of a locator, padded. */
const clipShot = async (name, locator, pad = 24) => {
  try {
    await locator.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await locator.first().boundingBox();
    if (!box) throw new Error('locator has no bounding box (not visible)');
    const x = Math.max(0, Math.round(box.x) - pad);
    const y = Math.max(0, Math.round(box.y) - pad);
    const width = Math.min(W - x, Math.round(box.width) + pad * 2);
    const height = Math.min(H - y, Math.round(box.height) + pad * 2);
    await page.screenshot({ path: `${OUT}${PREFIX}${name}.png`, clip: { x, y, width, height } });
    done.push(name);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed.push(`${name}: ${e.message?.split('\n')[0]}`);
    console.log(`✗ ${name} — ${e.message?.split('\n')[0]}`);
    try {
      await page.screenshot({ path: `${OUT}${PREFIX}${name}.png`, fullPage: false });
    } catch {}
  }
};

const gotoDoc = async (id) => {
  await page.goto(`${BASE}/doc/${id}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await page.waitForSelector('[data-document-shell]', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
};

const gotoDesk = async () => {
  await page.goto(`${BASE}/desk`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await page.waitForSelector('[aria-label="Desk actions"]', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
};

await signIn(page);

// ════════════════════════════════════════════════════════════════
// ALL WIDTHS, fullPage
// ════════════════════════════════════════════════════════════════
await shot('desk', async () => { await gotoDesk(); }, { full: true });

await shot('doc-brief', async () => { await gotoDoc(S.brief.id); }, { full: true });
await shot('doc-discovery', async () => { await gotoDoc(S.discovery.id); }, { full: true });
await shot('doc-direction', async () => { await gotoDoc(S.direction.id); }, { full: true });
await shot('doc-proposal-sent', async () => { await gotoDoc(S.proposal_sent.id); }, { full: true });
await shot('doc-project-rich', async () => { await gotoDoc(S.project_rich.id); }, { full: true });
await shot('doc-project-plain', async () => { await gotoDoc(S.project_plain.id); }, { full: true });
await shot('doc-install', async () => { await gotoDoc(S.install.id); }, { full: true });
await shot('doc-care', async () => { await gotoDoc(S.care.id); }, { full: true });

// ════════════════════════════════════════════════════════════════
// 1440 & 1280 — spine detail / hover (viewport, not full)
// ════════════════════════════════════════════════════════════════
if (W === 1440 || W === 1280) {
  await shot('spine-detail', async () => {
    await gotoDoc(S.project_rich.id);
    await page.waitForSelector('[data-document-spine]', { timeout: 15_000 });
  });

  // No literal "···" overflow trigger exists anywhere in doc-spine.tsx or
  // region-head.tsx (verified by source grep at harness-build time) — the
  // closest real affordance is a spine mark's native `title` tooltip
  // ("Jump to {Label}") on an active/settled marker. Hover that instead and
  // note the substitution in the ledger.
  await shot('spine-hover-overflow', async () => {
    await gotoDoc(S.project_rich.id);
    const mark = page.locator('[data-document-spine] button[title^="Jump to"]').first();
    await mark.waitFor({ state: 'visible', timeout: 15_000 });
    await mark.hover();
    await page.waitForTimeout(600); // let the native tooltip appear
  });
}

// ════════════════════════════════════════════════════════════════
// 1440 ONLY
// ════════════════════════════════════════════════════════════════
if (W === 1440) {
  await shot('running-index-midscroll', async () => {
    await gotoDoc(S.project_rich.id);
    await page.evaluate(() => {
      const main = document.querySelector('[data-document-paper]');
      if (main) window.scrollTo(0, main.scrollHeight ? main.scrollHeight * 0.45 : document.body.scrollHeight * 0.45);
    });
    await page.waitForTimeout(500);
  });

  // The rooms block only renders when the project HAS project_rooms rows
  // (SpineRoomsBlock: `if (rooms.length === 0) return null`) — project-rich
  // (Chen Residence) has 0 rooms (psql-verified), so this and room-lens-held
  // use install (Aspen Loft, 2 project_rooms: Dining Room, Living Room)
  // instead, which is the only ladder stage with any rooms at all.
  await shot('rooms-block', async () => {
    await gotoDoc(S.install.id);
    await page.waitForSelector('[aria-labelledby="doc-spine-rooms-label"]', { timeout: 15_000 });
  });

  await shot('room-lens-held', async () => {
    await gotoDoc(S.install.id);
    const roomsGroup = page.locator('[aria-labelledby="doc-spine-rooms-label"]');
    await roomsGroup.waitFor({ timeout: 15_000 });
    const firstRoom = roomsGroup.locator('button').first();
    await firstRoom.click();
    await page.waitForTimeout(500);
  });

  await shot('shelves-block', async () => {
    await gotoDoc(S.project_rich.id);
    await page.waitForSelector('[aria-labelledby="doc-spine-shelves-label"]', { timeout: 15_000 });
  });

  const openShelf = async (key) => {
    await gotoDoc(S.project_rich.id);
    const trigger = page.locator(`[data-shelf-trigger="${key}"]`);
    await trigger.waitFor({ timeout: 15_000 });
    await trigger.click();
    await page.waitForTimeout(500);
  };
  await shot('shelf-planroom', async () => { await openShelf('planroom'); });
  await shot('shelf-specbook', async () => { await openShelf('specbook'); });
  await shot('shelf-moodboards', async () => { await openShelf('moodboards'); });
  await shot('shelf-knowledge', async () => { await openShelf('knowledge'); });

  await shot('shelf-callsheet-doorway', async () => {
    await gotoDoc(S.project_rich.id);
    const trigger = page.locator('[data-shelf-trigger="callsheet"]');
    await trigger.waitFor({ timeout: 15_000 });
    await trigger.hover();
    await page.waitForTimeout(400);
  });

  await shot('margin-closed', async () => {
    await gotoDoc(S.project_rich.id);
    // NOTE: `[data-margin-trigger], [data-margin-panel]` as one selector list
    // resolves to whichever node is first in DOM order (the trigger button)
    // and waits for THAT node specifically — but the trigger only renders
    // 1180-1439px wide and is intentionally `hidden` at 1440 (the margin
    // rail is always-on there instead), so it can never become visible and
    // the wait timed out. `[data-margin-panel]` is the one that's actually
    // present (and visible) at every width ≥1180, so wait on it directly.
    await page.waitForSelector('[data-margin-panel]', { timeout: 15_000 });
  });

  await shot('margin-open', async () => {
    await gotoDoc(S.project_rich.id);
    const panel = page.locator('[data-margin-panel]');
    const alreadyOpen = await panel.isVisible().catch(() => false);
    if (!alreadyOpen) {
      const trigger = page.locator('[data-margin-trigger]');
      await trigger.waitFor({ timeout: 15_000 });
      await trigger.click();
    }
    await page.waitForSelector('[data-margin-panel]', { timeout: 15_000 });
    await page.waitForTimeout(400);
  });

  await shot('margin-composer', async () => {
    // "+ Decision" only renders when the project has a decision lead/client
    // assigned (`canCompose = Boolean(projectId && designerClientId)`,
    // margin-rail.tsx:365) — project-rich (Chen Residence) has no client_id
    // (psql-verified), so it uses project-plain (Marrow & Vale) instead,
    // which does have one.
    await gotoDoc(S.project_plain.id);
    const panel = page.locator('[data-margin-panel]');
    if (!(await panel.isVisible().catch(() => false))) {
      const trigger = page.locator('[data-margin-trigger]');
      if (await trigger.isVisible().catch(() => false)) await trigger.click();
    }
    await page.waitForSelector('[data-margin-panel]', { timeout: 15_000 });
    const decisionBtn = page.getByRole('button', { name: '+ Decision' });
    await decisionBtn.waitFor({ timeout: 10_000 });
    await decisionBtn.click();
    await page.waitForTimeout(500);
  });

  // Red-letter zone — try project-rich, then install (per brief instruction).
  // Note: this is a section, not role="alert" (confirmed by source read —
  // red-letter-zone.tsx explicitly avoids role="alert" by design comment).
  // Standalone (not via shot()) so the clip screenshot isn't overwritten by
  // shot()'s own post-fn() viewport capture.
  try {
    await gotoDoc(S.project_rich.id);
    let zone = page.locator('[aria-label="Needs attention"]');
    let visible = await zone.isVisible().catch(() => false);
    if (!visible) {
      await gotoDoc(S.install.id);
      zone = page.locator('[aria-label="Needs attention"]');
      visible = await zone.isVisible().catch(() => false);
    }
    if (visible) {
      await clipShot('red-letter-zone', zone, 24);
    } else {
      failed.push('red-letter-zone: no "Needs attention" zone visible on project-rich or install');
      console.log('✗ red-letter-zone — no zone visible on project-rich or install');
      try { await page.screenshot({ path: `${OUT}${PREFIX}red-letter-zone.png`, fullPage: false }); } catch {}
    }
  } catch (e) {
    failed.push(`red-letter-zone: ${e.message?.split('\n')[0]}`);
    console.log(`✗ red-letter-zone — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}red-letter-zone.png`, fullPage: false }); } catch {}
  }

  try {
    await gotoDoc(S.project_rich.id);
    const heading = page.locator('#money-region-heading');
    let foundHeading = await heading.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
    if (!foundHeading) {
      // Folded: FoldSeam unmounts the RegionHead entirely (no #money-region-heading
      // in the DOM at all — it's not just hidden), replacing it with a button
      // carrying `data-fold-seam="money-region-heading"` (fold-seam.tsx). Click
      // THAT specific seam (not just any "unfold ↓" text — Client approvals,
      // Schedule, and Design authority/Money can all be folded on the same
      // document and each renders its own seam).
      const seam = page.locator('[data-fold-seam="money-region-heading"]');
      if (await seam.isVisible().catch(() => false)) {
        await seam.click();
        await page.waitForTimeout(500);
        foundHeading = await heading.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
      }
    }
    const target = foundHeading
      ? page.locator('section[aria-label="Money"]').first()
      : page.locator('[data-fold-seam="money-region-heading"]').first();
    await clipShot('money-region', target, 24);
  } catch (e) {
    failed.push(`money-region: ${e.message?.split('\n')[0]}`);
    console.log(`✗ money-region — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}money-region.png`, fullPage: false }); } catch {}
  }

  await shot('record-foot', async () => {
    await gotoDoc(S.project_rich.id);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  });

  await shot('guide-proposal-sent', async () => {
    await gotoDoc(S.proposal_sent.id);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
  });

  await shot('install-section', async () => {
    await gotoDoc(S.install.id);
    const anchor = page.locator('#doc-section-install');
    await anchor.waitFor({ timeout: 15_000 }).catch(() => {});
    if (await anchor.count()) await anchor.scrollIntoViewIfNeeded();
  });

  await shot('care-band', async () => {
    await gotoDoc(S.care.id);
    const anchor = page.locator('#doc-section-care');
    await anchor.waitFor({ timeout: 15_000 }).catch(() => {});
    if (await anchor.count()) await anchor.scrollIntoViewIfNeeded();
    else await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  });

  await shot('cmdk-open', async () => {
    await gotoDesk();
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[role="dialog"][aria-label="Command bar"]', { timeout: 10_000 });
  });

  await shot('cmdk-typed', async () => {
    await gotoDesk();
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[role="dialog"][aria-label="Command bar"]', { timeout: 10_000 });
    await page.fill('input[aria-label="Find anything, or ask the Engine"]', 'install');
    await page.waitForTimeout(500);
  });

  await shot('cmdk-engine-row', async () => {
    await gotoDesk();
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[role="dialog"][aria-label="Command bar"]', { timeout: 10_000 });
    await page.fill('input[aria-label="Find anything, or ask the Engine"]', 'walnut console');
    await page.waitForTimeout(500);
  });

  try {
    await gotoDesk();
    const strip = page.locator('[aria-label="Studio drawer"]');
    await strip.waitFor({ timeout: 15_000 }).catch(() => {});
    await clipShot('drawer-strip', strip, 8);
  } catch (e) {
    failed.push(`drawer-strip: ${e.message?.split('\n')[0]}`);
    console.log(`✗ drawer-strip — ${e.message?.split('\n')[0]}`);
    try { await page.screenshot({ path: `${OUT}${PREFIX}drawer-strip.png`, fullPage: false }); } catch {}
  }

  await shot('drawer-open', async () => {
    await gotoDesk();
    const doorway = page.locator('[data-studio-books-doorway]');
    await doorway.waitFor({ timeout: 15_000 });
    await doorway.click();
    await page.waitForTimeout(400);
  });

  await shot('drawer-books', async () => {
    await gotoDesk();
    const doorway = page.locator('[data-studio-books-doorway]');
    await doorway.waitFor({ timeout: 15_000 });
    await doorway.click();
    await page.waitForSelector('[aria-label="Studio books"]', { timeout: 10_000 });
  });

  await shot('ledger-sheet-orders', async () => {
    await gotoDesk();
    await page.evaluate(() => {
      window.dispatchEvent(
        // Detail field is `name`, not `key` (studio-drawer.tsx's onOpen
        // destructures `detail.name`) — confirmed by source read.
        new CustomEvent('document:open-ledger', { detail: { name: 'orders' } }),
      );
    });
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await page.waitForTimeout(500);
  });

  // Full-page route shots
  await shot('room-library', async () => {
    await page.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }, { full: true });

  await shot('room-people', async () => {
    await page.goto(`${BASE}/people`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }, { full: true });

  await shot('room-rooms', async () => {
    await page.goto(`${BASE}/rooms`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }, { full: true });

  await shot('leaf-plans-route', async () => {
    await page.goto(`${BASE}/doc/${S.project_rich.id}/plans`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }, { full: true });

  await shot('leaf-specbook-route', async () => {
    await page.goto(`${BASE}/doc/${S.project_rich.id}/spec-book`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }, { full: true });

  if (EXTRA.board_id) {
    await shot('board-route', async () => {
      await page.goto(`${BASE}/board/${EXTRA.board_id}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    }, { full: true });
  } else {
    console.log('⊘ board-route — skipped, no board exists locally (0 rows in project_boards/proposal_boards, per 00-env-and-seeds.md §4 and psql re-check)');
  }

  await shot('drafting-route', async () => {
    await page.goto(`${BASE}/drafting/${EXTRA.drafting_proposal_id}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }, { full: true });

  await shot('room-file-route', async () => {
    await page.goto(`${BASE}/room/${EXTRA.room_id}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }, { full: true });
}

// ════════════════════════════════════════════════════════════════
// 390 ONLY
// ════════════════════════════════════════════════════════════════
if (W === 390) {
  await shot('mobile-bar', async () => {
    await gotoDoc(S.project_rich.id);
    await page.waitForSelector('[data-testid="mobile-bar"]', { timeout: 15_000 });
  });

  await shot('mobile-spine-sheet', async () => {
    await gotoDoc(S.project_rich.id);
    const bar = page.locator('[data-testid="mobile-bar"]');
    await bar.waitFor({ timeout: 15_000 });
    const handle = bar.getByRole('button', { name: /open sections, current section/i });
    await handle.click();
    await page.waitForTimeout(500);
  });

  await shot('mobile-margin-chips', async () => {
    // A dedicated component (mobile-margin-chips.tsx) — letterhead-anchored
    // margin items as chips beneath the title on mobile, replacing the
    // desktop margin rail (which hides below 980px). project-rich (Chen) has
    // 3 margin items (confirmed in the desktop margin rail screenshots), so
    // stay at the top of the page rather than opening the "More" sheet
    // (that's the separate mobile-more-actions shot).
    await gotoDoc(S.project_rich.id);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
  });

  await shot('mobile-more-actions', async () => {
    await gotoDoc(S.project_rich.id);
    const bar = page.locator('[data-testid="mobile-bar"]');
    await bar.waitFor({ timeout: 15_000 });
    const more = bar.getByRole('button', { name: 'More studio actions' }).or(bar.getByRole('button', { name: /^more$/i }));
    await more.first().click();
    await page.waitForTimeout(500);
  });
}

console.log(`\nDONE (${PREFIX || 'no-prefix'}): ${done.length} shots → ${OUT}`);
if (failed.length) console.log(`NOTE (${failed.length}):\n  ` + failed.join('\n  '));
await browser.close();

import { test, expect } from './fixtures/auth';
import { hideDevOverlays } from './helpers/hide-dev-overlays';
import type { Page, ConsoleMessage } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * E3 evidence:probe — interactive/dynamic probes for The Document wayfinding
 * review. Each test appends a structured log entry to a shared JSON array so
 * the calling agent can assemble 01-interactive-probe.md from real observed
 * data (not source-reading guesses).
 */

const EVIDENCE_DIR = path.resolve(
  __dirname,
  '../../../artifacts/document-wayfinding-directions-2026-08-25/probe',
);
const LOG_PATH = path.join(EVIDENCE_DIR, 'probe-log.json');

const IDS = {
  // state-ladder.json's project_rich id (67b836e8-...) does not resolve in
  // this session's live local DB (`document_state` has no row for it) — the
  // DB was reseeded since that file was written. Verified via psql:
  // `select engagement_id from document_state where title ilike '%chen%'`
  // -> 2992a486-b2bd-4139-9e51-33ed1621c59c, "Chen Residence", active_section=project.
  project_rich: '2992a486-b2bd-4139-9e51-33ed1621c59c', // Chen Residence
  install: 'b0000000-0000-0000-0000-0000000000d1', // Aspen Loft Refresh (has project_rooms)
  proposal_sent: 'b0000000-0000-0000-0000-000000000002', // Aspen Loft — Living Room Refresh
  drafting: 'd0c10000-0000-0000-0000-0000000000b2', // Elena Marlowe draft
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

type LogEntry = {
  probe: string;
  steps: string[];
  observed: string;
  verdict: 'works' | 'partial' | 'dead' | 'hazard';
  evidence: string;
};

function appendLog(entry: LogEntry) {
  let all: LogEntry[] = [];
  try {
    all = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch {
    all = [];
  }
  all.push(entry);
  fs.writeFileSync(LOG_PATH, JSON.stringify(all, null, 2));
}

async function shot(page: Page, name: string): Promise<string> {
  const file = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

test.beforeEach(async ({ page }) => {
  await hideDevOverlays(page);
});

// ---------------------------------------------------------------------------
// Probe 1 — hover-only affordances
// ---------------------------------------------------------------------------
test('probe 1: hover-only affordances', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/doc/${IDS.project_rich}`);
  await page.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.mouse.move(5, 5); // ensure nothing is pre-hovered

  const targets: { label: string; selector: string }[] = [
    { label: 'row-overflow "···" glyphs', selector: '[data-row-overflow]' },
    { label: 'region fold "Fold ↑" buttons', selector: 'button:has-text("Fold ↑")' },
    { label: 'colophon actions', selector: '[aria-label="Document colophon actions"] button, [aria-label="Document colophon actions"] a' },
    { label: 'spine marks', selector: '[data-document-spine] button' },
    { label: 'margin item rows', selector: '[data-margin-panel] [role="listitem"], [data-margin-panel] li' },
  ];

  const results: string[] = [];
  for (const t of targets) {
    const loc = page.locator(t.selector);
    const count = await loc.count();
    if (count === 0) {
      results.push(`${t.label}: 0 elements found (selector may not match this doc's state)`);
      continue;
    }
    const first = loc.first();
    const beforeBox = await first.boundingBox();
    const beforeOpacity = await first.evaluate((el) => getComputedStyle(el).opacity);
    const beforeVisible = await first.isVisible();
    await first.hover({ trial: false, force: false }).catch(() => {});
    await page.waitForTimeout(150);
    const afterOpacity = await first.evaluate((el) => getComputedStyle(el).opacity);
    const afterVisible = await first.isVisible();
    results.push(
      `${t.label} (n=${count}): before visible=${beforeVisible} opacity=${beforeOpacity} bbox=${JSON.stringify(beforeBox)}; after-hover visible=${afterVisible} opacity=${afterOpacity} — ${beforeVisible === afterVisible && beforeOpacity === afterOpacity ? 'NO CHANGE (not hover-gated)' : 'CHANGED on hover'}`,
    );
    await page.mouse.move(5, 5);
  }

  const evidence = await shot(page, '01-hover-only');
  appendLog({
    probe: '1-hover-only-affordances',
    steps: [
      'goto /doc/{project_rich} at 1440x1000',
      'wait [data-document-shell] visible',
      'for each candidate trigger: measure visibility/opacity before + after page.hover()',
    ],
    observed: results.join(' | '),
    verdict: results.every((r) => r.includes('NO CHANGE')) ? 'works' : 'partial',
    evidence,
  });
});

// ---------------------------------------------------------------------------
// Probe 2 — Esc chain
// ---------------------------------------------------------------------------
test('probe 2: esc chain', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/doc/${IDS.project_rich}`);
  await page.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 20_000 });
  const startUrl = page.url();

  const steps: string[] = [];

  // 1. Open a shelf leaf (Plan room)
  const planRoomRow = page.locator('button', { hasText: 'Plan room' }).first();
  const planRoomExists = (await planRoomRow.count()) > 0;
  if (planRoomExists) {
    await planRoomRow.click();
    await page.waitForTimeout(300);
  }
  const shelfOpenAfterClick = (await page.locator('[aria-label="Plan room shelf"]').count()) > 0;
  steps.push(`opened shelf leaf 'Plan room': shelfOpenAfterClick=${shelfOpenAfterClick}`);

  // 2. Open ⌘K on top of it
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(300);
  const cmdkOpen = (await page.locator('[role="dialog"][aria-label="Command bar"]').count()) > 0;
  steps.push(`opened ⌘K on top: cmdkOpen=${cmdkOpen}`);

  // 3. Try to open a margin panel underneath (only has a trigger at 1180-1439; skip separately)
  // At 1440 the margin is a rail, not a dialog — so this step is folded into
  // probe 6 at the narrower width. Here we just record the state before Esc.
  const evidence1 = await shot(page, '02-esc-chain-stacked');

  // Press Escape #1 — should close ⌘K (topmost dialog)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const afterEsc1 = {
    url: page.url(),
    cmdkOpen: (await page.locator('[role="dialog"][aria-label="Command bar"]').count()) > 0,
    shelfOpen: (await page.locator('[aria-label="Plan room shelf"]').count()) > 0,
  };
  steps.push(`Esc #1: url=${afterEsc1.url} cmdkOpen=${afterEsc1.cmdkOpen} shelfOpen=${afterEsc1.shelfOpen}`);

  // Press Escape #2 — should close the shelf leaf
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const afterEsc2 = {
    url: page.url(),
    cmdkOpen: (await page.locator('[role="dialog"][aria-label="Command bar"]').count()) > 0,
    shelfOpen: (await page.locator('[aria-label="Plan room shelf"]').count()) > 0,
  };
  steps.push(`Esc #2: url=${afterEsc2.url} cmdkOpen=${afterEsc2.cmdkOpen} shelfOpen=${afterEsc2.shelfOpen}`);

  // Press Escape #3 — should put the document down (navigate to /desk)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const afterEsc3 = { url: page.url() };
  steps.push(`Esc #3: url=${afterEsc3.url}`);

  const evidence2 = await shot(page, '02-esc-chain-final');

  const stranded =
    afterEsc1.cmdkOpen || afterEsc2.shelfOpen || (afterEsc3.url === startUrl && !afterEsc3.url.includes('/desk'));

  appendLog({
    probe: '2-esc-chain',
    steps,
    observed: `Order: shelf leaf opened -> ⌘K opened on top -> Esc1 closes ⌘K (cmdkOpen after=${afterEsc1.cmdkOpen}) -> Esc2 closes shelf (shelfOpen after=${afterEsc2.shelfOpen}) -> Esc3 puts document down (final url=${afterEsc3.url}, started at ${startUrl})`,
    verdict: stranded ? 'hazard' : 'works',
    evidence: `${evidence1}, ${evidence2}`,
  });
});

// ---------------------------------------------------------------------------
// Probe 3 — keyboard chords
// ---------------------------------------------------------------------------
test('probe 3: keyboard chords', async ({ authenticatedPage: page }) => {
  const chordResults: string[] = [];

  async function tryChord(startUrl: string, keys: string, expectDialogAria?: string) {
    await page.goto(startUrl);
    // Do NOT click anything here: document.activeElement is already <body>
    // right after a fresh navigation with nothing explicitly focused, which
    // is exactly the "focus hasn't left body" precondition the app's own
    // registry-shortcuts.tsx checks. Clicking a coordinate risks landing on
    // a real focusable element (e.g. the drawer wordmark at top-left) and
    // moving focus there instead, which would make the app correctly (by
    // its own contract) ignore the chord — a false "dead" reading caused by
    // the probe, not the app.
    await page.waitForTimeout(500);
    const before = page.url();
    for (const k of keys.split(' ')) {
      await page.keyboard.press(k);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(800);
    const after = page.url();
    let dialogAria: string | null = null;
    let dialogCount = 0;
    const dialog = page.locator('[role="dialog"]');
    dialogCount = await dialog.count();
    if (dialogCount > 0) {
      dialogAria = await dialog.first().getAttribute('aria-label');
    }
    chordResults.push(
      `from ${startUrl} keys="${keys}": url ${before} -> ${after}${dialogCount > 0 ? `, dialog opened (count=${dialogCount}, aria-label=${dialogAria ?? 'null'})` : ', no dialog'}`,
    );
    // Close whatever opened, to isolate the next chord.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  // g-chords from /desk
  for (const key of ['g l', 'g p', 'g r', 'g o', 'g a', 'g h', 'g t']) {
    await tryChord('/desk', key);
  }
  // Meta+K
  await tryChord('/desk', 'Meta+k');
  // '/' and '?'
  await tryChord('/desk', '/');
  await tryChord('/desk', '?');

  const evidence = await shot(page, '03-chords-desk-final');

  // Cross-check: is any chord text rendered on screen anywhere (desk, doc, help)?
  await page.goto('/desk');
  const deskBodyText = await page.locator('body').innerText();
  const chordShownOnDesk = /\bg\s*(then|\+)?\s*[lprohat]\b/i.test(deskBodyText) || deskBodyText.includes('⌘K') || deskBodyText.includes('Meta+K') || deskBodyText.includes('Cmd+K');

  await page.goto(`/doc/${IDS.project_rich}`);
  await page.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 20_000 });
  const docBodyText = await page.locator('body').innerText();
  const chordShownOnDoc = /\bg\s*(then|\+)?\s*[lprohat]\b/i.test(docBodyText);

  chordResults.push(
    `chord text visible anywhere on screen: desk="${chordShownOnDesk}" (⌘K glyph likely present as UI convention, not the g-chords), doc="${chordShownOnDoc}"`,
  );

  appendLog({
    probe: '3-keyboard-chords',
    steps: [
      'from /desk, focus body, press each registered g-chord (g l/p/r/o/a/h/t)',
      'press Meta+K',
      "press '/' and '?' (neither has a registered handler in source)",
      'record URL before/after and any [role=dialog] aria-label',
      'grep-derived: check if g-chord text is rendered anywhere on /desk or /doc',
    ],
    observed: chordResults.join(' || '),
    verdict: 'partial',
    evidence,
  });
});

// ---------------------------------------------------------------------------
// Probe 4 — scroll-spy
// ---------------------------------------------------------------------------
test('probe 4: scroll-spy', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/doc/${IDS.project_rich}`);
  await page.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);

  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const steps: string[] = [`document scrollHeight=${scrollHeight}`];
  const observations: string[] = [];

  for (let i = 0; i <= 10; i++) {
    const y = Math.round((scrollHeight * i) / 10);
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(400); // let IntersectionObserver settle
    const activeEntries = await page
      .locator('[aria-current="true"]')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim().slice(0, 60)));
    const anyActive = await page.locator('[aria-current="true"]').count();
    observations.push(`step ${i} (scrollY target=${y}): active entries=${anyActive} -> ${JSON.stringify(activeEntries)}`);
  }

  const evidence = await shot(page, '04-scroll-spy-bottom');

  const zeroActiveSteps = observations.filter((o) => o.includes('active entries=0')).length;
  const multiActiveSteps = observations.filter((o) => /active entries=[2-9]/.test(o)).length;

  appendLog({
    probe: '4-scroll-spy',
    steps: [
      `goto /doc/${IDS.project_rich} at 1440x1000`,
      'scroll in 10 steps top->bottom (11 samples incl. 0 and 10)',
      'at each step read [aria-current="true"] entries in the running index',
    ],
    observed: observations.join(' | '),
    verdict: zeroActiveSteps === 0 && multiActiveSteps === 0 ? 'works' : 'partial',
    evidence,
  });
});

// ---------------------------------------------------------------------------
// Probe 5 — fold/unfold + persistence + running-index unfold
// ---------------------------------------------------------------------------
test('probe 5: fold/unfold persistence', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/doc/${IDS.project_rich}`);
  await page.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 20_000 });

  const steps: string[] = [];
  const observations: string[] = [];

  // Find every visible "Fold ↑" button.
  const foldButtons = page.locator('button:has-text("Fold ↑")');
  const foldCount = await foldButtons.count();
  steps.push(`found ${foldCount} 'Fold ↑' buttons`);

  if (foldCount > 0) {
    const first = foldButtons.first();
    // Identify the region via the nearest preceding heading id for logging.
    const label = await first.evaluate((el) => {
      const section = el.closest('section, div[id]');
      return section?.id || el.closest('[aria-controls]')?.getAttribute('aria-controls') || 'unknown';
    });
    await first.click();
    await page.waitForTimeout(300);
    const seamAfterFold = await page.locator(`[data-fold-seam]`).count();
    observations.push(`clicked first Fold button (region hint="${label}"); [data-fold-seam] count now=${seamAfterFold}`);

    const evidence1 = await shot(page, '05-fold-folded');

    // Read localStorage state.
    const lsEntries = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('patina:doc-fold:')) out[k] = localStorage.getItem(k) ?? '';
      }
      return out;
    });
    observations.push(`localStorage doc-fold keys after fold: ${JSON.stringify(lsEntries)}`);

    // Reload — confirm the region stays folded (a seam is present).
    await page.reload();
    await page.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(400);
    const seamAfterReload = await page.locator('[data-fold-seam]').count();
    observations.push(`after reload: [data-fold-seam] count=${seamAfterReload} (persisted=${seamAfterReload > 0})`);
    const evidence2 = await shot(page, '05-fold-after-reload');

    // Click the running-index entry for a folded region and confirm unfold+scroll.
    const seam = page.locator('[data-fold-seam]').first();
    let unfoldViaIndexWorked = false;
    if ((await seam.count()) > 0) {
      const seamHeadingId = await seam.getAttribute('data-fold-seam');
      // Find the running-index row whose target matches; fall back to clicking the seam itself,
      // then separately test the running-index route by re-folding and using the index row.
      const indexRow = page.locator('[aria-current] , nav a, button').filter({ hasText: '' });
      // Direct approach: click the seam's own "unfold ↓" affordance to validate unfold, then
      // check the running index re-marks it not-folded (data-fold-seam gone).
      await seam.click();
      await page.waitForTimeout(300);
      const seamGone = (await page.locator(`[data-fold-seam="${seamHeadingId}"]`).count()) === 0;
      unfoldViaIndexWorked = seamGone;
      observations.push(`clicked seam for heading="${seamHeadingId}": seam gone after click=${seamGone}`);
    } else {
      observations.push('no [data-fold-seam] present after reload to test unfold-via-click');
    }
    const evidence3 = await shot(page, '05-fold-unfolded');

    appendLog({
      probe: '5-fold-unfold-persistence',
      steps: [...steps, ...observations.slice(0, 2)],
      observed: observations.join(' | '),
      verdict: seamAfterReload > 0 && unfoldViaIndexWorked ? 'works' : 'partial',
      evidence: `${evidence1}, ${evidence2}, ${evidence3}`,
    });
  } else {
    const evidence = await shot(page, '05-fold-none-found');
    appendLog({
      probe: '5-fold-unfold-persistence',
      steps,
      observed: 'No visible Fold ↑ buttons found on Chen Residence at this viewport/state — regions may already default to a state with no foldable body, or data has not settled.',
      verdict: 'partial',
      evidence,
    });
  }
});

// ---------------------------------------------------------------------------
// Probe 6 — focus return
// ---------------------------------------------------------------------------
test('probe 6: focus return', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/doc/${IDS.project_rich}`);
  await page.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 20_000 });

  const observations: string[] = [];

  async function testTriggerCloseFocus(
    triggerLoc: ReturnType<Page['locator']>,
    openLabel: string,
    closeMethod: 'Escape' | 'closeButton',
    closeSelector?: string,
  ) {
    if ((await triggerLoc.count()) === 0) {
      observations.push(`${openLabel}: trigger not found`);
      return;
    }
    const trigger = triggerLoc.first();
    await trigger.scrollIntoViewIfNeeded();
    const triggerHandle = await trigger.elementHandle();
    await trigger.click();
    await page.waitForTimeout(300);
    if (closeMethod === 'Escape') {
      await page.keyboard.press('Escape');
    } else if (closeSelector) {
      const closeBtn = page.locator(closeSelector).first();
      if ((await closeBtn.count()) > 0) await closeBtn.click();
      else await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
    const isTrigger = await page.evaluate((el) => document.activeElement === el, triggerHandle);
    const activeTag = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? `${el.tagName}[aria-label=${el.getAttribute('aria-label')}][class~=${(el.className || '').toString().slice(0, 30)}]` : 'null';
    });
    observations.push(`${openLabel} (close=${closeMethod}): focus returned to trigger=${isTrigger}; document.activeElement=${activeTag}`);
  }

  // Shelf leaf (Plan room) — close via Esc
  await testTriggerCloseFocus(page.locator('button', { hasText: 'Plan room' }), 'shelf leaf (Plan room)', 'Escape');

  // ⌘K — open via click on its trigger if one exists, else keyboard; close via Esc
  const cmdkTrigger = page.locator('button:has-text("Find anything")').first();
  if ((await cmdkTrigger.count()) > 0) {
    await testTriggerCloseFocus(cmdkTrigger, 'Command bar (via header trigger)', 'Escape');
  } else {
    // No visible ⌘K trigger on /doc — deliberately focus a known, named
    // element first so "the pre-open element" is unambiguous in the report.
    const known = page.locator('button', { hasText: 'Plan room' }).first();
    await known.focus();
    const before = await page.evaluateHandle(() => document.activeElement);
    const beforeTag = await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30));
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const same = await page.evaluate((el) => document.activeElement === el, before);
    const afterTag = await page.evaluate(() => document.activeElement?.tagName + '/' + (document.activeElement?.textContent?.trim().slice(0, 30) || document.activeElement?.getAttribute('aria-label')));
    observations.push(
      `Command bar (via Meta+K; no visible trigger on /doc so "Plan room" shelf button was deliberately focused first, label="${beforeTag}"): focus returned to that pre-open element=${same}; document.activeElement after close=${afterTag}`,
    );
  }

  // Orders ledger sheet (drawer book) — behind the "Studio books" disclosure
  // (studio-drawer.tsx:346-372); open it first, then the Orders row is the
  // actual DocSheet trigger (doc-sheet.tsx captures document.activeElement at
  // open time, which is this row, not the disclosure toggle).
  const booksToggle = page.locator('[data-studio-books-doorway]');
  if ((await booksToggle.count()) > 0) {
    await booksToggle.click();
    await page.waitForTimeout(200);
    const ordersRow = page.locator('[role="group"][aria-label="Studio books"] button', { hasText: 'Orders' }).first();
    if ((await ordersRow.count()) > 0) {
      await testTriggerCloseFocus(ordersRow, 'Orders ledger sheet (drawer, via Studio books)', 'Escape');
    } else {
      observations.push('Studio books opened but no "Orders" row found inside it');
    }
  } else {
    observations.push('"Studio books" disclosure toggle not found in Studio drawer');
  }

  // Margin panel at a width where it is a real dialog (1180-1439 -> data-margin-trigger visible)
  await page.setViewportSize({ width: 1300, height: 1000 });
  await page.waitForTimeout(300);
  await testTriggerCloseFocus(page.locator('[data-margin-trigger]'), 'Margin panel (1300px, sheet mode)', 'closeButton', '[data-margin-close]');

  const evidence = await shot(page, '06-focus-return');

  const anyFailed = observations.some((o) => o.includes('returned to trigger=false') || o.includes('returned to pre-open element=false'));

  appendLog({
    probe: '6-focus-return',
    steps: [
      'for each of: shelf leaf, command bar, Orders ledger sheet, margin panel(1300px)',
      'click/keyboard to open, close (Esc or close control), read document.activeElement',
    ],
    observed: observations.join(' | '),
    verdict: anyFailed ? 'partial' : 'works',
    evidence,
  });
});

// ---------------------------------------------------------------------------
// Probe 7 — room-lens strand on resize
// ---------------------------------------------------------------------------
test('probe 7: room-lens strand on resize', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/doc/${IDS.install}`); // Aspen Loft — the only project with project_rooms rows
  await page.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 20_000 });

  const observations: string[] = [];

  const roomButtons = page.locator('[role="group"][aria-labelledby="doc-spine-rooms-label"] button[aria-pressed]');
  const roomCount = await roomButtons.count();
  observations.push(`rooms found in spine rooms block: ${roomCount}`);

  if (roomCount === 0) {
    const evidence = await shot(page, '07-room-lens-no-rooms');
    appendLog({
      probe: '7-room-lens-strand',
      steps: [`goto /doc/${IDS.install} at 1440 (only project with project_rooms rows)`],
      observed: `No rooms rendered in the spine Rooms block on ${IDS.install} either — ${observations.join(' | ')}`,
      verdict: 'partial',
      evidence,
    });
    return;
  }

  await roomButtons.first().click();
  await page.waitForTimeout(300);
  const chipAt1440 = (await page.locator('[data-in-hand-room]').count()) > 0;
  const chipText1440 = chipAt1440 ? await page.locator('[data-in-hand-room]').first().innerText() : null;
  observations.push(`held a room at 1440px: chip present=${chipAt1440} text="${chipText1440}"`);
  const evidence1 = await shot(page, '07-room-held-1440');

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.waitForTimeout(400);
  const chipAt1280 = (await page.locator('[data-in-hand-room]').count()) > 0;
  const releaseVisibleAt1280 = (await page.locator('button[aria-pressed="true"]').count()) > 0;
  observations.push(`at 1280px: chip present=${chipAt1280}, any aria-pressed=true release control visible=${releaseVisibleAt1280}`);
  const evidence2 = await shot(page, '07-room-1280');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const chipAt390 = (await page.locator('[data-in-hand-room]').count()) > 0;
  observations.push(`at 390px: chip present=${chipAt390}`);
  const evidence3 = await shot(page, '07-room-390');

  // Resize back up to 1440 to see if the hold state is gone (matchMedia release
  // is a one-way clear per source — it does not restore on the way back up).
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(400);
  const chipBackAt1440 = (await page.locator('[data-in-hand-room]').count()) > 0;
  observations.push(`resized back up to 1440px: chip present=${chipBackAt1440} (expect false — release is one-way per room-lens-context.tsx)`);
  const evidence4 = await shot(page, '07-room-back-1440');

  const stranded = chipAt1280 || chipAt390;

  appendLog({
    probe: '7-room-lens-strand',
    steps: [
      `goto /doc/${IDS.install} at 1440x1000 (only project with project_rooms rows)`,
      'click first room in the spine Rooms block to hold it',
      'setViewportSize to 1280, then 390, then back to 1440',
      'at each width record [data-in-hand-room] presence',
    ],
    observed: observations.join(' | '),
    verdict: stranded ? 'hazard' : 'works',
    evidence: `${evidence1}, ${evidence2}, ${evidence3}, ${evidence4}`,
  });
});

// ---------------------------------------------------------------------------
// Probe 8 — console errors/warnings across routes
// ---------------------------------------------------------------------------
test('probe 8: console errors across routes', async ({ authenticatedPage: page }) => {
  test.setTimeout(150_000);
  const routes = [
    '/desk',
    `/doc/${IDS.project_rich}`,
    `/doc/${IDS.proposal_sent}`,
    `/doc/${IDS.install}`,
    '/library',
    '/people',
    '/rooms',
    `/drafting/${IDS.drafting}`,
  ];

  const perRoute: Record<string, string[]> = {};

  for (const route of routes) {
    const messages: string[] = [];
    const onConsole = (msg: ConsoleMessage) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        messages.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
      }
    };
    const onPageError = (err: Error) => {
      messages.push(`[pageerror] ${err.message.slice(0, 300)}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    try {
      await page.goto(route, { waitUntil: 'networkidle', timeout: 20_000 });
    } catch (e) {
      messages.push(`[navigation-error] ${(e as Error).message.slice(0, 200)}`);
    }
    await page.waitForTimeout(600);
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    // Dedup identical messages per route.
    perRoute[route] = Array.from(new Set(messages));
  }

  const evidence = await shot(page, '08-console-last-route');

  const observed = Object.entries(perRoute)
    .map(([route, msgs]) => `${route}: ${msgs.length === 0 ? 'clean' : msgs.join(' ;; ')}`)
    .join(' || ');

  const anyErrors = Object.values(perRoute).some((msgs) => msgs.some((m) => m.startsWith('[error') || m.startsWith('[pageerror')));

  appendLog({
    probe: '8-console-errors',
    steps: routes.map((r) => `goto ${r}, waitUntil networkidle, collect console error/warning + pageerror for 600ms settle`),
    observed,
    verdict: anyErrors ? 'partial' : 'works',
    evidence,
  });
});

// ---------------------------------------------------------------------------
// Probe 9 — cold/warm timings
// ---------------------------------------------------------------------------
test('probe 9: cold/warm timings', async ({ browser }) => {
  const results: string[] = [];

  async function timeToShell(ctx: Awaited<ReturnType<typeof browser.newContext>>, route: string, label: string) {
    const p = await ctx.newPage();
    await hideDevOverlays(p);
    // Sign in fresh in this context.
    await p.goto('/auth/signin?callbackUrl=%2Fdesk', { waitUntil: 'networkidle' });
    const disclosure = p.getByRole('button', { name: /sign in with email|use email and password instead/i });
    if ((await disclosure.count()) > 0) {
      await disclosure.first().click();
      await p.getByLabel(/email/i).first().fill('designer@patina.dev');
      await p.getByLabel(/password/i).first().fill('password123');
      await p.getByRole('button', { name: /^sign in$/i }).click();
      await p.waitForURL(/\/(desk|doc)/, { timeout: 60_000 });
    }
    const start = Date.now();
    await p.goto(route, { waitUntil: 'commit' });
    if (route.startsWith('/doc/')) {
      await p.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 30_000 });
    } else {
      await p.waitForSelector('body', { state: 'visible' });
      // /desk has no data-document-shell; wait for a stable landmark instead.
      await p.locator('h1, [data-testid="desk-root"]').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    }
    const elapsed = Date.now() - start;
    results.push(`${label} ${route}: ${elapsed}ms`);
    await p.close();
  }

  // Cold: fresh context per route.
  const coldCtx1 = await browser.newContext();
  await timeToShell(coldCtx1, '/desk', 'cold');
  await coldCtx1.close();

  const coldCtx2 = await browser.newContext();
  await timeToShell(coldCtx2, `/doc/${IDS.project_rich}`, 'cold');
  await coldCtx2.close();

  // Warm: same context, second navigation to the same route.
  const warmCtx = await browser.newContext();
  const wp = await warmCtx.newPage();
  await hideDevOverlays(wp);
  await wp.goto('/auth/signin?callbackUrl=%2Fdesk', { waitUntil: 'networkidle' });
  const disclosure = wp.getByRole('button', { name: /sign in with email|use email and password instead/i });
  if ((await disclosure.count()) > 0) {
    await disclosure.first().click();
    await wp.getByLabel(/email/i).first().fill('designer@patina.dev');
    await wp.getByLabel(/password/i).first().fill('password123');
    await wp.getByRole('button', { name: /^sign in$/i }).click();
    await wp.waitForURL(/\/(desk|doc)/, { timeout: 60_000 });
  }
  // Prime.
  await wp.goto('/desk', { waitUntil: 'networkidle' });
  await wp.goto(`/doc/${IDS.project_rich}`, { waitUntil: 'networkidle' });
  // Warm-time /desk.
  let start = Date.now();
  await wp.goto('/desk', { waitUntil: 'commit' });
  await wp.locator('h1, [data-testid="desk-root"]').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  results.push(`warm /desk: ${Date.now() - start}ms`);
  // Warm-time /doc.
  start = Date.now();
  await wp.goto(`/doc/${IDS.project_rich}`, { waitUntil: 'commit' });
  await wp.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 30_000 });
  results.push(`warm /doc/{project_rich}: ${Date.now() - start}ms`);
  const evidence = await wp.screenshot({ path: path.join(EVIDENCE_DIR, '09-timings-final.png') });
  await warmCtx.close();

  appendLog({
    probe: '9-timings',
    steps: [
      'cold: fresh browser context, sign in, then goto(route) -> [data-document-shell] visible, time from goto start',
      'warm: same context, prime both routes once, then re-navigate and time again',
    ],
    observed: results.join(' | '),
    verdict: 'works',
    evidence: path.join(EVIDENCE_DIR, '09-timings-final.png'),
  });
  void evidence;
});

// ---------------------------------------------------------------------------
// Probe 5b — running-index entry click on a FOLDED region (unfold + scroll)
// ---------------------------------------------------------------------------
test('probe 5b: running-index click unfolds a folded region', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/doc/${IDS.project_rich}`);
  await page.locator('[data-document-shell]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);

  const observations: string[] = [];

  // Fold the Schedule region explicitly via its own Fold button (Schedule is
  // unfolded by default on this doc per probe 4/5).
  const scheduleFold = page
    .locator('h2:has-text("Schedule")')
    .locator('xpath=ancestor::*[self::section or self::div][1]')
    .locator('button:has-text("Fold ↑")')
    .first();
  const scheduleHeading = page.locator('#schedule-title, h2:has-text("Schedule")').first();
  const hasHeading = (await scheduleHeading.count()) > 0;
  observations.push(`Schedule heading present before fold attempt: ${hasHeading}`);

  // Fall back to the generic first Fold button if the targeted one isn't found —
  // record which region we actually operate on via the resulting seam id.
  const anyFold = (await scheduleFold.count()) > 0 ? scheduleFold : page.locator('button:has-text("Fold ↑")').first();
  if ((await anyFold.count()) > 0) {
    await anyFold.click();
    await page.waitForTimeout(300);
  }
  const seams = await page.locator('[data-fold-seam]').evaluateAll((els) => els.map((e) => e.getAttribute('data-fold-seam')));
  observations.push(`seams after folding: ${JSON.stringify(seams)}`);

  // Find the running-index row whose label matches one of the now-folded regions.
  const indexRows = page.locator('[role="group"][aria-labelledby="doc-running-index-label"] button');
  const rowCount = await indexRows.count();
  const rowLabels = await indexRows.evaluateAll((els) => els.map((e) => e.textContent?.trim().slice(0, 40)));
  observations.push(`running-index rows (n=${rowCount}): ${JSON.stringify(rowLabels)}`);

  // Click each running-index row that corresponds to a folded region and see if it unfolds.
  let anyUnfoldWorked = false;
  for (let i = 0; i < rowCount; i++) {
    const row = indexRows.nth(i);
    const label = (await row.innerText()).slice(0, 40);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await row.click();
    await page.waitForTimeout(500);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const seamsAfter = await page.locator('[data-fold-seam]').count();
    observations.push(
      `clicked running-index row "${label}": scrollY ${scrollBefore} -> ${scrollAfter} (moved=${scrollBefore !== scrollAfter}), remaining seams=${seamsAfter}`,
    );
    if (seamsAfter < seams.length) anyUnfoldWorked = true;
  }

  const evidence = await shot(page, '05b-running-index-unfold');

  appendLog({
    probe: '5b-running-index-unfold-folded-region',
    steps: [
      `goto /doc/${IDS.project_rich} at 1440`,
      "click a region's own 'Fold ↑' button to fold it",
      'click every running-index row in turn, observing scroll position + remaining fold-seam count',
    ],
    observed: observations.join(' | '),
    verdict: anyUnfoldWorked ? 'works' : 'partial',
    evidence,
  });
});

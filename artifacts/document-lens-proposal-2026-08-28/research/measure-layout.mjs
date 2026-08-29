/**
 * M1 — layout measurements for "The Smart Lens" proposal (The Document,
 * 2026-08-28).
 *
 * For each doc in {rich, prework} x width in {1440x900, 1280x900,
 * 390x844 (isMobile)} x scroll state in {s0, s1, s2, s3}, records:
 *   1. Header stack rects (letterhead, job ticket, needs-attention/guide,
 *      letterhead instruments, approvals, schedule frame, first region head).
 *   2. Spine ink utilisation (1440/1280 only).
 *   3. Inter-region gaps (header stack -> first head, then head -> head).
 *   4. Margin rail chip density.
 *   5. Frame budget (rail / chrome / header-summary / active-region / other,
 *      as a function of viewport rows).
 *   6. (s0 only) full scrollHeight + a region -> y map.
 *
 * Selectors were confirmed against the live component source rather than
 * assumed:
 *   - `#document-project-status`      doc-letterhead.tsx (the <header>)
 *   - `[data-job-ticket]`             job-ticket.tsx (rows: `[data-ticket-row]`)
 *   - `[aria-label="Needs attention"]`  red-letter-zone.tsx (project docs, when
 *     the Desk composition has red-letter rows)
 *   - `section[aria-labelledby="document-next-up"]`  document-guide.tsx (the
 *     RedLetterZone/DocumentGuide branch is mutually exclusive per page.tsx)
 *   - `[aria-label="Document letterhead actions"]`  letterhead-instruments.tsx
 *     DocumentActionGroup — matches directly, no fallback needed in practice
 *   - `[data-index-region="approvals"]`  project-approval-document.tsx (folded
 *     div or unfolded section; project docs only — null on the proposal)
 *   - `section[aria-label="Schedule frame"]`  schedule-rule-region.tsx
 *     (project docs only — the component returns null off engagementKind)
 *   - `[data-region-head]`             region-head.tsx (`data-region-head`
 *     is a DIV *inside* a `section`/`[data-index-region]` ancestor, not the
 *     section itself — gap math walks up to that ancestor)
 *   - `[data-document-spine]`          doc-spine.tsx (`> ul` is the 7-marker
 *     StrataMark row)
 *   - `[data-margin-panel]` + `data-margin-mode`  margin-rail.tsx (no
 *     `[data-margin-item]` exists in source; margin chips are `.doc-elevated`
 *     inside the panel — margin-item.tsx)
 *   - `[aria-label="Studio drawer"]`   studio-drawer.tsx (fixed bottom nav,
 *     hidden below 1180px)
 *   - `[aria-label="Document bar"]`    mobile-bar.tsx (fixed bottom bar,
 *     hidden at/above 1180px — the 390px chrome)
 *   - `--doc-seam-height`              job-ticket.tsx publishes this on
 *     `document.documentElement`; read via getComputedStyle on
 *     `[data-document-shell]` per the brief (inherits from :root)
 *
 * DOM order on `page.tsx` (confirmed by source read, not assumed): letterhead
 * -> job ticket (unless a table is on the paper) -> RedLetterZone|
 * DocumentGuide -> LetterheadInstruments(+FolioLetterhead) ->
 * MobileMarginChips -> ProjectApprovalDocumentMount -> ScheduleRuleRegion ->
 * `[data-active-section]` (SectionStageLineMount, TableFrame, region heads).
 *
 * Run from apps/designer-portal so @playwright/test resolves:
 *   node ../../artifacts/document-lens-proposal-2026-08-28/research/measure-layout.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = '/Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28';
mkdirSync(path.join(PROGRAM, 'research'), { recursive: true });

const BASE = 'http://localhost:3000';
const LADDER = JSON.parse(readFileSync(path.join(__dirname, 'state-ladder.json'), 'utf8'));
const R = LADDER.rungs;

const TEST_EMAIL = process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev';
const TEST_PASSWORD = process.env.DESIGNER_E2E_PASSWORD ?? 'password123';

const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

/** Ported from apps/designer-portal/e2e/helpers/hide-dev-overlays.ts —
 *  suppresses the TanStack Query Devtools floating toggle, which production
 *  never renders and which can otherwise sit inside a measured rect. */
async function hideDevOverlaysInit(page) {
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

/** Ported from apps/designer-portal/e2e/fixtures/auth.ts's setupAuthentication
 *  + the WELCOME_SHOWN_KEY init-script. */
async function signIn(page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
  }, WELCOME_SHOWN_KEY);

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
}

const VIEWPORTS = [
  { key: '1440', width: 1440, height: 900, isMobile: false, includeSpine: true },
  { key: '1280', width: 1280, height: 900, isMobile: false, includeSpine: true },
  { key: '390', width: 390, height: 844, isMobile: true, includeSpine: false },
];

const DOCS = [
  { key: 'rich', id: R.rich.doc_id, name: R.rich.name },
  { key: 'prework', id: R.prework.doc_id, name: R.prework.name },
];

/** In-page measurement — everything below runs inside the browser. */
function inPageMeasure(cfg) {
  const { includeSpine, isS0 } = cfg;

  function rect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x * 100) / 100,
      y: Math.round(r.y * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // ── 1. Header stack ──
  const letterheadEl = document.querySelector('#document-project-status');
  const ticketEl = document.querySelector('[data-job-ticket]');
  const needsAttnEl = document.querySelector('[aria-label="Needs attention"]');
  const guideEl = document.querySelector('section[aria-labelledby="document-next-up"]');
  const guideOrAttnEl = needsAttnEl || guideEl;
  const guideOrAttnKind = needsAttnEl ? 'needs-attention' : guideEl ? 'document-guide' : null;

  let instrumentsEl = document.querySelector('[aria-label="Document letterhead actions"]');
  let instrumentsSelector = '[aria-label="Document letterhead actions"]';
  if (!instrumentsEl) {
    const candidates = Array.from(
      document.querySelectorAll('[data-action-region], [role="group"]'),
    );
    instrumentsEl =
      candidates.find(
        (g) =>
          letterheadEl &&
          (letterheadEl.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      ) ?? null;
    instrumentsSelector = 'fallback: first [data-action-region]/[role=group] after letterhead';
  }

  const approvalsEl = document.querySelector('[data-index-region="approvals"]');
  const scheduleFrameEl = document.querySelector('section[aria-label="Schedule frame"]');

  const regionHeadEls = Array.from(document.querySelectorAll('[data-region-head]'));
  const firstRegionHeadEl = regionHeadEls[0] ?? null;

  const ticketRowSelector = '[data-job-ticket] [data-ticket-row]';
  const ticketRowCount = document.querySelectorAll(ticketRowSelector).length;

  const shellEl = document.querySelector('[data-document-shell]');
  const seamHeightRaw = shellEl
    ? getComputedStyle(shellEl).getPropertyValue('--doc-seam-height').trim()
    : '';

  const firstRegionHeadY = firstRegionHeadEl ? rect(firstRegionHeadEl).y : null;
  const headerStackPctOfViewport = firstRegionHeadY !== null ? firstRegionHeadY / vh : null;

  const headerStack = {
    letterhead: rect(letterheadEl),
    ticket: ticketEl
      ? {
          rect: rect(ticketEl),
          dataUnfolded: ticketEl.getAttribute('data-unfolded'),
          dataPinned: ticketEl.getAttribute('data-pinned'),
          position: getComputedStyle(ticketEl).position,
        }
      : null,
    guideOrAttn: { kind: guideOrAttnKind, rect: rect(guideOrAttnEl) },
    instruments: { selector: instrumentsSelector, rect: rect(instrumentsEl) },
    approvals: rect(approvalsEl),
    scheduleFrame: rect(scheduleFrameEl),
    firstRegionHead: firstRegionHeadEl
      ? { key: firstRegionHeadEl.getAttribute('data-region-head'), rect: rect(firstRegionHeadEl) }
      : null,
    firstRegionHeadY,
    headerStackPctOfViewport,
    ticketRowSelector,
    ticketRowCount,
    seamHeightRaw,
  };

  // ── 2. Spine utilisation ──
  let spine = null;
  if (includeSpine) {
    const spineEl = document.querySelector('[data-document-spine]');
    if (!spineEl) {
      spine = { present: false };
    } else {
      const spineRect = rect(spineEl);
      const descendants = Array.from(spineEl.querySelectorAll('*'));
      const inkRanges = [];
      let interactiveCount = 0;
      const labels = new Set();
      for (const el of descendants) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) continue;

        const ownText = (el.textContent || '').trim();
        const bg = cs.backgroundColor;
        const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
        const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some((side) => {
          const w = parseFloat(cs[`border${side}Width`]);
          const st = cs[`border${side}Style`];
          return w > 0 && st !== 'none';
        });
        if (ownText.length > 0 || hasBg || hasBorder) {
          inkRanges.push([r.top, r.bottom]);
        }
        // Direct-text labels (not container text) for the 1440-vs-1280 diff.
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
            labels.add(node.textContent.trim());
          }
        }
        if (el.matches('a, button, [role="button"], input')) interactiveCount++;
      }
      inkRanges.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const [s, e] of inkRanges) {
        if (merged.length && s <= merged[merged.length - 1][1]) {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
        } else {
          merged.push([s, e]);
        }
      }
      const inkPx = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
      const railHeightPx = spineRect.height;
      const inkPct = railHeightPx > 0 ? inkPx / railHeightPx : null;

      let longestEmptyRun = { px: 0, from: null, to: null };
      let cursor = spineRect.top;
      for (const [s, e] of merged) {
        if (s > cursor) {
          const gap = s - cursor;
          if (gap > longestEmptyRun.px) longestEmptyRun = { px: gap, from: cursor, to: s };
        }
        cursor = Math.max(cursor, e);
      }
      if (spineRect.bottom > cursor) {
        const gap = spineRect.bottom - cursor;
        if (gap > longestEmptyRun.px)
          longestEmptyRun = { px: gap, from: cursor, to: spineRect.bottom };
      }

      const markerRowEl = spineEl.querySelector(':scope > ul');
      spine = {
        present: true,
        spineRect,
        inkPx,
        railHeightPx,
        inkPct,
        longestEmptyRun,
        interactiveCount,
        markerRowRect: rect(markerRowEl),
        textLabels: Array.from(labels).sort(),
      };
    }
  }

  // ── 3. Inter-region gaps ──
  function containerOf(headEl) {
    let node = headEl.parentElement;
    while (node) {
      if (
        (node.tagName === 'SECTION' || node.hasAttribute('data-index-region')) &&
        node !== headEl
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return headEl; // fallback: the head itself
  }

  const headerOrder = [
    letterheadEl,
    ticketEl,
    guideOrAttnEl,
    instrumentsEl,
    approvalsEl,
    scheduleFrameEl,
  ].filter(Boolean);
  const lastHeaderEl = headerOrder.length ? headerOrder[headerOrder.length - 1] : null;

  const gaps = [];
  if (lastHeaderEl && firstRegionHeadEl) {
    gaps.push({
      from: 'header-stack-end',
      to: firstRegionHeadEl.getAttribute('data-region-head'),
      px: firstRegionHeadEl.getBoundingClientRect().top - lastHeaderEl.getBoundingClientRect().bottom,
    });
  }
  for (let i = 0; i < regionHeadEls.length - 1; i++) {
    const a = regionHeadEls[i];
    const b = regionHeadEls[i + 1];
    const aContainer = containerOf(a);
    gaps.push({
      from: a.getAttribute('data-region-head'),
      to: b.getAttribute('data-region-head'),
      px: b.getBoundingClientRect().top - aContainer.getBoundingClientRect().bottom,
    });
  }
  const distinctGaps = Array.from(new Set(gaps.map((g) => Math.round(g.px)))).sort(
    (a, b) => a - b,
  );

  // ── 4. Margin rail ──
  const marginPanelEl = document.querySelector('[data-margin-panel]');
  let margin = null;
  if (marginPanelEl) {
    let chipSelector = '[data-margin-panel] [data-margin-item]';
    let chipEls = Array.from(document.querySelectorAll(chipSelector));
    if (chipEls.length === 0) {
      chipSelector = '[data-margin-panel] .doc-elevated';
      chipEls = Array.from(document.querySelectorAll(chipSelector));
    }
    const chipHeights = chipEls.map((c) => rect(c).height);
    const chipStackPx = chipHeights.reduce((a, b) => a + b, 0);
    const panelRect = rect(marginPanelEl);
    const cs = getComputedStyle(marginPanelEl);
    margin = {
      panelRect,
      dataMarginMode: marginPanelEl.getAttribute('data-margin-mode'),
      display: cs.display,
      onCanvas: panelRect.right > 0 && panelRect.left < vw,
      chipSelector,
      chipCount: chipEls.length,
      chipHeights,
      chipStackPx,
      chipStackPctOfRail: panelRect.height > 0 ? chipStackPx / panelRect.height : null,
      noteComposerPresent: !!document.querySelector(
        '[data-margin-panel] textarea[aria-label="Note body"]',
      ),
    };
  } else {
    margin = { present: false };
  }

  // ── 5. Frame budget (row-bucket over the viewport) ──
  function clippedRect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const top = Math.max(0, r.top);
    const bottom = Math.min(vh, r.bottom);
    if (bottom <= top) return null;
    return { top, bottom };
  }

  const studioDrawerEl = document.querySelector('[aria-label="Studio drawer"]');
  const mobileBarEl = document.querySelector('[aria-label="Document bar"]');

  const chromeRects = [];
  for (const el of [studioDrawerEl, mobileBarEl]) {
    const cr = clippedRect(el);
    if (cr) chromeRects.push(cr);
  }
  // The pinned ticket's collapsed seam is chrome (never carries task content)
  // ONLY while pinned+collapsed; while unfolded it is header/summary content.
  const ticketPinned = ticketEl?.getAttribute('data-pinned') === 'true';
  const ticketUnfolded = ticketEl?.getAttribute('data-unfolded') === 'true';
  if (ticketEl && ticketPinned && !ticketUnfolded) {
    const cr = clippedRect(ticketEl);
    if (cr) chromeRects.push(cr);
  }

  const headerSummaryRects = [];
  for (const el of [letterheadEl, guideOrAttnEl, instrumentsEl]) {
    const cr = clippedRect(el);
    if (cr) headerSummaryRects.push(cr);
  }
  if (ticketEl && !(ticketPinned && !ticketUnfolded)) {
    const cr = clippedRect(ticketEl);
    if (cr) headerSummaryRects.push(cr);
  }

  const activeSectionEl = document.querySelector('[data-active-section]');
  const activeRects = [];
  {
    const cr = clippedRect(activeSectionEl);
    if (cr) activeRects.push(cr);
  }

  const buckets = [
    { name: 'chrome', rects: chromeRects },
    { name: 'headerSummary', rects: headerSummaryRects },
    { name: 'activeRegion', rects: activeRects },
  ];
  const rowBucket = new Int8Array(Math.max(0, Math.ceil(vh))).fill(-1);
  buckets.forEach((bucket, bi) => {
    for (const r of bucket.rects) {
      const top = Math.max(0, Math.floor(r.top));
      const bottom = Math.min(vh, Math.ceil(r.bottom));
      for (let y = top; y < bottom; y++) {
        if (rowBucket[y] === -1) rowBucket[y] = bi;
      }
    }
  });
  const counts = buckets.map(() => 0);
  let otherCount = 0;
  for (let y = 0; y < rowBucket.length; y++) {
    if (rowBucket[y] === -1) otherCount++;
    else counts[rowBucket[y]]++;
  }
  const spineColEl = document.querySelector('[data-document-spine]');
  const spineColRect = spineColEl ? rect(spineColEl) : null;
  const railWidthPx =
    spineColRect && getComputedStyle(spineColEl).display !== 'none' ? spineColRect.width : 0;

  const frameBudget = {
    railWidthPx,
    railWidthPctOfViewport: railWidthPx / vw,
    chromePx: counts[0],
    chromePct: counts[0] / vh,
    headerSummaryPx: counts[1],
    headerSummaryPct: counts[1] / vh,
    activeRegionPx: counts[2],
    activeRegionPct: counts[2] / vh,
    otherPx: otherCount,
    otherPct: otherCount / vh,
    viewportHeight: vh,
    viewportWidth: vw,
  };

  const result = {
    viewport: { width: vw, height: vh },
    scrollY: window.scrollY,
    // Top-level aliases (also nested under headerStack) — the program's gate
    // command reads these two flat off the per-state object.
    headerStackPctOfViewport,
    firstRegionHeadY,
    headerStack,
    spine,
    gaps,
    distinctGaps,
    margin,
    frameBudget,
  };

  if (isS0) {
    result.s0Extra = {
      scrollHeight: document.documentElement.scrollHeight,
      regionHeadMap: Object.fromEntries(
        regionHeadEls.map((el) => [el.getAttribute('data-region-head'), rect(el).y]),
      ),
    };
  }

  return result;
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(400);
}

async function scrollTop(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(50);
}

const browser = await chromium.launch();
const results = {};
const notes = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await hideDevOverlaysInit(page);
  await signIn(page);

  for (const doc of DOCS) {
    results[doc.key] ??= {};
    results[doc.key][viewport.key] ??= {};

    await page.goto(`${BASE}/doc/${doc.id}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForSelector('[data-document-shell]', { timeout: 30_000 }).catch((err) => {
      notes.push(`${doc.key}/${viewport.key}: [data-document-shell] never appeared — ${err.message}`);
    });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await scrollTop(page);
    await settle(page);

    const cfg = { includeSpine: viewport.includeSpine };

    // s0
    await scrollTop(page);
    await settle(page);
    const s0 = await page.evaluate(inPageMeasure, { ...cfg, isS0: true });
    results[doc.key][viewport.key].s0 = s0;

    // s1: letterhead scrolled fully past.
    await scrollTop(page);
    const letterheadBottom = await page.evaluate(() => {
      const el = document.querySelector('#document-project-status');
      return el ? el.getBoundingClientRect().bottom : null;
    });
    if (letterheadBottom === null) {
      notes.push(`${doc.key}/${viewport.key}/s1: #document-project-status not found — skipped`);
    } else {
      await page.evaluate((bottom) => {
        window.scrollTo(0, bottom + window.scrollY + 1);
      }, letterheadBottom);
      await page.waitForTimeout(80);
      await settle(page);
      const s1 = await page.evaluate(inPageMeasure, { ...cfg, isS0: false });
      const stillVisible = await page.evaluate(() => {
        const el = document.querySelector('#document-project-status');
        return el ? el.getBoundingClientRect().bottom : null;
      });
      if (stillVisible !== null && stillVisible >= 0) {
        notes.push(
          `${doc.key}/${viewport.key}/s1: letterhead bottom=${stillVisible} (expected <0) — page may be shorter than the scroll target; recorded anyway`,
        );
      }
      results[doc.key][viewport.key].s1 = s1;
    }

    // s2: [data-region-head="ffe"] to top, then back up by the seam.
    const hasFfe = await page.evaluate(() => !!document.querySelector('[data-region-head="ffe"]'));
    if (!hasFfe) {
      notes.push(
        `${doc.key}/${viewport.key}/s2: no [data-region-head="ffe"] on this doc/section — skipped`,
      );
    } else {
      await scrollTop(page);
      await page.evaluate(() => {
        document
          .querySelector('[data-region-head="ffe"]')
          ?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
      await page.waitForTimeout(120); // let the ticket's IntersectionObserver settle the pin
      const seam = await page.evaluate(() => {
        const shell = document.querySelector('[data-document-shell]');
        const raw = shell
          ? getComputedStyle(shell).getPropertyValue('--doc-seam-height').trim()
          : '';
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : 0;
      });
      await page.evaluate((s) => window.scrollBy(0, -s), seam);
      await page.waitForTimeout(50);
      await settle(page);
      const s2 = await page.evaluate(inPageMeasure, { ...cfg, isS0: false });
      s2.__seamUsed = seam;
      results[doc.key][viewport.key].s2 = s2;
    }

    // s3: foot.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(80);
    await settle(page);
    const s3 = await page.evaluate(inPageMeasure, { ...cfg, isS0: false });
    results[doc.key][viewport.key].s3 = s3;

    console.log(`measured ${doc.key} @ ${viewport.key}`);
  }

  await context.close();
}

await browser.close();

const meta = {
  timestamp: new Date().toISOString(),
  base: BASE,
  ids: { rich: R.rich.doc_id, prework: R.prework.doc_id },
  names: { rich: R.rich.name, prework: R.prework.name },
  viewports: VIEWPORTS.map((v) => ({ key: v.key, width: v.width, height: v.height, isMobile: v.isMobile })),
  scrollStates: {
    s0: 'scrollY 0',
    s1: 'scrollTo(0, rect(#document-project-status).bottom + scrollY + 1) — letterhead scrolled past',
    s2: '[data-region-head="ffe"] scrolled to top, then scrollBy(0, -seam) where seam = --doc-seam-height on [data-document-shell]',
    s3: 'scrollTo(0, document.documentElement.scrollHeight) — foot',
  },
  selectors: {
    letterhead: '#document-project-status',
    jobTicket: '[data-job-ticket]',
    ticketRows: '[data-job-ticket] [data-ticket-row]',
    guideOrAttn: '[aria-label="Needs attention"] OR section[aria-labelledby="document-next-up"]',
    instruments: '[aria-label="Document letterhead actions"]',
    approvals: '[data-index-region="approvals"]',
    scheduleFrame: 'section[aria-label="Schedule frame"]',
    regionHead: '[data-region-head]',
    spine: '[data-document-spine]',
    spineMarkerRow: '[data-document-spine] > ul',
    marginPanel: '[data-margin-panel]',
    marginChip: '[data-margin-panel] [data-margin-item] (falls back to [data-margin-panel] .doc-elevated — no [data-margin-item] exists in source)',
    studioDrawer: '[aria-label="Studio drawer"]',
    mobileBar: '[aria-label="Document bar"]',
    activeSection: '[data-active-section]',
    seamVar: '--doc-seam-height (read on [data-document-shell], inherits from :root where job-ticket.tsx publishes it)',
  },
  skippedMeasurements: notes,
};

const output = { ...results, meta };
writeFileSync(
  path.join(PROGRAM, 'research/12-layout-measurements.json'),
  JSON.stringify(output, null, 2),
);
console.log('\nWrote research/12-layout-measurements.json');
console.log('Notes:', notes.length ? notes.join('\n') : '(none)');

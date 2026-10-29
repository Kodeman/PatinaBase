import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { adminDb } from '../helpers/supabase-admin';
import { psqlAsUserRow, psqlScalar } from '../helpers/psql';

/**
 * RC-7 E8 — X06 at 200% browser zoom. Zoom is emulated the way the existing
 * zoom-accessibility probes do it: the CSS viewport is halved and the device
 * scale factor doubled, which is what a 200% page zoom does to layout (CSS px
 * per physical px) in Chromium. "1280 at 200%" = 640×360 CSS at DSF 2; "390 at
 * 200%" = 195×422 CSS at DSF 2. Not CSS `zoom`.
 *
 * For each surface the probe walks every visible focusable control and records
 * those that sit outside the viewport horizontally or are partly clipped by an
 * overflow:hidden/clip ancestor, with a selector. It also records horizontal
 * scroll containers and the share of the viewport held by fixed/sticky chrome.
 * The numbers are evidence (rc7-e8.md); the test asserts only that each surface
 * opened at the zoomed size and the page itself does not scroll sideways.
 */

const JOB = 'f0180000-0000-4000-8000-000000000010';
const LIVING = 'f0180000-0000-4000-8000-000000000011';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const OUT = process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(__dirname, '../../test-results/round8');
const SHOTS = path.resolve(__dirname, '../../../../docs/design/designer-portal-round8/evidence/rc/visual-rc7');
const ZOOMS = [
  { label: '1280@200', viewport: { width: 640, height: 360 } },
  { label: '390@200', viewport: { width: 195, height: 422 } },
];
const rpc = (sql: string) => JSON.parse(psqlAsUserRow(DESIGNER, `SELECT to_jsonb(${sql})::text;`)[0]);
const results: Record<string, unknown> = {};

type Probe = {
  pageOverflowPx: number;
  controls: number;
  clipped: Array<{ selector: string; name: string; reason: string }>;
  scrollContainers: Array<{ selector: string; scrollWidth: number; clientWidth: number; keyboardReachable: boolean }>;
  chromeShare: number;
};

async function probe(page: Page, rootSelector: string): Promise<Probe> {
  return page.evaluate((selector) => {
    const describe = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${CSS.escape(el.id)}` : '';
      const data = [...el.attributes].filter((a) => a.name.startsWith('data-') && a.value.length < 40).slice(0, 2)
        .map((a) => `[${a.name}${a.value ? `="${a.value}"` : ''}]`).join('');
      const label = el.getAttribute('aria-label');
      return `${tag}${id}${data}${label ? `[aria-label="${label.slice(0, 40)}"]` : ''}`;
    };
    const root = document.querySelector(selector) ?? document.body;
    const vw = document.documentElement.clientWidth;
    const clipped: Array<{ selector: string; name: string; reason: string }> = [];
    const controls = [...root.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => (el as HTMLElement).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true)
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; });
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      let reason: string | null = null;
      if (r.left < -1 || r.right > vw + 1) reason = `outside viewport x ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`;
      for (let a = el.parentElement; a && !reason && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(hidden|clip)/.test(cs.overflowX) || /(hidden|clip)/.test(cs.overflowY)) {
          const ar = a.getBoundingClientRect();
          const w = Math.max(0, Math.min(r.right, ar.right) - Math.max(r.left, ar.left));
          const h = Math.max(0, Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top));
          const share = (w * h) / (r.width * r.height);
          // Fully clipped = intentionally hidden (collapsed, sr-only); partly = cut off.
          if (share > 0 && share < 0.98) reason = `${Math.round(share * 100)}% visible inside ${describe(a)}`;
        }
      }
      if (reason) clipped.push({ selector: describe(el), name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50), reason });
    }
    const scrollContainers = [...root.querySelectorAll('*')]
      .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1)
      .map((el) => ({
        selector: describe(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        keyboardReachable: el.matches('[tabindex]:not([tabindex="-1"])') || !!el.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      }));
    let chrome = 0;
    for (const el of document.querySelectorAll('body *')) {
      const position = getComputedStyle(el).position;
      if (position !== 'fixed' && position !== 'sticky') continue;
      if (el.parentElement && ['fixed', 'sticky'].includes(getComputedStyle(el.parentElement).position)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.5) continue;
      const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      if (bottom > top) chrome += bottom - top;
    }
    return {
      pageOverflowPx: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - vw,
      controls: controls.length,
      clipped,
      scrollContainers,
      chromeShare: Math.round((Math.min(chrome, innerHeight) / innerHeight) * 100) / 100,
    };
  }, rootSelector);
}

async function settleJob(page: Page, search = '') {
  await page.goto('about:blank');
  await page.goto(`/doc/${JOB}${search}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('[data-document-shell][data-paper-renderer="round8"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-document-shell][data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
}

async function record(page: Page, key: string, rootSelector: string, shotTarget?: string) {
  const project = test.info().project.name;
  const result = await probe(page, rootSelector);
  results[`${project} ${key}`] = result;
  mkdirSync(SHOTS, { recursive: true });
  const options = { path: path.join(SHOTS, `${project}-zoom-${key.replace('@', 'at').replace(/[^a-z0-9]+/gi, '-')}.jpg`), type: 'jpeg' as const, quality: 60, animations: 'disabled' as const };
  if (shotTarget) await page.locator(shotTarget).first().screenshot(options);
  else await page.screenshot(options);
  console.log('[rc7-e8 zoom]', project, key, JSON.stringify({ overflow: result.pageOverflowPx, controls: result.controls,
    clipped: result.clipped.length, scroll: result.scrollContainers.length, chrome: result.chromeShare }));
  return result;
}

let issueEntryText = '';

test.describe('RC-7 E8 X06 200% zoom', () => {
  test.setTimeout(300_000);

  test.beforeAll(async ({}, info) => {
    // One filed, issued private print for the drawing/evidence viewer.
    const stamp = Date.now();
    const prefix = `${JOB}/plans/rc7-e8-${info.project.name}-${stamp}`;
    const bytes = readFileSync(path.resolve(__dirname, '../fixtures/whitlock-set.pdf'));
    const { error } = await adminDb.storage.from('project-documents').upload(`${prefix}.pdf`, bytes, { contentType: 'application/pdf' });
    if (error) throw error;
    rpc(`public.file_plan_prints('${JOB}', '${prefix}-file', '${JSON.stringify([{
      kind: 'new_sheet',
      sheet: { number: `E8-${info.project.name}-${stamp}`, title: 'RC7-E8 zoom evidence plan with a deliberately long sheet title' },
      print: { storage_path: `${prefix}.pdf`, sha256: createHash('sha256').update(bytes).digest('hex'), size_bytes: bytes.length },
    }])}'::jsonb)`);
    issueEntryText = `E8 zoom ${info.project.name} ${stamp}`;
    rpc(`public.create_plan_issue('${JOB}', '${issueEntryText}', '${prefix}-issue')`);
  });

  test.afterAll(() => {
    mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `rc7-e8-zoom-${test.info().project.name}.json`);
    let prior = {};
    try { prior = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first worker */ }
    writeFileSync(file, JSON.stringify({ ...prior, ...results }, null, 2));
  });

  for (const zoom of ZOOMS) {
    test.describe(`${zoom.label}`, () => {
      test.use({ viewport: zoom.viewport, deviceScaleFactor: 2 });

      test(`${zoom.label}: long content — the whole job paper`, async ({ authenticatedPage: page }) => {
        await settleJob(page);
        expect(page.viewportSize()).toEqual(zoom.viewport);
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(150, innerHeight * 0.8)) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 80));
          }
          window.scrollTo(0, 0);
        });
        const result = await record(page, `${zoom.label} job paper`, '[data-document-shell]');
        expect(result.pageOverflowPx, 'no sideways page scroll').toBeLessThanOrEqual(1);
      });

      test(`${zoom.label}: FF&E table (Specifications, a line open)`, async ({ authenticatedPage: page }) => {
        const line = psqlScalar(`SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${LIVING}' ORDER BY name LIMIT 1;`);
        await settleJob(page, `?unfold=pieces&lens=spec&room=${LIVING}&line=${line}`);
        const sheet = page.locator('[data-paper-chapter="ffe"] [data-unfold-instrument="pieces"]');
        await expect(sheet.getByTestId('spec-lens')).toBeVisible({ timeout: 60_000 });
        await expect(sheet.getByTestId('spec-fields-pane')).toBeVisible({ timeout: 30_000 });
        await sheet.getByTestId('spec-fields-pane').scrollIntoViewIfNeeded();
        await record(page, `${zoom.label} ffe spec`, '[data-unfold-instrument="pieces"]');
        // The rough lens: the widest FF&E table (min-width 640px) on a wide
        // viewport; rough-in-table.tsx switches to its phone list when narrow.
        await settleJob(page, `?unfold=pieces&lens=rough&room=${LIVING}`);
        const roomSheet = sheet.getByRole('region', { name: 'Living Room' });
        await expect(roomSheet).toBeVisible({ timeout: 60_000 });
        await roomSheet.scrollIntoViewIfNeeded();
        const form = (await roomSheet.locator('table').count()) > 0 ? 'table' : 'list';
        const result = await record(page, `${zoom.label} ffe rough ${form}`, '[data-unfold-instrument="pieces"]');
        expect(result.pageOverflowPx, 'no sideways page scroll').toBeLessThanOrEqual(1);
      });

      test(`${zoom.label}: drawing/evidence viewer`, async ({ authenticatedPage: page }) => {
        await settleJob(page);
        const history = page.getByRole('region', { name: 'Issued print history' });
        await history.scrollIntoViewIfNeeded();
        const entry = history.locator('details').filter({ hasText: issueEntryText }).first();
        await entry.locator('summary').click();
        const opener = entry.getByRole('button', { name: 'Open issued print' }).first();
        await opener.scrollIntoViewIfNeeded();
        await record(page, `${zoom.label} drawing history`, '[aria-label="Issued print history"]');
        await opener.click();
        const viewer = page.getByRole('dialog');
        await expect(viewer).toBeVisible({ timeout: 30_000 });
        await expect(viewer.locator('iframe, object, embed, img').first()).toBeAttached({ timeout: 30_000 });
        // Let the dialog's entrance finish before probing and capturing it.
        await expect.poll(() => viewer.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)).toBe(0);
        await page.waitForTimeout(300);
        const result = await record(page, `${zoom.label} viewer`, '[role="dialog"]');
        const back = viewer.getByRole('button', { name: 'Back to the document', exact: true });
        await expect(back).toBeVisible();
        expect(result.pageOverflowPx, 'no sideways page scroll').toBeLessThanOrEqual(1);
      });
    });
  }
});

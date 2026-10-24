import { test, expect } from '../fixtures/auth';
import type { Page, Request } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { psqlRun, psqlScalar } from '../helpers/psql';

const F01 = 'f0180000-0000-4000-8000-000000000010';
const LIVING = 'f0180000-0000-4000-8000-000000000011';
const fixture = readFileSync(path.join(__dirname, 'scale-profile-fixture.sql'), 'utf8');
const evidence = process.env.PLAYWRIGHT_OUTPUT_DIR;
if (!evidence || !path.isAbsolute(evidence)) throw new Error('An absolute external PLAYWRIGHT_OUTPUT_DIR is required');
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_DB_URL']) {
  const url = process.env[key] ?? (key === 'SUPABASE_DB_URL' ? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' : '');
  if (new URL(url).hostname !== '127.0.0.1') throw new Error('Scale fixture requires loopback');
}
const sheet = (page: Page) => page.locator('[data-unfold-instrument="pieces"]');
const pane = (page: Page) => sheet(page).getByTestId('spec-fields-pane');
const lineControl = (page: Page, id: string) => sheet(page).getByTestId('spec-lens').locator(`[data-line-id="${id}"] > button`);
const quantiles = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, p50: sorted[Math.max(0, Math.ceil(sorted.length * .5) - 1)] ?? null,
    p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? null };
};

function capture(page: Page) {
  let phase = 'cold';
  let last = Date.now();
  const active = new Set<Request>();
  const readinessPeak: Record<string, number> = {};
  const pending = new Set<Promise<void>>();
  const records: Array<Record<string, unknown>> = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:54321') return;
    active.add(request); last = Date.now();
    const readiness = [...active].filter(r => new URL(r.url()).pathname.endsWith('/rpc/get_project_ffe_readiness')).length;
    readinessPeak[phase] = Math.max(readinessPeak[phase] ?? 0, readiness);
  });
  page.on('requestfailed', request => {
    active.delete(request); last = Date.now();
    records.push({ phase, url: request.url(), failure: request.failure()?.errorText });
  });
  page.on('response', response => {
    const request = response.request();
    const url = new URL(response.url());
    if (url.origin !== 'http://127.0.0.1:54321') return;
    const atPhase = phase;
    const work = (async () => {
      let bytes = 0;
      let rows: number | null = null;
      let bodyError: string | null = null;
      try {
        const body = await response.body(); bytes = body.length;
        const json = JSON.parse(body.toString());
        if (Array.isArray(json)) rows = json.length;
      } catch (error) { bodyError = String(error); }
      records.push({ phase: atPhase, endpoint: url.pathname, method: request.method(), status: response.status(),
        bytes, rows, bodyError, durationMs: request.timing().responseEnd,
        requestUrlBytes: Buffer.byteLength(request.url()), requestBodyBytes: Buffer.byteLength(request.postData() ?? '') });
      active.delete(request); last = Date.now();
    })();
    pending.add(work); void work.finally(() => pending.delete(work));
  });
  return {
    records, readinessPeak,
    setPhase(next: string) { phase = next; },
    async idle() {
      await expect.poll(() => active.size === 0 && Date.now() - last > 500,
        { timeout: 180_000, intervals: [100, 250, 500], message: 'native loopback requests finish' }).toBe(true);
      await Promise.all([...pending]);
    },
  };
}

async function dom(page: Page) {
  return page.evaluate(() => ({ nodes: document.querySelectorAll('*').length,
    mountedSpecRows: document.querySelectorAll('[data-testid="spec-lens"] [data-line-id]').length,
    images: document.images.length,
    resources: performance.getEntriesByType('resource').map(entry => {
      const row = entry as PerformanceResourceTiming;
      return { url: row.name, type: row.initiatorType, transferBytes: row.transferSize, encodedBytes: row.encodedBodySize };
    }),
    vitals: (window as any).__scaleVitals,
  }));
}

async function chooseRoom(page: Page, name: string) {
  const rail = sheet(page).getByRole('navigation', { name: 'Rooms', exact: true });
  if (await rail.isVisible()) await rail.getByRole('link', { name, exact: false }).first().click();
  else {
    await sheet(page).locator('[data-build-room-picker] > button').click();
    await sheet(page).getByRole('navigation', { name: 'Choose a room' }).getByRole('link', { name, exact: false }).first().click();
  }
}

test.describe('C00 native baseline scale profile', () => {
  test.setTimeout(480_000);
  test.beforeAll(() => {
    psqlRun(fixture);
    console.log('[scale readback]', psqlScalar(`SELECT json_agg(x) FROM (
      SELECT project_id,count(*) AS lines,count(DISTINCT project_room_id) AS rooms FROM project_ffe_items
      WHERE project_id::text LIKE 'e6591000-%' GROUP BY project_id) x;`));
  });
  test.afterAll(() => {
    psqlRun(`SET patina.scale_cleanup='on';\n${fixture}`);
    const residue = psqlScalar(`SELECT (SELECT count(*) FROM projects WHERE id::text LIKE 'e6591000-%') +
      (SELECT count(*) FROM project_ffe_items WHERE project_id::text LIKE 'e6591000-%') +
      (SELECT count(*) FROM project_rooms WHERE project_id::text LIKE 'e6591000-%') +
      (SELECT count(*) FROM project_ffe_command_idempotency WHERE actor_id='f0180000-0000-4000-8000-000000000002' AND idempotency_key LIKE 'sq1975-%');`);
    console.log('[scale residue]', residue);
    expect(residue, 'all scale project/room/line rows removed').toBe('0');
  });
  for (const size of [36, 80, 500, 2000]) {
    test(`${size} lines: native requests, DOM, edit/filter/return`, async ({ authenticatedPage: page }, info) => {
      const job = size <= 80 ? F01 : `e6591000-0000-4000-8000-${String(size).padStart(12, '0')}`;
      const room = size === 36 ? LIVING : null;
      const roomName = size <= 80 ? 'Living Room' : 'SQ-1975 Room 01';
      const item = JSON.parse(psqlScalar(`SELECT row_to_json(x) FROM (
        SELECT id,name,project_room_id FROM project_ffe_items WHERE project_id='${job}'
        ${room ? `AND project_room_id='${room}'` : ''} ORDER BY name LIMIT 1) x;`));
      const dbLines = Number(psqlScalar(`SELECT count(*) FROM project_ffe_items WHERE project_id='${job}' AND removed_at IS NULL;`));
      expect(dbLines).toBe(size <= 80 ? 80 : size);
      await page.goto('about:blank');
      await page.addInitScript(() => {
        const values = { cls: null as number | null, lcpMs: null as number | null, supported: PerformanceObserver.supportedEntryTypes };
        (window as any).__scaleVitals = values;
        if (values.supported.includes('layout-shift')) {
          values.cls = 0;
          // CLS session windows, not a page-lifetime sum. Never include recent-input shifts.
          let start = 0, previous = 0, score = 0;
          new PerformanceObserver(list => list.getEntries().forEach((entry: any) => {
            if (entry.hadRecentInput) return;
            if (entry.startTime - previous > 1000 || entry.startTime - start > 5000) { start = entry.startTime; score = 0; }
            previous = entry.startTime; score += entry.value; values.cls = Math.max(values.cls ?? 0, score);
          })).observe({ type: 'layout-shift', buffered: true });
        }
        if (values.supported.includes('largest-contentful-paint')) new PerformanceObserver(list => {
          values.lcpMs = list.getEntries().at(-1)?.startTime ?? null;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      const network = capture(page);
      const report: Record<string, any> = { size, dbLines, roomSubset: room, candidate: process.env.SCALE_CANDIDATE,
        profile: { browser: info.project.name, viewport: page.viewportSize(), platform: os.platform(), release: os.release(),
          cpu: os.cpus()[0]?.model, network: 'unthrottled localhost; no CPU throttling; next dev --webpack; compiled routes warmed by native setup',
          cold: 'fresh document/React Query cache after authenticated desk; browser HTTP cache not forcibly cleared',
          warm: 'same-document fold/reopen; native cache policies unchanged' }, samples: {}, failures: [] };
      const start = performance.now();
      try {
        await page.goto(`/doc/${job}?unfold=pieces&lens=spec${room ? `&room=${room}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
        await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
        await expect(sheet(page).getByTestId('spec-lens')).toBeVisible({ timeout: 60_000 });
        await network.idle();
        report.samples.cold = { readyMs: performance.now() - start, ...await dom(page) };
        // Measure rendering separately from server completeness; the 2,000-row case may expose truncation.
        const visible = await sheet(page).getByTestId('spec-lens').locator('[data-line-id]').count();
        report.expectedMountedRows = size;
        report.actualMountedRows = visible;
        if (visible !== size) report.failures.push(`Expected ${size} mounted lines; native view returned ${visible}`);

        network.setPhase('interactions');
        const latencies: number[] = [];
        const peerId = psqlScalar(`SELECT id FROM project_ffe_items WHERE project_id='${job}'
          AND project_room_id='${item.project_room_id}' AND id<>'${item.id}' ORDER BY name LIMIT 1;`);
        for (const id of [item.id, peerId, item.id]) {
          const at = performance.now(); await lineControl(page, id).click();
          await expect.poll(() => new URL(page.url()).searchParams.get('line')).toBe(id);
          await expect(lineControl(page, id)).toHaveAttribute('aria-current', 'true');
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          latencies.push(performance.now() - at);
        }
        report.selectionMs = quantiles(latencies);
        const value = `SQ1975 ${size} ${info.project.name}`;
        const finish = pane(page).getByRole('textbox', { name: 'Finish', exact: true });
        const at = performance.now();
        await finish.fill(value); await finish.press('Enter');
        await expect.poll(() => psqlScalar(`SELECT finish FROM project_ffe_specs WHERE ffe_item_id='${item.id}';`),
          { timeout: 30_000, message: 'stable-ID finish persisted in native DB' }).toBe(value);
        report.saveToDbMs = performance.now() - at;
        await network.idle();
        const filteredAt = performance.now();
        await chooseRoom(page, roomName);
        await expect.poll(() => new URL(page.url()).searchParams.get('room')).toBe(item.project_room_id);
        await expect(lineControl(page, item.id)).toBeAttached();
        report.filterMs = performance.now() - filteredAt;
        await lineControl(page, item.id).click();
        await expect(finish).toHaveValue(value);
        report.stableIdEditFilter = 'passed';
        await network.idle();
        network.setPhase('warm');
        const warmAt = performance.now();
        await sheet(page).getByRole('button', { name: /Return to the room/ }).click();
        await expect(sheet(page)).toHaveCount(0);
        const roomCard = page.locator(`[data-paper-chapter="ffe"] [data-pieces-room="${item.project_room_id}"]`);
        await roomCard.scrollIntoViewIfNeeded();
        const toggle = roomCard.getByRole('button', { name: new RegExp(roomName) });
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
        await roomCard.getByRole('link', { name: /Edit room selections/ }).click();
        await sheet(page).getByRole('button', { name: 'Specifications', exact: true }).click();
        await expect(sheet(page).getByTestId('spec-lens')).toBeVisible({ timeout: 30_000 });
        if (size !== 36) {
          const rail = sheet(page).getByRole('navigation', { name: 'Rooms', exact: true });
          if (await rail.isVisible()) await rail.getByRole('link', { name: 'All project rooms', exact: true }).click();
          else await chooseRoom(page, 'All project selections');
        }
        await network.idle();
        report.samples.warm = { readyMs: performance.now() - warmAt, ...await dom(page) };
        report.returnAndHistory = 'passed';
      } catch (error) {
        report.failures.push(String(error));
      } finally {
        report.network = network.records;
        report.readinessPeak = network.readinessPeak;
        report.rpcLatencyMs = quantiles(network.records.filter(r => String(r.endpoint).includes('/rpc/')).map(r => Number(r.durationMs)).filter(Number.isFinite));
        mkdirSync(evidence!, { recursive: true });
        writeFileSync(path.join(evidence!, `${info.project.name}-${size}.json`), JSON.stringify(report, null, 2));
        await info.attach(`scale-${size}`, { body: JSON.stringify(report), contentType: 'application/json' });
        console.log('[scale result]', JSON.stringify({ size, browser: info.project.name, failures: report.failures,
          rows: report.actualMountedRows, requests: network.records.length }));
      }
      expect(report.failures, 'native baseline completeness and stable-ID interaction checks').toEqual([]);
    });
  }
});

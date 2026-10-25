import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
import path from 'node:path';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f1985000-0000-4000-8000-000000000010';
const ROOM = 'f1985000-0000-4000-8000-000000000011';
const PRODUCT = 'f1985000-0000-4000-8000-000000000020';
const NAME = 'C04 Fictional Material Chair';
const source = `/doc/${JOB}?unfold=pieces&lens=rough&room=${ROOM}#ffe`;
const count = () => psqlScalar(`SELECT count(*) FROM public.project_ffe_items WHERE project_id='${JOB}' AND product_id='${PRODUCT}';`);

function cleanup() {
  psqlRun(`BEGIN;
    DO $$ BEGIN
      ASSERT NOT EXISTS (SELECT 1 FROM public.projects WHERE id='${JOB}' AND designer_id IS DISTINCT FROM 'f0180000-0000-4000-8000-000000000002'), 'refuse foreign C04 project';
      ASSERT NOT EXISTS (SELECT 1 FROM public.products WHERE id='${PRODUCT}' AND owner_user_id IS DISTINCT FROM 'f0180000-0000-4000-8000-000000000002'), 'refuse foreign C04 product';
    END $$;
    CREATE TEMP TABLE c04_items ON COMMIT DROP AS
      SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}';
    CREATE TEMP TABLE c04_configurations ON COMMIT DROP AS
      SELECT id FROM public.product_configurations WHERE product_id='${PRODUCT}';
    SELECT set_config('patina.configuration_spec_workflow', '00403', true);
    DELETE FROM public.product_configurations WHERE product_id='${PRODUCT}';
    -- These fictional items and their threads form a cycle. Replica skips cascades,
    -- so remove their preserved specs explicitly before deleting either side.
    SET LOCAL session_replication_role=replica;
    DELETE FROM public.project_ffe_specs WHERE ffe_item_id IN (SELECT id FROM c04_items);
    DELETE FROM public.project_ffe_selection_threads WHERE project_id='${JOB}';
    DELETE FROM public.project_ffe_items WHERE project_id='${JOB}';
    SET LOCAL session_replication_role=origin;
    DELETE FROM public.projects WHERE id='${JOB}';
    DELETE FROM public.products WHERE id='${PRODUCT}';
    DO $$ BEGIN
      ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_specs WHERE ffe_item_id IN (SELECT id FROM c04_items)), 'C04 specs remain';
      ASSERT NOT EXISTS (SELECT 1 FROM public.product_configurations WHERE id IN (SELECT id FROM c04_configurations)), 'C04 configurations remain';
      ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_selection_threads WHERE project_id='${JOB}'), 'C04 threads remain';
      ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE project_id='${JOB}'), 'C04 items remain';
      ASSERT NOT EXISTS (SELECT 1 FROM public.projects WHERE id='${JOB}'), 'C04 project remains';
      ASSERT NOT EXISTS (SELECT 1 FROM public.products WHERE id='${PRODUCT}'), 'C04 product remains';
    END $$;
    COMMIT;`);
}

test.describe('C04 configured placement', () => {
  test.setTimeout(240_000);
  test('named-room Library placement retries one native request and returns to one Spec line owner', async ({ authenticatedPage: page }, testInfo) => {
    expect(count(), 'fixture starts without a configured candidate').toBe('0');
    psqlRun(readFileSync(path.join(__dirname, 'configured-placement-fixture.sql'), 'utf8'));
    const requests: Record<string, unknown>[] = [];
    try {
      await expect(page.locator('[data-studio="round8"]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
      await page.goto(source, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
      await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
      const instrument = page.locator('[data-paper-chapter="ffe"] [data-unfold-instrument="pieces"]');
      const entry = instrument.getByRole('textbox', { name: 'New line in C04 Sitting Room', exact: true });
      await entry.scrollIntoViewIfNeeded();
      await entry.press('/');
      const inline = instrument.locator('[data-library-inline-search] input');
      await expect(inline).toBeFocused();
      await inline.fill('C04 Fictional');
      const libraryDoor = instrument.getByRole('option', { name: 'Search the Library for "C04 Fictional" →', exact: true });
      await libraryDoor.click();
      await expect(page).toHaveURL(/\/library\?/);
      const libraryUrl = new URL(page.url());
      expect(libraryUrl.searchParams.get('projectId')).toBe(JOB);
      expect(libraryUrl.searchParams.get('roomId')).toBe(ROOM);
      expect(libraryUrl.searchParams.get('returnTo')).toBe(source);
      const library = page.locator('[data-library-room]');
      await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
      // Visibility alone precedes hydration on the server-rendered Library.
      await expect(async () => {
        const all = library.getByRole('tab', { name: /^All shelves/ });
        await all.focus();
        await all.press('ArrowRight');
        await expect(library.getByRole('tab', { name: /^Personal,/ })).toHaveAttribute('aria-selected', 'true');
      }).toPass({ timeout: 30_000 });
      const reference = page.getByRole('link', { name: `View reference: ${NAME}`, exact: true });
      await expect(reference).toBeVisible({ timeout: 60_000 });
      await reference.click();
      await expect(page).toHaveURL(new RegExp(`/library/${PRODUCT}\\?`), { timeout: 60_000 });
      const configuration = page.locator('#piece-configuration');
      await expect(configuration).toHaveAttribute('data-configuration-mode', 'variant', { timeout: 60_000 });
      // The radio input is visually hidden; its label is the actual touch target.
      await configuration.locator('label').filter({ has: page.getByRole('radio', { name: /^Oak/ }) }).click();
      await configuration.getByRole('textbox', { name: 'Specification name', exact: true }).fill('C04 Sitting Room Oak');
      await configuration.getByRole('button', { name: 'Save specification', exact: true }).click();
      await expect.poll(() => psqlScalar(`SELECT count(*) FROM public.product_configurations WHERE product_id='${PRODUCT}' AND name='C04 Sitting Room Oak';`)).toBe('1');
      const configurationId = psqlScalar(`SELECT id FROM public.product_configurations WHERE product_id='${PRODUCT}' AND name='C04 Sitting Room Oak';`);
      await configuration.getByRole('button', { name: 'Add specified product to project', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: `Add “${NAME}” to a project`, exact: true });
      await expect(sheet).toBeVisible();
      let lost = false;
      await page.route('**/rest/v1/rpc/place_product_in_project_v2', async (route) => {
        const body = route.request().postDataJSON();
        const request = body.p_request;
        requests.push(request);
        const canonical = canonicalJson(body);
        const attempt = { rpc: 'place_product_in_project_v2', attempt: requests.length, idempotencyKey: request.idempotencyKey };
        console.log('[C04 browser request]', JSON.stringify({ ...attempt, body, canonical, sha256: createHash('sha256').update(canonical).digest('hex'), previousRequestEqual: requests.length > 1 ? canonicalJson(requests[0]) === canonicalJson(request) : null }));
        console.log('[C04 native attempt]', JSON.stringify({ ...attempt, transport: 'route.fetch reaches backend' }));
        const response = await route.fetch();
        console.log('[C04 native response]', JSON.stringify({ ...attempt, transport: 'route.fetch backend response', status: response.status(), body: (await response.text()).slice(0, 4000) }));
        expect(response.ok(), 'the real native placement commits before the response is lost').toBe(true);
        if (!lost) {
          lost = true;
          console.log('[C04 injected 503]', JSON.stringify({ ...attempt, afterRealBackendResponse: response.status(), transport: 'route.fulfill replaces route.fetch response' }));
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'C04 response lost after commit' }) });
        } else {
          await route.fulfill({ response });
        }
      });
      const place = sheet.getByRole('button', { name: /C04 Fictional Configuration House/ });
      await place.click();
      await expect(sheet.getByText('Could not add to that project.', { exact: true })).toBeVisible();
      expect(requests).toHaveLength(1);
      expect(count(), 'first native request committed exactly one row').toBe('1');
      await place.click();
      await expect(page).toHaveURL(new RegExp(`/doc/${JOB}\\?`), { timeout: 60_000 });
      expect(requests).toHaveLength(2);
      expect(requests[1]).toEqual(requests[0]);
      expect(requests[0]).toMatchObject({ projectId: JOB, roomId: ROOM, assignmentScope: 'room', configurationId, disposition: 'candidate', duplicateMode: 'reuse' });
      expect(requests[0].idempotencyKey).toBeTruthy();
      const row = JSON.parse(psqlScalar(`SELECT json_build_object('id',i.id,'room',i.project_room_id,'scope',i.assignment_scope,'disposition',i.design_disposition,'configuration',s.configuration_id,'snapshot',s.configuration_snapshot,'boards',(SELECT count(*) FROM public.proposal_board_items b WHERE b.project_ffe_item_id=i.id)) FROM public.project_ffe_items i JOIN public.project_ffe_specs s ON s.ffe_item_id=i.id WHERE i.project_id='${JOB}' AND i.product_id='${PRODUCT}';`));
      expect(row).toMatchObject({ room: ROOM, scope: 'room', disposition: 'candidate', configuration: configurationId, boards: 0 });
      expect(row.snapshot).toBeTruthy();
      const returned = new URL(page.url());
      expect(returned.searchParams.get('room')).toBe(ROOM);
      expect(returned.searchParams.get('lens')).toBe('spec');
      expect(returned.searchParams.get('line')).toBe(row.id);
      expect(returned.searchParams.has('ffeItemId')).toBe(false);
      expect(returned.searchParams.has('land')).toBe(false);
      const line = instrument.getByTestId('spec-lens').locator(`[data-line-id="${row.id}"] > button`);
      await expect(line).toHaveAttribute('aria-current', 'true', { timeout: 60_000 });
      await expect(line).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath('configured-line-return.png'), fullPage: true });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(line).toHaveAttribute('aria-current', 'true', { timeout: 60_000 });
      expect(count()).toBe('1');
      expect(requests).toHaveLength(2);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/library/${PRODUCT}`), { timeout: 60_000 });
      await expect(configuration).toHaveAttribute('data-configuration-mode', 'variant', { timeout: 60_000 });
      await page.goBack();
      await expect(page).toHaveURL(/\/library\?/);
      await expect(page.locator(`[data-library-card="${PRODUCT}"]`)).toContainText('Used on C04 Fictional Configuration House', { timeout: 60_000 });
      expect(count()).toBe('1');
      expect(requests).toHaveLength(2);
      console.log('[C04 native readback]', JSON.stringify({ ...row, snapshot: Boolean(row.snapshot), requests: requests.length, candidates: count(), boardContext: 'none; no pin invented' }));
    } finally {
      try {
        if (!page.isClosed()) await page.unroute('**/rest/v1/rpc/place_product_in_project_v2');
      } finally {
        cleanup();
        expect(count()).toBe('0');
        expect(psqlScalar(`SELECT count(*) FROM public.products WHERE id='${PRODUCT}';`)).toBe('0');
      }
    }
  });
});

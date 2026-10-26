import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { psqlRun, psqlScalar } from '../helpers/psql';

const JOB = 'f0180000-0000-4000-8000-000000000010';
const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const PREFIX = 'f0760000-0000-4000-8000-';
const id = (n: number) => `${PREFIX}${String(n).padStart(12, '0')}`;
const PO = id(2);
const LINE = id(3);
const ASSET = id(4);
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9z8AAAAASUVORK5CYII=';

function residue() {
  return psqlScalar(`SELECT
    (SELECT count(*) FROM public.purchase_orders WHERE id::text LIKE '${PREFIX}%') +
    (SELECT count(*) FROM public.project_ffe_receipt_commands WHERE purchase_order_id='${PO}') +
    (SELECT count(*) FROM public.project_ffe_items WHERE id::text LIKE '${PREFIX}%') +
    (SELECT count(*) FROM public.vendors WHERE id::text LIKE '${PREFIX}%') +
    (SELECT count(*) FROM public.studio_locations WHERE id::text LIKE '${PREFIX}%') +
    (SELECT count(*) FROM public.project_ffe_specs WHERE ffe_item_id='${LINE}') +
    (SELECT count(*) FROM public.project_ffe_selection_threads WHERE primary_ffe_item_id='${LINE}') +
    (SELECT count(*) FROM svc_media.media_assets WHERE id::text LIKE '${PREFIX}%');`);
}

function seed() {
  expect(residue(), 'P02 namespace starts empty').toBe('0');
  psqlRun(`BEGIN; SET LOCAL statement_timeout = '5s';
    INSERT INTO public.studio_locations(id,organization_id,kind,label)
      SELECT '${id(5)}',studio_id,'receiver','P02 Fictional Receiver' FROM public.projects WHERE id='${JOB}';
    INSERT INTO public.vendors(id,name) VALUES ('${id(1)}','P02 Fictional Receiving Maker');
    INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition)
      VALUES ('${LINE}','${JOB}','P02 Fictional Chair','specified',4,'${id(1)}',100,'selected');
    INSERT INTO public.purchase_orders(id,designer_id,project_id,vendor_id,payment_pattern,total_cents,status,is_patina_catalog,po_number)
      VALUES ('${PO}','${DESIGNER}','${JOB}','${id(1)}','net_30',400,'shipped',false,'P02-RECEIPT');
    SELECT set_config('request.jwt.claims','{"sub":"${DESIGNER}","role":"authenticated"}',true);
    UPDATE public.project_ffe_items SET purchase_order_id='${PO}',status='ordered' WHERE id='${LINE}';
    COMMIT;`);
}

function cleanup() {
  psqlRun(`BEGIN; SET LOCAL statement_timeout = '5s';
    DELETE FROM public.procurement_exceptions WHERE purchase_order_id='${PO}' AND project_id='${JOB}';
    SET LOCAL session_replication_role=replica;
    DELETE FROM public.purchase_order_changes WHERE purchase_order_id='${PO}' AND project_id='${JOB}';
    SET LOCAL session_replication_role=origin;
    DELETE FROM public.damage_claims WHERE receiving_inspection_id IN
      (SELECT id FROM public.receiving_inspections WHERE purchase_order_id='${PO}');
    DELETE FROM public.project_ffe_receipt_commands WHERE purchase_order_id='${PO}';
    DELETE FROM public.receiving_inspections WHERE purchase_order_id='${PO}';
    SET LOCAL session_replication_role=replica;
    DELETE FROM public.project_ffe_specs WHERE ffe_item_id='${LINE}';
    DELETE FROM public.project_ffe_selection_threads WHERE primary_ffe_item_id='${LINE}' AND project_id='${JOB}';
    DELETE FROM public.project_ffe_items WHERE id='${LINE}' AND project_id='${JOB}';
    SET LOCAL session_replication_role=origin;
    DELETE FROM public.purchase_orders WHERE id='${PO}' AND project_id='${JOB}' AND designer_id='${DESIGNER}';
    DELETE FROM public.vendors WHERE id='${id(1)}' AND name='P02 Fictional Receiving Maker';
    DELETE FROM svc_media.media_assets WHERE id='${ASSET}' AND project_id='${JOB}';
    DELETE FROM public.studio_locations WHERE id='${id(5)}' AND label='P02 Fictional Receiver';
    COMMIT;`);
  expect(residue(), 'P02 fixture residue').toBe('0');
}

async function openReceiving(page: Page) {
  await expect(page.locator('[data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Studio search' });
  await palette.getByRole('combobox', { name: 'Studio search' }).fill('orders');
  await palette.getByRole('option', { name: 'Purchase orders ledger g o', exact: true }).click();
  const ledger = page.getByRole('dialog', { name: 'Purchase orders', exact: true });
  await ledger.getByRole('button', { name: 'Receiving', exact: true }).click();
  return ledger;
}

test.afterAll(() => {
  cleanup();
});

test('P02 partial damaged delivery preserves native receipt, photo, claim and replacement identities', async ({ authenticatedPage: page }, testInfo) => {
  test.setTimeout(240_000);
  try {
    seed();
    // Only the absent local media service is stood in, following phase2-member-walk.
    // Receiving, claim and remedy calls use the real local Supabase stack.
    await page.route('**/api/media/assets', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      psqlRun(`INSERT INTO svc_media.media_assets
        (id,kind,raw_key,status,scan_status,mime_type,permissions,tags,uploaded_by,project_id)
        VALUES ('${ASSET}','IMAGE','e2e/${ASSET}.png','READY','CLEAN','image/png',
          jsonb_build_object('projectId','${JOB}'),ARRAY['receiving'],'${DESIGNER}','${JOB}');`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { assetId: ASSET } }) });
    });
    await page.route(`**/api/media/assets/${ASSET}/download`, route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: { downloadUrl: `data:image/png;base64,${PNG}` } }),
    }));
    const ledger = await openReceiving(page);
    const queue = ledger.getByRole('listitem').filter({ hasText: 'P02-RECEIPT' });
    const opener = queue.getByRole('button', { name: 'Receive a delivery', exact: true });
    await ledger.evaluate(node => { node.tabIndex = -1; node.focus(); });
    await opener.evaluate(node => node.addEventListener('mousedown', event => event.preventDefault(), { once: true }));
    await opener.click();
    const receipt = page.getByRole('dialog', { name: 'Log inspection for P02-RECEIPT', exact: true });
    await expect(receipt).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(receipt).toHaveCount(0);
    await expect(opener, 'receipt returns to actual pointer opener without prefocus').toBeFocused();
    await opener.click();
    await receipt.getByLabel('Opened and checked?', { exact: true }).selectOption('yes');
    await receipt.getByLabel('Arrival location', { exact: true }).selectOption(id(5));
    await receipt.getByRole('spinbutton', { name: 'Received quantity for P02 Fictional Chair', exact: true }).fill('2');
    await receipt.getByLabel('Condition of P02 Fictional Chair', { exact: true }).selectOption('damaged');
    await receipt.getByLabel('Noted on the BOL', { exact: true }).check();
    await receipt.locator('input[type="file"]').setInputFiles({ name: 'p02-damage.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
    await expect(receipt.getByRole('list', { name: 'Photos to attach' }).getByRole('img', { name: 'p02-damage.png', exact: true })).toBeVisible();
    await receipt.getByRole('button', { name: 'Save receipt', exact: true }).click();
    await expect(receipt).toContainText('Claim draft ready');
    await expect.poll(() => psqlScalar(`SELECT count(*) FROM public.receiving_inspections i
      JOIN public.receiving_inspection_lines l ON l.inspection_id=i.id
      JOIN public.damage_claims c ON c.receiving_inspection_id=i.id
      WHERE i.purchase_order_id='${PO}' AND i.outcome='damaged' AND '${ASSET}'=ANY(i.photo_asset_ids)
        AND l.ffe_item_id='${LINE}' AND l.quantity_received=2 AND l.condition='damaged' AND l.noted_on_bol
        AND c.ffe_item_id='${LINE}' AND c.state='drafted';`), 'original PO/line receipt and drafted claim retain photo and damage').toBe('1');
    const inspectionId = psqlScalar(`SELECT id FROM public.receiving_inspections WHERE purchase_order_id='${PO}';`);
    const claimId = psqlScalar(`SELECT id FROM public.damage_claims WHERE receiving_inspection_id='${inspectionId}';`);
    await receipt.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(opener).toBeVisible();
    const claim = ledger.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Track claim', exact: true }) }).filter({ hasText: 'P02 Fictional Receiving Maker' });
    await expect(claim.getByRole('img', { name: 'Inspection photo 1 of 1', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('receiving-claim.png') });
    await claim.getByRole('button', { name: 'Track claim', exact: true }).click();
    const exception = ledger.getByTestId('exception-row').filter({ hasText: 'P02-RECEIPT' });
    await exception.getByRole('button', { name: 'Choose resolution', exact: true }).click();
    const remedy = page.getByTestId('exception-path-sheet');
    await remedy.getByRole('radio', { name: /^Replace/ }).check();
    await remedy.getByLabel('Reason (kept on the PO’s record)').fill('Maker replaces the damaged chair on the original order.');
    await remedy.getByRole('button', { name: 'Record resolution', exact: true }).click();
    await expect(remedy).toHaveCount(0);
    await expect.poll(() => psqlScalar(`SELECT count(*) FROM public.procurement_exceptions e
      JOIN public.purchase_order_changes ch ON ch.id=e.po_change_id
      WHERE e.damage_claim_id='${claimId}' AND e.inspection_id='${inspectionId}'
        AND e.purchase_order_id='${PO}' AND e.ffe_item_id='${LINE}' AND e.resolution_path='replace'
        AND ch.purchase_order_id='${PO}' AND ch.change_kind='remedy';`), 'replacement remedy remains bound to original native subjects').toBe('1');
    expect(psqlScalar(`SELECT received_quantity FROM public.project_ffe_items WHERE id='${LINE}';`), 'replacement did not receive another delivery').toBe('2');
    expect(psqlScalar(`SELECT count(*) FROM public.receiving_inspections WHERE purchase_order_id='${PO}';`), 'one original receipt').toBe('1');
    expect(psqlScalar(`SELECT count(*) FROM public.purchase_orders WHERE id::text LIKE '${PREFIX}%';`), 'replacement did not invent a second PO').toBe('1');
  } finally {
    cleanup();
  }
});

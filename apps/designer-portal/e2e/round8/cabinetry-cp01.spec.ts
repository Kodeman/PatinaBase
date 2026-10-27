import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '../fixtures/auth';
import { psqlAsUserRow, psqlRow, psqlRun, psqlScalar } from '../helpers/psql';

/*
 * CP-01 (SQ-2079 / X06): the 03 Cabinetry chapter reads one GC-bought cabinet
 * package from the native 00884 reader, as the signed-in F01 designer.
 * Requires the L0 mount of `cabinetry` (round8-paper-frame + doc page); until
 * that lands the chapter is absent and this spec fails at its first locator.
 * The fixture is replica-mode recorded facts: it proves the reading, NOT the
 * authenticated activation of any C5 act (every writer stays revoked).
 */
const cp = (n: number) => `f2079000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const designer = 'f0180000-0000-4000-8000-000000000002';
const project = cp(201);
const fulfilment = cp(401);
const sam = cp(11);

test.describe('CP-01 cabinetry package reading', () => {
  test.setTimeout(240_000);
  // Set only once this run's fixture committed: a refused setup (residue, wrong
  // host, missing designer) never deletes rows this run did not create.
  let seeded = false;
  test.beforeAll(() => {
    for (const url of [process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres']) {
      if (new URL(url).hostname !== '127.0.0.1') throw new Error('CP-01 fixtures require 127.0.0.1');
    }
    psqlRun(readFileSync(path.join(__dirname, 'cabinetry-cp01-fixture.sql'), 'utf8'));
    seeded = true;
  });

  test.afterAll(() => {
    if (!seeded) return;
    // Exact fictional ids only; refuse if the project is not the F01 designer's.
    // The C5 ledger rejects DELETE by trigger, so cleanup runs in replica mode,
    // transaction-local, scoped to the prefix-checked rows.
    psqlRun(`BEGIN;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.projects WHERE id = '${project}' AND designer_id IS DISTINCT FROM '${designer}'::uuid)
        THEN RAISE EXCEPTION 'Nonfixture owner: refusing cleanup'; END IF;
      END $$;
      SET LOCAL session_replication_role = replica;
      DELETE FROM public.project_external_fulfilment_verifications WHERE fulfilment_id = '${fulfilment}';
      DELETE FROM public.project_external_fulfilment_events WHERE fulfilment_id = '${fulfilment}';
      DELETE FROM public.project_external_fulfilment_evidence_bindings WHERE fulfilment_id = '${fulfilment}';
      DELETE FROM public.evidence_manifest_members WHERE manifest_id = '${cp(851)}';
      DELETE FROM public.evidence_manifests WHERE id = '${cp(851)}';
      DELETE FROM public.project_external_fulfilments WHERE id = '${fulfilment}';
      DELETE FROM public.project_party_authority WHERE id = '${cp(850)}';
      DELETE FROM public.project_parties WHERE id IN ('${cp(811)}', '${cp(812)}');
      DELETE FROM public.coordination_item_revisions WHERE id = '${cp(701)}';
      DELETE FROM public.client_decisions WHERE id IN ('${cp(601)}', '${cp(602)}');
      DELETE FROM public.designer_clients WHERE id = '${cp(902)}';
      DELETE FROM public.plan_issues WHERE id IN ('${cp(821)}', '${cp(822)}');
      DELETE FROM public.project_packages WHERE id = '${cp(801)}';
      DELETE FROM public.project_scope_edition_packages WHERE edition_id = '${cp(301)}';
      DELETE FROM public.project_scope_editions WHERE id = '${cp(301)}';
      DELETE FROM public.project_commercial_documents WHERE id = '${cp(901)}';
      DELETE FROM public.proposals WHERE id = '${cp(911)}';
      DELETE FROM public.projects WHERE id = '${project}';
      DELETE FROM public.profiles WHERE id IN ('${cp(11)}', '${cp(12)}', '${cp(13)}');
      DELETE FROM auth.users WHERE id IN ('${cp(11)}', '${cp(12)}', '${cp(13)}');
      COMMIT;`);
    expect(psqlScalar(`SELECT
      (SELECT count(*) FROM public.projects WHERE id::text LIKE 'f2079000-%')
      + (SELECT count(*) FROM public.project_external_fulfilment_events WHERE id::text LIKE 'f2079000-%')
      + (SELECT count(*) FROM public.evidence_manifests WHERE id::text LIKE 'f2079000-%')
      + (SELECT count(*) FROM auth.users WHERE id::text LIKE 'f2079000-%')`)).toBe('0');
  });

  test('reads the package, its exact issue, partial holds and Sam\'s verification', async ({ authenticatedPage: page }) => {
    // Native readback first: the recorded facts the page must read, never invent.
    expect(psqlRow(`SELECT array_to_string(units, ','), status FROM public.project_external_fulfilments WHERE id = '${fulfilment}'`))
      .toEqual(['k-1,k-2,k-3,k-4,k-5,k-6', 'received']);
    expect(psqlRow(`SELECT recorded_by, verified_by FROM public.project_external_fulfilment_events WHERE id = '${cp(1003)}'`))
      .toEqual([designer, sam]);
    expect(psqlScalar(`SELECT count(*) FROM public.evidence_manifest_members WHERE manifest_id = '${cp(851)}'`)).toBe('2');
    // The authenticated designer's own reader call accepts the reading.
    expect(psqlAsUserRow(designer, `SELECT jsonb_array_length(r), jsonb_array_length(r->0->'reading'->'manifests'),
      jsonb_array_length(r->0->'reading'->'events') FROM (SELECT public.get_project_external_fulfilments('${project}') r) q;`))
      .toEqual(['1', '1', '8']);

    await page.goto(`/doc/${project}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
    const chapter = page.locator('[data-paper-chapter="cabinetry"] [data-cabinetry-chapter]');
    const pkg = chapter.locator(`[data-cabinet-package="${fulfilment}"]`);
    await expect(pkg.getByRole('heading', { level: 3 })).toHaveText('CP-01 · Kitchen cabinetry', { timeout: 60_000 });
    await expect(pkg.locator('[data-no-studio-po]')).toContainText('No studio purchase order, purchase or invoice');
    await expect(pkg.locator('[data-route="intent-shop-drawing"]')).toBeVisible();

    // Exact issue: issue B (highest event_seq), not issue A.
    await expect(pkg.locator(`[data-exact-issue="${cp(822)}"]`)).toContainText('Issue 2 · CP01 cabinet issue B');

    // Partial, independent holds: k-3/k-4 held; only instructed k-1/k-2 proceed;
    // k-5 (released) and k-6 are not held but not instructed, so they do not proceed.
    for (const [unit, state, proceeds] of [
      ['k-1', 'instructed', 'true'], ['k-2', 'instructed', 'true'], ['k-3', 'held', 'false'],
      ['k-4', 'held', 'false'], ['k-5', 'not-instructed', 'false'], ['k-6', 'not-instructed', 'false'],
    ]) {
      await expect(pkg.locator(`[data-unit="${unit}"]`)).toHaveAttribute('data-unit-state', state);
      await expect(pkg.locator(`[data-unit="${unit}"]`)).toHaveAttribute('data-unit-proceeds', proceeds);
    }
    const hold = pkg.locator(`[data-hold="${cp(1005)}"]`);
    await expect(hold.locator('[data-held-units]')).toHaveText('k-3, k-4');
    await expect(hold.locator('[data-proceeding-units]')).toHaveText('k-1, k-2');
    await expect(hold.locator('[data-uninstructed-units]')).toHaveText('k-5, k-6');
    await expect(hold).toContainText('CP01 H-14 hardware substitution');
    await expect(pkg.locator(`[data-hold="${cp(1006)}"]`)).toHaveCount(0);

    // Sam's verification stays Sam's; the designer is the recorder.
    const contract = pkg.locator(`[data-authorship="${cp(1003)}"]`).first();
    await expect(contract.locator(`[data-verified-by="${sam}"]`)).toHaveText('CP01 Sam Ortiz');

    // Instruction contents are the frozen manifest; receipt is separate and not acceptance.
    await expect(pkg.locator(`[data-manifest="${cp(851)}"] [data-member-kind]`)).toHaveCount(2);
    await expect(pkg.locator(`[data-receipt="${cp(1008)}"]`)).toContainText('Receipt is not acceptance.');

    // No GC price by default; shown only on the explicit disclosure.
    await expect(chapter).not.toContainText('$28,400');
    const reveal = pkg.getByRole('button', { name: "Show the GC's reported amounts" });
    await reveal.click();
    await expect(pkg.locator('[data-gc-price]')).toContainText('$28,400.00 (studio only)');

    // Inactive acts are visibly unavailable and do nothing.
    for (const name of ['Record instruction', 'Place a hold', 'Record receipt', 'Verify an event']) {
      await expect(pkg.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
    }
    // A held act stays focusable but aria-disabled, so Playwright's click() waits
    // for "enabled" forever; activate it from the keyboard like a user would.
    await pkg.getByRole('button', { name: 'Record instruction' }).focus();
    await page.keyboard.press('Enter');
    expect(psqlScalar(`SELECT count(*) FROM public.project_external_fulfilment_events WHERE fulfilment_id = '${fulfilment}'`)).toBe('8');

    // Zero studio commerce: no PO, studio purchase or invoice exists for this job.
    expect(psqlRow(`SELECT
      (SELECT count(*) FROM public.purchase_orders WHERE project_id = '${project}'),
      (SELECT count(*) FROM public.studio_purchases WHERE project_id = '${project}'),
      (SELECT count(*) FROM public.invoices WHERE project_id = '${project}')`)).toEqual(['0', '0', '0']);
    await page.screenshot({ path: test.info().outputPath('cp01-cabinetry.png'), fullPage: true });
  });
});

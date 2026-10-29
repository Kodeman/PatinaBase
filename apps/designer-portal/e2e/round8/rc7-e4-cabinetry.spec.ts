import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '../fixtures/auth';
import { psqlAsUserRow, psqlRow, psqlRun, psqlScalar } from '../helpers/psql';

const id = (n: number) => `e4070000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const designer = 'f0180000-0000-4000-8000-000000000002';
const project = id(201);
const edition = id(301);
const gc = id(12);
const studioAdmin = id(14);
const seat = id(811);
const vendor = id(860);
const e4Users = [id(11), gc, id(13), studioAdmin];
const e4Decisions = [id(601), id(602), id(603), id(604)];
let fulfilment = '';

function actor(user: string, sql: string): string {
  return psqlAsUserRow(user, `SELECT (${sql})::text;`)[0]!;
}
// [SQLSTATE, message] of a refused authenticated call. A call that succeeds is
// rolled back and reported as P0001 e4_not_refused, so it never persists.
function refusal(user: string, sql: string): string[] {
  return psqlAsUserRow(user, `DO $e4$ BEGIN
    BEGIN EXECUTE $e4sql$SELECT ${sql}$e4sql$; RAISE EXCEPTION 'e4_not_refused';
    EXCEPTION WHEN OTHERS THEN PERFORM set_config('e4.refusal', SQLSTATE || '|' || SQLERRM, true); END;
  END $e4$;
  SELECT current_setting('e4.refusal');`);
}
function event(fid: string, kind: string, evidence: string, key: string, units = 'NULL'): string {
  const result = JSON.parse(actor(designer, `public.record_external_fulfilment_event('${fid}','${kind}',${evidence},${units},'e4-${key}')`));
  expect(result.replayed).toBe(false);
  expect(psqlRow(`SELECT event_kind, evidence_level FROM public.project_external_fulfilment_events WHERE id='${result.eventId}'`))
    .toEqual([kind, 'reported']);
  return result.eventId;
}
function install(fid: string, key: string): string {
  return `public.record_external_fulfilment_event('${fid}','installed','${JSON.stringify({ siteVerification: 'GC measured field conditions', acceptance: 'pending' })}'::jsonb,NULL,'e4-${key}')`;
}
function instruct(fid: string, manifest: string, units: string, key: string): string {
  return `public.record_external_fulfilment_event('${fid}','fabrication_instruction',
    jsonb_build_object('manifestId','${manifest}','authorizingPartyId','${seat}'),ARRAY[${units}],'e4-${key}')`;
}
function release(fid: string, hold: string, decision: string, key: string): string {
  return event(fid, 'release_hold', `jsonb_build_object('releasesEventId','${hold}','decisionId','${decision}')`, key);
}
function grantAuthority(): void {
  actor(designer, `public.grant_fabrication_authority('${seat}',current_date,'e4-grant',NULL,3000000,ARRAY['${id(812)}'::uuid],'GC fabrication authorization')`);
  expect(psqlScalar(`SELECT count(*) FROM public.project_party_authority WHERE engagement_id='${seat}' AND scope='fabrication'`)).toBe('1');
}
function revisionMember(revision: number): string {
  return `(SELECT jsonb_build_object('kind','coordination_item_revision','id',id,'rev',rev_number,'sha256',
    encode(extensions.digest(public._plan_room_canonical_json(jsonb_build_object('decisionId',decision_id,'rev',rev_number,'attachments',attachments,'note',note)),'sha256'),'hex'))
    FROM public.coordination_item_revisions WHERE id='${id(revision)}')`;
}
function issueMember(issueId: string): string {
  return `(SELECT jsonb_build_object('kind','plan_issue','id',id,'version',issue_number,'sha256',set_checksum) FROM public.plan_issues WHERE id='${issueId}')`;
}
function manifestFor(packageId: string, members: string, key: string): string {
  const json = psqlScalar(`SELECT (jsonb_build_array(${members}))::text`);
  return JSON.parse(actor(designer, `public.create_evidence_manifest('${project}','${packageId}','fabrication_instruction','${json.replace(/'/g, "''")}'::jsonb,'${key}')`)).manifestId;
}
function verifyContract(fid: string, amount: number, key: string): void {
  const contract = event(fid, 'contract_reported', `'${JSON.stringify({ contractAmountCents: amount, gcBuyer: true, contents: ['k-1','k-2','k-3','k-4'], hardware: 'H-14 pulls', applianceInterfaces: ['range','dishwasher'], siteVerification: 'GC to verify field dimensions' })}'::jsonb`, `${key}-contract`);
  const verified = JSON.parse(actor(studioAdmin, `public.verify_external_fulfilment_event('${contract}','e4-${key}-verify-contract')`));
  expect(verified.evidenceLevel).toBe('verified');
  expect(psqlScalar(`SELECT verified_by FROM public.project_external_fulfilment_events WHERE id='${contract}'`)).toBe(studioAdmin);
}
function status(fid: string): string {
  return psqlScalar(`SELECT status FROM public.project_external_fulfilments WHERE id='${fid}'`);
}
function state(statusName: string, count: number): void {
  expect(psqlRow(`SELECT status, (SELECT count(*) FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id) FROM public.project_external_fulfilments f WHERE id='${fulfilment}'`))
    .toEqual([statusName, String(count)]);
  expect(psqlRow(`SELECT (SELECT count(*) FROM public.purchase_orders WHERE project_id='${project}'),
    (SELECT count(*) FROM public.studio_purchases WHERE project_id='${project}'),
    (SELECT count(*) FROM public.invoices WHERE project_id='${project}'),
    (SELECT COALESCE(sum(li.amount_cents),0) FROM public.invoice_line_items li JOIN public.invoices i ON i.id=li.invoice_id WHERE i.project_id='${project}')`)).toEqual(['0','0','0','0']);
  expect(psqlScalar(`SELECT line_total_cents FROM public.project_ffe_items WHERE id='${id(840)}'`)).toBe('0');
  expect(JSON.parse(actor(designer, `public.get_project_ffe_readiness('${id(840)}')`)))
    .toEqual({ selectionId: id(840), responsibility: 'external', ready: false, missingFields: [] });
}
type BudgetLine = { roomName: string; category: string; targetCents: number };
type Budget = { version: { status: string; targetTotalCents: number }; lines: BudgetLine[]; externalSelections: Array<Record<string, unknown>> };
// Derived as the designer and rolled back, so no budget version persists.
function derivedBudget(): Budget {
  return JSON.parse(psqlScalar(`BEGIN;
    SET LOCAL request.jwt.claim.sub='${designer}'; SET LOCAL ROLE authenticated;
    SELECT public.derive_working_budget_draft('${project}')::text;
    ROLLBACK;`));
}
function budgetLines(budget: Budget): BudgetLine[] {
  return budget.lines.map(({ roomName, category, targetCents }) => ({ roomName, category, targetCents }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

// C5 writers are called with SET LOCAL ROLE authenticated and an actual actor JWT.
test.describe('RC-7 E4 GC cabinetry transitions', () => {
  test.setTimeout(300_000);
  let seeded = false;
  test.beforeAll(() => {
    if (['54321', '54322'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port) ||
      ['54321', '54322'].includes(new URL(process.env.SUPABASE_DB_URL!).port)) throw new Error('E4 refuses the shared stack');
    psqlRun(readFileSync(path.join(__dirname, 'rc7-e4-cabinetry-fixture.sql'), 'utf8'));
    seeded = true;
  });
  test.afterAll(() => {
    if (!seeded) return;
    const users = e4Users.map((u) => `'${u}'`).join(',');
    const decisions = e4Decisions.map((d) => `'${d}'`).join(',');
    psqlRun(`BEGIN;
      DO $$ DECLARE prior_enabled boolean; granted regprocedure[]; fn regprocedure; BEGIN
        IF to_regclass('rc7_e4_activation.prior') IS NULL THEN
          RAISE EXCEPTION 'E4 cleanup refuses a stack without its activation marker'; END IF;
        EXECUTE 'SELECT capability_enabled, granted FROM rc7_e4_activation.prior' INTO STRICT prior_enabled, granted;
        FOREACH fn IN ARRAY granted LOOP EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn); END LOOP;
        UPDATE public.server_capabilities SET enabled=prior_enabled WHERE key='scope_editions';
      END $$;
      SET LOCAL session_replication_role=replica;
      DELETE FROM public.decision_notifications WHERE decision_id IN (${decisions});
      DELETE FROM public.notification_log WHERE user_id IN (${users}) OR metadata::text LIKE '%e4070000-%';
      DELETE FROM public.audit_logs WHERE metadata->>'projectId'='${project}' OR user_id IN (${users})
        OR resource_id::text LIKE 'e4070000-%';
      DELETE FROM public.project_ffe_external_conversion_receipts WHERE project_id='${project}';
      DELETE FROM public.project_ffe_items WHERE project_id='${project}';
      DELETE FROM public.project_ffe_selection_threads WHERE project_id='${project}';
      DELETE FROM public.project_external_fulfilment_verifications WHERE fulfilment_id IN (SELECT id FROM public.project_external_fulfilments WHERE project_id='${project}');
      DELETE FROM public.project_external_fulfilment_events WHERE fulfilment_id IN (SELECT id FROM public.project_external_fulfilments WHERE project_id='${project}');
      DELETE FROM public.project_external_fulfilment_evidence_bindings WHERE fulfilment_id IN (SELECT id FROM public.project_external_fulfilments WHERE project_id='${project}');
      DELETE FROM public.project_external_fulfilments WHERE project_id='${project}';
      DELETE FROM public.evidence_manifest_requests WHERE project_id='${project}';
      DELETE FROM public.evidence_manifest_members WHERE manifest_id IN (SELECT id FROM public.evidence_manifests WHERE project_id='${project}');
      DELETE FROM public.evidence_manifests WHERE project_id='${project}';
      DELETE FROM public.project_party_authority WHERE engagement_id IN ('${seat}');
      DELETE FROM public.project_parties WHERE project_id='${project}';
      DELETE FROM public.plan_issue_prints WHERE issue_id IN (SELECT id FROM public.plan_issues WHERE project_id='${project}');
      DELETE FROM public.plan_issues WHERE project_id='${project}';
      DELETE FROM public.plan_sheet_packages WHERE sheet_id='${id(821)}';
      DELETE FROM public.plan_prints WHERE sheet_id='${id(821)}';
      DELETE FROM public.plan_sheets WHERE id='${id(821)}';
      DELETE FROM public.coordination_item_revisions WHERE decision_id IN (${decisions});
      DELETE FROM public.client_decisions WHERE project_id='${project}';
      DELETE FROM public.designer_clients WHERE id='${id(902)}';
      DELETE FROM public.product_configurations WHERE id='${id(831)}';
      DELETE FROM public.project_packages WHERE project_id='${project}';
      DELETE FROM public.project_scope_edition_packages WHERE edition_id='${edition}';
      DELETE FROM public.project_scope_editions WHERE project_id='${project}';
      DELETE FROM public.project_commercial_documents WHERE project_id='${project}';
      DELETE FROM public.proposals WHERE project_id='${project}';
      DELETE FROM public.project_rooms WHERE project_id='${project}';
      DELETE FROM public.projects WHERE id='${project}';
      DELETE FROM public.vendors WHERE id='${vendor}';
      DELETE FROM public.organization_members WHERE user_id IN (${users});
      DELETE FROM public.profiles WHERE id IN (${users});
      DELETE FROM auth.users WHERE id IN (${users});
      DROP SCHEMA rc7_e4_activation CASCADE;
      COMMIT;`);
    expect(psqlRow(`SELECT
      (SELECT count(*) FROM public.projects WHERE id::text LIKE 'e4070000-%'),
      (SELECT count(*) FROM public.project_ffe_items WHERE id::text LIKE 'e4070000-%' OR project_id='${project}'),
      (SELECT count(*) FROM public.project_external_fulfilments WHERE project_id='${project}'),
      (SELECT count(*) FROM public.evidence_manifests WHERE project_id='${project}'),
      (SELECT count(*) FROM public.project_party_authority WHERE engagement_id::text LIKE 'e4070000-%'),
      (SELECT count(*) FROM public.plan_issues WHERE project_id='${project}'),
      (SELECT count(*) FROM public.project_budget_versions WHERE project_id='${project}'),
      (SELECT count(*) FROM public.client_decisions WHERE id::text LIKE 'e4070000-%'),
      (SELECT count(*) FROM public.decision_notifications WHERE decision_id::text LIKE 'e4070000-%'),
      (SELECT count(*) FROM public.notification_log WHERE user_id::text LIKE 'e4070000-%' OR metadata::text LIKE '%e4070000-%'),
      (SELECT count(*) FROM public.audit_logs WHERE metadata->>'projectId'='${project}' OR user_id::text LIKE 'e4070000-%' OR resource_id::text LIKE 'e4070000-%'),
      (SELECT count(*) FROM public.vendors WHERE id::text LIKE 'e4070000-%'),
      (SELECT count(*) FROM public.organization_members WHERE user_id::text LIKE 'e4070000-%'),
      (SELECT count(*) FROM auth.users WHERE id::text LIKE 'e4070000-%'),
      (SELECT count(*) FROM pg_namespace WHERE nspname='rc7_e4_activation')`))
      .toEqual(Array(15).fill('0'));
  });

  test('A17/A18: GC path records each act; substitution holds only affected units', async ({ authenticatedPage: page }) => {
    const created = JSON.parse(actor(designer, `public.create_external_fulfilment('${project}','${edition}','pkg.e4','gc_cabinetry',
      ARRAY['k-1','k-2','k-3','k-4'],'${seat}',NULL,'e4-create')`));
    fulfilment = created.fulfilmentId;
    expect(created.replayed).toBe(false);

    // Before conversion: an ordinary studio line, ready for procurement and in the budget rollup.
    expect(JSON.parse(actor(designer, `public.get_project_ffe_readiness('${id(840)}')`)))
      .toEqual({ selectionId: id(840), ready: true, missingFields: [] });
    const before = derivedBudget();
    expect(before.version.status).toBe('draft');
    expect(before.version.targetTotalCents).toBe(0);
    expect(budgetLines(before)).toEqual([
      { roomName: 'E4 Kitchen', category: 'Cabinetry', targetCents: 2840000 },
      { roomName: 'E4 Kitchen', category: 'Lighting', targetCents: 450000 },
    ]);
    expect(before.externalSelections).toEqual([]);

    expect(psqlScalar(`SELECT line_total_cents FROM public.project_ffe_items WHERE id='${id(840)}'`)).toBe('2840000');
    const version = psqlScalar(`SELECT row_version FROM public.project_ffe_items WHERE id='${id(840)}'`);
    const converted = JSON.parse(actor(designer, `public.set_ffe_item_external_fulfilment('${id(840)}','${fulfilment}',${version},'e4-convert')`));
    expect(converted.direction).toBe('external');
    expect(converted.pricingSnapshot.line_total_cents).toBe(2840000);
    expect(psqlRow(`SELECT direction, pricing_snapshot->>'line_total_cents', pricing_snapshot->>'unit_price_cents'
      FROM public.project_ffe_external_conversion_receipts WHERE item_id='${id(840)}'`)).toEqual(['external','2840000','2840000']);
    expect(psqlRow(`SELECT external_fulfilment_id,line_total_cents,scope_package_key FROM public.project_ffe_items WHERE id='${id(840)}'`))
      .toEqual([fulfilment,'0','pkg.e4']);
    state('planned', 0);

    // After conversion: the cabinets leave the studio rollup; the priced control line stays.
    const after = derivedBudget();
    expect(after.version.status).toBe('draft');
    expect(after.version.targetTotalCents).toBe(0);
    expect(budgetLines(after)).toEqual([{ roomName: 'E4 Kitchen', category: 'Lighting', targetCents: 450000 }]);
    expect(after.externalSelections).toEqual([expect.objectContaining({
      id: id(840), responsibility: 'external', externalFulfilmentId: fulfilment,
      clientLineTotalCents: null, clientUnitPriceCents: null,
    })]);
    expect(psqlScalar(`SELECT count(*) FROM public.project_budget_versions WHERE project_id='${project}'`)).toBe('0');

    // Native studio commerce refuses the external line.
    expect(refusal(designer, `public.record_studio_purchase(jsonb_build_object('projectId','${project}','ffeItemId','${id(840)}',
      'kind','antique_auction','payeeName','E4 Cabinet Vendor','amountCents',2840000))`))
      .toEqual(['23514', 'external_presence_studio_purchase_refused']);
    expect(refusal(designer, `public.create_purchase_order('${project}','${vendor}','thirty_seventy',ARRAY['${id(840)}']::uuid[])`))
      .toEqual(['23514', 'external_presence_purchase_order_refused']);
    state('planned', 0);

    const quote = event(fulfilment, 'quote_reported', `'${JSON.stringify({ quoteAmountCents: 2800000, scope: 'Four kitchen units; GC purchases and pays', sample: 'Oak finish sample requested', applianceInterfaces: ['range', 'dishwasher'], siteVerification: 'Field measure required' })}'::jsonb`, 'quote');
    expect(quote).toBeTruthy();
    state('planned', 1);
    verifyContract(fulfilment, 2840000, 'journey');
    state('contracted', 2);
    grantAuthority();
    const issue = JSON.parse(actor(designer, `public.create_plan_issue('${project}','E4 kitchen cabinet issue','e4-issued')`));
    const issueId = issue.issue.id;
    expect(issueId).toBeTruthy();
    expect(psqlRow(`SELECT event_kind,plan_issue_id FROM public.project_external_fulfilment_events WHERE fulfilment_id='${fulfilment}' AND event_kind='package_issued'`)).toEqual(['package_issued',issueId]);
    state('issued', 3);
    actor(designer, `public.bind_fulfilment_evidence('${fulfilment}','${id(601)}',ARRAY['k-1','k-2','k-3','k-4'],'e4-bind')`);
    expect(psqlRow(`SELECT bound_by,array_to_string(units,','),covers_plan_issue_id FROM public.project_external_fulfilment_evidence_bindings WHERE fulfilment_id='${fulfilment}'`))
      .toEqual([designer,'k-1,k-2,k-3,k-4',issueId]);
    actor(designer, `public.resolve_coordination_item('${id(601)}',NULL,NULL,'${id(701)}',NULL,NULL)`);
    expect(psqlScalar(`SELECT status FROM public.coordination_item_revisions WHERE id='${id(701)}'`)).toBe('approved');
    state('issued', 3);
    const manifest = manifestFor(id(801), `${issueMember(issueId)},${revisionMember(701)}`, 'e4-manifest');
    expect(psqlScalar(`SELECT count(*) FROM public.evidence_manifest_members WHERE manifest_id='${manifest}'`)).toBe('2');
    // The substitution submittal is bound to the held units before its approval.
    actor(designer, `public.bind_fulfilment_evidence('${fulfilment}','${id(604)}',ARRAY['k-3','k-4'],'e4-bind-hardware')`);
    const holdEvidence = JSON.stringify({ decisionId: id(604), affectedUnits: ['k-3','k-4'], priceDeltaCents: 38000, delayDays: 7, drilling: 'Re-bore K3/K4 pulls', approval: 'Pending revised hardware approval', recipients: ['GC','cabinet maker','studio'] });
    const hold = event(fulfilment, 'hold', `'${holdEvidence}'::jsonb`, 'hold', `ARRAY['k-3','k-4']`);
    expect(psqlRow(`SELECT array_to_string(affected_units,','),evidence->>'drilling',evidence->>'priceDeltaCents',evidence->>'delayDays' FROM public.project_external_fulfilment_events WHERE id='${hold}'`))
      .toEqual(['k-3,k-4','Re-bore K3/K4 pulls','38000','7']);
    state('issued', 4);
    expect(refusal(designer, instruct(fulfilment, manifest, `'k-3'`, 'held-denied'))).toEqual(['23514', 'fabrication_hold_open']);
    state('issued', 4);
    const instruction = JSON.parse(actor(designer, instruct(fulfilment, manifest, `'k-1','k-2'`, 'instruct-unaffected')));
    expect(psqlRow(`SELECT event_kind,array_to_string(affected_units,','),amount_cents,evidence_route,actor_id FROM public.project_external_fulfilment_events WHERE id='${instruction.eventId}'`))
      .toEqual(['fabrication_instruction','k-1,k-2','2840000','shop_drawing',designer]);
    state('instructed', 5);
    const receipt = event(fulfilment, 'received', `'{}'::jsonb`, 'received');
    expect(psqlScalar(`SELECT evidence_level FROM public.project_external_fulfilment_events WHERE id='${receipt}'`)).toBe('reported');
    state('received', 6);
    expect(refusal(designer, install(fulfilment, 'installed-held'))).toEqual(['55000', 'fulfilment_hold_open']);
    state('received', 6);

    await page.goto(`/doc/${project}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
    const pkg = page.locator(`[data-cabinet-package="${fulfilment}"]`);
    await expect(pkg.locator(`[data-hold="${hold}"] [data-held-units]`)).toHaveText('k-3, k-4');
    for (const [unit, unitState] of [['k-1','instructed'],['k-3','held']])
      await expect(pkg.locator(`[data-unit="${unit}"]`)).toHaveAttribute('data-unit-state', unitState);

    actor(designer, `public.resolve_coordination_item('${id(604)}',NULL,NULL,'${id(704)}',NULL,NULL)`);
    expect(psqlScalar(`SELECT status FROM public.coordination_item_revisions WHERE id='${id(704)}'`)).toBe('approved');
    const released = release(fulfilment, hold, id(604), 'release');
    expect(psqlScalar(`SELECT releases_event_id FROM public.project_external_fulfilment_events WHERE id='${released}'`)).toBe(hold);
    state('received', 7);
    expect(refusal(designer, install(fulfilment, 'installed-uninstructed'))).toEqual(['55000', 'fulfilment_units_uninstructed']);
    const heldInstruction = JSON.parse(actor(designer, instruct(fulfilment, manifest, `'k-3','k-4'`, 'instruct-released')));
    expect(psqlScalar(`SELECT array_to_string(affected_units,',') FROM public.project_external_fulfilment_events WHERE id='${heldInstruction.eventId}'`)).toBe('k-3,k-4');
    state('received', 8);
    const installed = JSON.parse(actor(designer, install(fulfilment, 'installed'))).eventId;
    state('received', 9);
    actor(studioAdmin, `public.verify_external_fulfilment_event('${installed}','e4-verify-installed')`);
    expect(psqlRow(`SELECT evidence_level,verified_by FROM public.project_external_fulfilment_events WHERE id='${installed}'`)).toEqual(['verified',studioAdmin]);
    state('installed', 9);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
    await expect(pkg).toContainText('installed');
    await expect(pkg.locator('[data-no-studio-po]')).toContainText('No studio purchase order');
    await expect(pkg.locator(`[data-hold="${hold}"]`)).toHaveCount(0);
    await expect(pkg.locator(`[data-hold-release="${hold}"]`)).toContainText('Hold released by its approved decision.');
    await expect(pkg.locator(`[data-receipt="${receipt}"]`)).toContainText('Receipt is not acceptance');
    for (const unit of ['k-1','k-3'])
      await expect(pkg.locator(`[data-unit="${unit}"]`)).toHaveAttribute('data-unit-state', 'instructed');

    // The designer-detail alternative still requires current maker evidence and an independent instruction.
    const detail = JSON.parse(actor(designer, `public.create_external_fulfilment('${project}','${edition}','pkg.e4detail','gc_cabinetry',
      ARRAY['p-1'],'${seat}','${id(831)}','e4-detail-create')`)).fulfilmentId;
    expect(psqlRow(`SELECT status,configuration_id FROM public.project_external_fulfilments WHERE id='${detail}'`)).toEqual(['planned',id(831)]);
    const detailContract = JSON.parse(actor(designer, `public.record_external_fulfilment_event('${detail}','contract_reported',
      '{"contractAmountCents":900000,"designerDetail":"pantry elevation","makerVerification":"field dimensions and appliance clearance"}'::jsonb,NULL,'e4-detail-contract')`)).eventId;
    actor(studioAdmin, `public.verify_external_fulfilment_event('${detailContract}','e4-detail-verify')`);
    expect(psqlScalar(`SELECT evidence_level FROM public.project_external_fulfilment_events WHERE id='${detailContract}'`)).toBe('verified');
    const detailIssue = JSON.parse(actor(designer, `public.create_plan_issue('${project}','E4 pantry detail issue','e4-detail-issue')`)).issue.id;
    expect(psqlScalar(`SELECT plan_issue_id FROM public.project_external_fulfilment_events WHERE fulfilment_id='${detail}' AND event_kind='package_issued'`)).toBe(detailIssue);
    actor(designer, `public.bind_fulfilment_evidence('${detail}','${id(603)}',ARRAY['p-1'],'e4-detail-bind')`);
    expect(psqlRow(`SELECT covers_plan_issue_id,covers_configuration_snapshot_hash FROM public.project_external_fulfilment_evidence_bindings WHERE fulfilment_id='${detail}'`))
      .toEqual([detailIssue,psqlScalar(`SELECT snapshot_hash FROM public.product_configurations WHERE id='${id(831)}'`)]);
    actor(designer, `public.resolve_coordination_item('${id(603)}',NULL,NULL,'${id(703)}',NULL,NULL)`);
    expect(psqlScalar(`SELECT status FROM public.coordination_item_revisions WHERE id='${id(703)}'`)).toBe('approved');
    const detailManifest = manifestFor(id(802), `${issueMember(detailIssue)},
      (SELECT jsonb_build_object('kind','product_configuration','id',id,'version',version,'sha256',snapshot_hash) FROM public.product_configurations WHERE id='${id(831)}'),
      ${revisionMember(703)}`, 'e4-detail-manifest');
    expect(psqlScalar(`SELECT count(*) FROM public.evidence_manifest_members WHERE manifest_id='${detailManifest}'`)).toBe('3');
    const detailInstruction = JSON.parse(actor(designer, instruct(detail, detailManifest, `'p-1'`, 'detail-instruction'))).eventId;
    expect(psqlRow(`SELECT evidence_route,amount_cents,array_to_string(affected_units,',') FROM public.project_external_fulfilment_events WHERE id='${detailInstruction}'`))
      .toEqual(['shop_drawing','900000','p-1']);
    expect(psqlScalar(`SELECT count(*) FROM public.purchase_orders WHERE project_id='${project}'`)).toBe('0');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(`[data-cabinet-package="${detail}"] [data-route="detail-verification"]`)).toBeVisible({ timeout: 60_000 });
  });

  // RC7-E4-1 (fixed by 00900): neither recording nor verifying an installation
  // can close a package while a unit hold is open or a unit is uninstructed.
  test('RC7-E4-1: installation cannot close a package while held units remain', () => {
    const fid = JSON.parse(actor(designer, `public.create_external_fulfilment('${project}','${edition}','pkg.e4','gc_cabinetry',
      ARRAY['k-1','k-2','k-3','k-4'],'${seat}',NULL,'e4-rc-create')`)).fulfilmentId;
    verifyContract(fid, 1200000, 'rc');
    grantAuthority();
    const issueId = JSON.parse(actor(designer, `public.create_plan_issue('${project}','E4 RC7-E4-1 issue','e4-rc-issue')`)).issue.id;
    expect(psqlScalar(`SELECT plan_issue_id FROM public.project_external_fulfilment_events WHERE fulfilment_id='${fid}' AND event_kind='package_issued' ORDER BY event_seq DESC LIMIT 1`)).toBe(issueId);
    actor(designer, `public.bind_fulfilment_evidence('${fid}','${id(602)}',ARRAY['k-1','k-2','k-3','k-4'],'e4-rc-bind')`);
    const hold = event(fid, 'hold', `'${JSON.stringify({ decisionId: id(602), affectedUnits: ['k-3','k-4'], drilling: 'Re-bore K3/K4 pulls' })}'::jsonb`, 'rc-hold', `ARRAY['k-3','k-4']`);
    expect(refusal(designer, install(fid, 'rc-installed-held'))).toEqual(['55000', 'fulfilment_hold_open']);

    actor(designer, `public.resolve_coordination_item('${id(602)}',NULL,NULL,'${id(702)}',NULL,NULL)`);
    expect(psqlScalar(`SELECT status FROM public.coordination_item_revisions WHERE id='${id(702)}'`)).toBe('approved');
    const manifest = manifestFor(id(801), `${issueMember(issueId)},${revisionMember(702)}`, 'e4-rc-manifest');
    actor(designer, instruct(fid, manifest, `'k-1','k-2'`, 'rc-instruct-unaffected'));
    expect(refusal(designer, instruct(fid, manifest, `'k-3'`, 'rc-instruct-held'))).toEqual(['23514', 'fabrication_hold_open']);
    expect(refusal(designer, install(fid, 'rc-installed-held-2'))).toEqual(['55000', 'fulfilment_hold_open']);
    expect(psqlScalar(`SELECT count(*) FROM public.project_external_fulfilment_events WHERE fulfilment_id='${fid}' AND event_kind='installed'`)).toBe('0');
    expect(status(fid)).toBe('instructed');

    release(fid, hold, id(602), 'rc-release');
    expect(refusal(designer, install(fid, 'rc-installed-uninstructed'))).toEqual(['55000', 'fulfilment_units_uninstructed']);
    actor(designer, instruct(fid, manifest, `'k-3','k-4'`, 'rc-instruct-released'));
    const installed = JSON.parse(actor(designer, install(fid, 'rc-installed'))).eventId;
    expect(status(fid)).toBe('instructed');

    // A hold opened after the installation report blocks its verification.
    const lateHold = event(fid, 'hold', `'${JSON.stringify({ decisionId: id(602), affectedUnits: ['k-4'] })}'::jsonb`, 'rc-hold-late', `ARRAY['k-4']`);
    expect(refusal(studioAdmin, `public.verify_external_fulfilment_event('${installed}','e4-rc-verify-held')`))
      .toEqual(['55000', 'fulfilment_hold_open']);
    expect(psqlRow(`SELECT evidence_level, (SELECT count(*) FROM public.project_external_fulfilment_verifications WHERE event_id=e.id)
      FROM public.project_external_fulfilment_events e WHERE id='${installed}'`)).toEqual(['reported','0']);
    expect(status(fid)).toBe('instructed');
    release(fid, lateHold, id(602), 'rc-release-late');
    expect(JSON.parse(actor(studioAdmin, `public.verify_external_fulfilment_event('${installed}','e4-rc-verify')`)).status).toBe('installed');
    expect(psqlRow(`SELECT status, (SELECT count(*) FROM public.project_external_fulfilment_events h WHERE h.fulfilment_id=f.id AND h.event_kind='hold'
      AND NOT EXISTS (SELECT 1 FROM public.project_external_fulfilment_events r WHERE r.releases_event_id=h.id))
      FROM public.project_external_fulfilments f WHERE id='${fid}'`)).toEqual(['installed','0']);
  });
});

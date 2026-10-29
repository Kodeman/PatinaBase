import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '../fixtures/auth';
import { psqlAsUserRow, psqlRow, psqlRun, psqlScalar } from '../helpers/psql';

const id = (n: number) => `e4070000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const designer = 'f0180000-0000-4000-8000-000000000002';
const project = id(201);
const edition = id(301);
const gc = id(12);
const seat = id(811);
let fulfilment = '';

function actor(user: string, sql: string): string {
  return psqlAsUserRow(user, `SELECT (${sql})::text;`)[0]!;
}
function serviceActor(user: string, sql: string): string {
  return psqlScalar(`BEGIN; SET LOCAL request.jwt.claim.sub='${user}'; SET LOCAL ROLE service_role; SELECT (${sql})::text; COMMIT;`);
}
function event(kind: string, evidence: string, key: string, units = 'NULL'): string {
  const result = JSON.parse(actor(designer, `public.record_external_fulfilment_event('${fulfilment}','${kind}',${evidence},${units},'e4-${key}')`));
  expect(result.replayed).toBe(false);
  expect(psqlRow(`SELECT event_kind, evidence_level FROM public.project_external_fulfilment_events WHERE id='${result.eventId}'`))
    .toEqual([kind, kind === 'fabrication_instruction' ? 'reported' : 'reported']);
  return result.eventId;
}
function state(status: string, count: number): void {
  expect(psqlRow(`SELECT status, (SELECT count(*) FROM public.project_external_fulfilment_events WHERE fulfilment_id=f.id) FROM public.project_external_fulfilments f WHERE id='${fulfilment}'`))
    .toEqual([status, String(count)]);
  expect(psqlRow(`SELECT (SELECT count(*) FROM public.purchase_orders WHERE project_id='${project}'),
    (SELECT count(*) FROM public.studio_purchases WHERE project_id='${project}'),
    (SELECT count(*) FROM public.invoices WHERE project_id='${project}'),
    (SELECT COALESCE(sum(li.amount_cents),0) FROM public.invoice_line_items li JOIN public.invoices i ON i.id=li.invoice_id WHERE i.project_id='${project}')`)).toEqual(['0','0','0','0']);
  expect(psqlScalar(`SELECT COALESCE(sum(line_total_cents),0) FROM public.project_ffe_items WHERE project_id='${project}' AND removed_at IS NULL`)).toBe('0');
  expect(JSON.parse(actor(designer, `public.get_project_ffe_readiness('${id(840)}')`)))
    .toEqual({ selectionId: id(840), responsibility: 'external', ready: false, missingFields: [] });
}

// C5 writers are called with SET LOCAL ROLE authenticated and an actual actor JWT.
test.describe('RC-7 E4 GC cabinetry transitions', () => {
  test.setTimeout(240_000);
  let seeded = false;
  test.beforeAll(() => {
    if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port !== '60121' ||
      new URL(process.env.SUPABASE_DB_URL!).port !== '60122') throw new Error('E4 owned ports required');
    psqlRun(readFileSync(path.join(__dirname, 'rc7-e4-cabinetry-fixture.sql'), 'utf8'));
    seeded = true;
  });
  test.afterAll(() => {
    if (!seeded) return;
    psqlRun(`BEGIN;
      DO $$ BEGIN IF (SELECT system_identifier FROM pg_control_system()) <> 7702030541241491498
        THEN RAISE EXCEPTION 'E4 cleanup wrong stack'; END IF; END $$;
      SET LOCAL session_replication_role=replica;
      DELETE FROM public.project_ffe_external_conversion_receipts WHERE project_id='${project}';
      DELETE FROM public.project_ffe_items WHERE id='${id(840)}';
      DELETE FROM public.project_ffe_selection_threads WHERE id='${id(841)}';
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
      DELETE FROM public.coordination_item_revisions WHERE decision_id IN ('${id(601)}','${id(602)}','${id(603)}');
      DELETE FROM public.client_decisions WHERE project_id='${project}';
      DELETE FROM public.designer_clients WHERE id='${id(902)}';
      DELETE FROM public.product_configurations WHERE id='${id(831)}';
      DELETE FROM public.project_packages WHERE project_id='${project}';
      DELETE FROM public.project_scope_edition_packages WHERE edition_id='${edition}';
      DELETE FROM public.project_scope_editions WHERE project_id='${project}';
      DELETE FROM public.project_commercial_documents WHERE project_id='${project}';
      DELETE FROM public.proposals WHERE project_id='${project}';
      DELETE FROM public.projects WHERE id='${project}';
      DELETE FROM public.organization_members WHERE user_id='${gc}';
      DELETE FROM public.profiles WHERE id IN ('${id(11)}','${gc}','${id(13)}');
      DELETE FROM auth.users WHERE id IN ('${id(11)}','${gc}','${id(13)}');
      COMMIT;`);
    expect(psqlScalar(`SELECT count(*) FROM public.projects WHERE id='${project}'`)).toBe('0');
  });

  test('A17/A18: GC path records each act; substitution holds only affected units', async ({ authenticatedPage: page }) => {
    const created = JSON.parse(actor(designer, `public.create_external_fulfilment('${project}','${edition}','pkg.e4','gc_cabinetry',
      ARRAY['k-1','k-2','k-3','k-4'],'${seat}',NULL,'e4-create')`));
    fulfilment = created.fulfilmentId;
    expect(created.replayed).toBe(false);
    expect(psqlScalar(`SELECT line_total_cents FROM public.project_ffe_items WHERE id='${id(840)}'`)).toBe('2840000');
    const version = psqlScalar(`SELECT row_version FROM public.project_ffe_items WHERE id='${id(840)}'`);
    const converted = JSON.parse(actor(designer, `public.set_ffe_item_external_fulfilment('${id(840)}','${fulfilment}',${version},'e4-convert')`));
    expect(converted.direction).toBe('external');
    expect(psqlRow(`SELECT external_fulfilment_id,line_total_cents,scope_package_key FROM public.project_ffe_items WHERE id='${id(840)}'`))
      .toEqual([fulfilment,'0','pkg.e4']);
    state('planned', 0);
    const budget = JSON.parse(psqlScalar(`BEGIN;
      SET LOCAL request.jwt.claim.sub='${designer}'; SET LOCAL ROLE authenticated;
      SELECT public.derive_working_budget_draft('${project}')::text;
      ROLLBACK;`));
    expect(budget.externalSelections).toEqual([expect.objectContaining({
      id: id(840), responsibility: 'external', externalFulfilmentId: fulfilment,
      clientLineTotalCents: null, clientUnitPriceCents: null,
    })]);
    expect(budget.version?.targetTotalCents ?? 0).toBe(0);
    expect(psqlScalar(`SELECT count(*) FROM public.project_budget_versions WHERE project_id='${project}'`)).toBe('0');
    const quote = event('quote_reported', `'${JSON.stringify({ quoteAmountCents: 2800000, scope: 'Four kitchen units; GC purchases and pays', sample: 'Oak finish sample requested', applianceInterfaces: ['range', 'dishwasher'], siteVerification: 'Field measure required' })}'::jsonb`, 'quote');
    expect(quote).toBeTruthy();
    state('planned', 1);
    const contract = event('contract_reported', `'${JSON.stringify({ contractAmountCents: 2840000, gcBuyer: true, contents: ['k-1','k-2','k-3','k-4'], hardware: 'H-14 pulls', applianceInterfaces: ['range','dishwasher'], siteVerification: 'GC to verify field dimensions' })}'::jsonb`, 'contract');
    state('contracted', 2);
    const verified = JSON.parse(actor(gc, `public.verify_external_fulfilment_event('${contract}','e4-verify-contract')`));
    expect(verified.evidenceLevel).toBe('verified');
    expect(psqlRow(`SELECT verified_by,verification_seq FROM public.project_external_fulfilment_events WHERE id='${contract}'`)).toEqual([gc,'1']);
    state('contracted', 2);
    serviceActor(designer, `public.grant_fabrication_authority('${seat}',current_date,'e4-grant',NULL,3000000,ARRAY['${id(812)}'::uuid],'GC fabrication authorization')`);
    expect(psqlScalar(`SELECT count(*) FROM public.project_party_authority WHERE engagement_id='${seat}' AND scope='fabrication'`)).toBe('1');
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
    const members = `jsonb_build_array(
      (SELECT jsonb_build_object('kind','plan_issue','id',id,'version',issue_number,'sha256',set_checksum) FROM public.plan_issues WHERE id='${issueId}'),
      (SELECT jsonb_build_object('kind','coordination_item_revision','id',id,'rev',rev_number,'sha256',
        encode(extensions.digest(public._plan_room_canonical_json(jsonb_build_object('decisionId',decision_id,'rev',rev_number,'attachments',attachments,'note',note)),'sha256'),'hex'))
        FROM public.coordination_item_revisions WHERE id='${id(701)}'))`;
    const membersJson = psqlScalar(`SELECT (${members})::text`);
    const manifest = JSON.parse(serviceActor(designer, `public.create_evidence_manifest('${project}','${id(801)}','fabrication_instruction','${membersJson.replace(/'/g, "''")}'::jsonb,'e4-manifest')`)).manifestId;
    expect(psqlScalar(`SELECT count(*) FROM public.evidence_manifest_members WHERE manifest_id='${manifest}'`)).toBe('2');
    const holdEvidence = JSON.stringify({ decisionId: id(602), affectedUnits: ['k-3','k-4'], priceDeltaCents: 38000, delayDays: 7, drilling: 'Re-bore K3/K4 pulls', approval: 'Pending revised hardware approval', recipients: ['GC','cabinet maker','studio'] });
    const hold = event('hold', `'${holdEvidence}'::jsonb`, 'hold', `ARRAY['k-3','k-4']`);
    expect(psqlRow(`SELECT array_to_string(affected_units,','),evidence->>'drilling',evidence->>'priceDeltaCents',evidence->>'delayDays' FROM public.project_external_fulfilment_events WHERE id='${hold}'`))
      .toEqual(['k-3,k-4','Re-bore K3/K4 pulls','38000','7']);
    state('issued', 4);
    expect(() => actor(designer, `public.record_external_fulfilment_event('${fulfilment}','fabrication_instruction',
      jsonb_build_object('manifestId','${manifest}','authorizingPartyId','${seat}'),ARRAY['k-3'],'e4-held-denied')`)).toThrow(/fabrication_hold_open/);
    state('issued', 4);
    const instruction = JSON.parse(actor(designer, `public.record_external_fulfilment_event('${fulfilment}','fabrication_instruction',
      jsonb_build_object('manifestId','${manifest}','authorizingPartyId','${seat}'),ARRAY['k-1','k-2'],'e4-instruct-unaffected')`));
    expect(psqlRow(`SELECT event_kind,array_to_string(affected_units,','),amount_cents,evidence_route,actor_id FROM public.project_external_fulfilment_events WHERE id='${instruction.eventId}'`))
      .toEqual(['fabrication_instruction','k-1,k-2','2840000','shop_drawing',designer]);
    state('instructed', 5);
    const receipt = event('received', `'{}'::jsonb`, 'received');
    expect(psqlScalar(`SELECT evidence_level FROM public.project_external_fulfilment_events WHERE id='${receipt}'`)).toBe('reported');
    state('received', 6);
    const installed = event('installed', `'${JSON.stringify({ siteVerification: 'GC measured field conditions', installedUnits: ['k-1','k-2'], acceptance: 'pending' })}'::jsonb`, 'installed');
    state('received', 7);
    actor(gc, `public.verify_external_fulfilment_event('${installed}','e4-verify-installed')`);
    expect(psqlRow(`SELECT evidence_level,verified_by FROM public.project_external_fulfilment_events WHERE id='${installed}'`)).toEqual(['verified',gc]);
    state('installed', 7);
    await page.goto(`/doc/${project}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
    const pkg = page.locator(`[data-cabinet-package="${fulfilment}"]`);
    await expect(pkg).toContainText('installed');
    await expect(pkg.locator('[data-no-studio-po]')).toContainText('No studio purchase order');
    await expect(pkg.locator(`[data-hold="${hold}"] [data-held-units]`)).toHaveText('k-3, k-4');
    await expect(pkg.locator(`[data-receipt="${receipt}"]`)).toContainText('Receipt is not acceptance');
    for (const [unit, unitState] of [['k-1','instructed'],['k-3','held']])
      await expect(pkg.locator(`[data-unit="${unit}"]`)).toHaveAttribute('data-unit-state',unitState);

    // The designer-detail alternative still requires current maker evidence and an independent instruction.
    const detail = JSON.parse(actor(designer, `public.create_external_fulfilment('${project}','${edition}','pkg.e4detail','gc_cabinetry',
      ARRAY['p-1'],'${seat}','${id(831)}','e4-detail-create')`)).fulfilmentId;
    expect(psqlRow(`SELECT status,configuration_id FROM public.project_external_fulfilments WHERE id='${detail}'`)).toEqual(['planned',id(831)]);
    const detailContract = JSON.parse(actor(designer, `public.record_external_fulfilment_event('${detail}','contract_reported',
      '{"contractAmountCents":900000,"designerDetail":"pantry elevation","makerVerification":"field dimensions and appliance clearance"}'::jsonb,NULL,'e4-detail-contract')`)).eventId;
    actor(gc, `public.verify_external_fulfilment_event('${detailContract}','e4-detail-verify')`);
    expect(psqlScalar(`SELECT evidence_level FROM public.project_external_fulfilment_events WHERE id='${detailContract}'`)).toBe('verified');
    const detailIssue = JSON.parse(actor(designer, `public.create_plan_issue('${project}','E4 pantry detail issue','e4-detail-issue')`)).issue.id;
    expect(psqlScalar(`SELECT plan_issue_id FROM public.project_external_fulfilment_events WHERE fulfilment_id='${detail}' AND event_kind='package_issued'`)).toBe(detailIssue);
    actor(designer, `public.bind_fulfilment_evidence('${detail}','${id(603)}',ARRAY['p-1'],'e4-detail-bind')`);
    expect(psqlRow(`SELECT covers_plan_issue_id,covers_configuration_snapshot_hash FROM public.project_external_fulfilment_evidence_bindings WHERE fulfilment_id='${detail}'`))
      .toEqual([detailIssue,psqlScalar(`SELECT snapshot_hash FROM public.product_configurations WHERE id='${id(831)}'`)]);
    actor(designer, `public.resolve_coordination_item('${id(603)}',NULL,NULL,'${id(703)}',NULL,NULL)`);
    expect(psqlScalar(`SELECT status FROM public.coordination_item_revisions WHERE id='${id(703)}'`)).toBe('approved');
    const detailMembers = psqlScalar(`SELECT jsonb_build_array(
      (SELECT jsonb_build_object('kind','plan_issue','id',id,'version',issue_number,'sha256',set_checksum) FROM public.plan_issues WHERE id='${detailIssue}'),
      (SELECT jsonb_build_object('kind','product_configuration','id',id,'version',version,'sha256',snapshot_hash) FROM public.product_configurations WHERE id='${id(831)}'),
      (SELECT jsonb_build_object('kind','coordination_item_revision','id',id,'rev',rev_number,'sha256',
        encode(extensions.digest(public._plan_room_canonical_json(jsonb_build_object('decisionId',decision_id,'rev',rev_number,'attachments',attachments,'note',note)),'sha256'),'hex'))
        FROM public.coordination_item_revisions WHERE id='${id(703)}'))::text`);
    const detailManifest = JSON.parse(serviceActor(designer, `public.create_evidence_manifest('${project}','${id(802)}','fabrication_instruction','${detailMembers.replace(/'/g, "''")}'::jsonb,'e4-detail-manifest')`)).manifestId;
    expect(psqlScalar(`SELECT count(*) FROM public.evidence_manifest_members WHERE manifest_id='${detailManifest}'`)).toBe('3');
    const detailInstruction = JSON.parse(actor(designer, `public.record_external_fulfilment_event('${detail}','fabrication_instruction',
      jsonb_build_object('manifestId','${detailManifest}','authorizingPartyId','${seat}'),ARRAY['p-1'],'e4-detail-instruction')`)).eventId;
    expect(psqlRow(`SELECT evidence_route,amount_cents,array_to_string(affected_units,',') FROM public.project_external_fulfilment_events WHERE id='${detailInstruction}'`))
      .toEqual(['shop_drawing','900000','p-1']);
    expect(psqlScalar(`SELECT count(*) FROM public.purchase_orders WHERE project_id='${project}'`)).toBe('0');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(`[data-cabinet-package="${detail}"] [data-route="detail-verification"]`)).toBeVisible({ timeout: 60_000 });
  });

  // DEFECT RC7-E4-1: verified installation terminates a package with an open hardware hold.
  test.fixme('RC7-E4-1: installation must not close a package while held units remain', () => {
    expect(psqlRow(`SELECT f.status, count(h.id) FROM public.project_external_fulfilments f
      JOIN public.project_external_fulfilment_events h ON h.fulfilment_id=f.id AND h.event_kind='hold'
      WHERE f.id='${fulfilment}' AND NOT EXISTS (SELECT 1 FROM public.project_external_fulfilment_events r WHERE r.releases_event_id=h.id)
      GROUP BY f.status`)).toEqual(['received','1']);
  });
});

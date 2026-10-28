/**
 * RC-2 consumer journey, designer legs (SQ-2329, repaired SQ-2337; A20–A23, X08).
 *
 * Opt-in only. The `.journey.ts` name keeps it out of every default Playwright
 * discovery, and only `playwright.consumer-journey.config.ts` matches it.
 * Run the whole journey with run-consumer-journey.mjs (this directory), which
 * starts and proves an owned stack, runs the five legs in order against it,
 * and tears it down:
 *
 *   1. designer  @rc2-send      fixture + evidence upload; request 1 (evidence set 1) + V22 Send
 *   2. client    @rc2-return    client returns request 1
 *   3. designer  @rc2-resend    request 2 on the revised evidence set + Send; request 3
 *                               supersedes the open request 2 + Send
 *   4. client    @rc2-accept    partner accepts request 3; held at one of two; client
 *                               accepts with a condition
 *   5. designer  @rc2-complete  complete, resolve the condition, care return, revoke
 *
 * Lifecycle, address, response and completion rows are only ever read here.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRow, psqlScalar } from '../helpers/psql';

const CLIENT = 'c2c20000-0000-4000-8000-000000000005';
const CLIENT_EMAIL = 'rc2-client@patina.test';
const SHARED_PORTS = new Set(['54321', '54322']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * The owned stack, as run-consumer-journey.mjs proved it from Docker (the
 * container the CLI labelled with the owned project), never from these URLs.
 * Refuses the shared stack, a non-loopback host or a URL that is not the
 * proven target before anything is written.
 */
function ownedTarget() {
  const env = (key: string) => {
    const value = process.env[key];
    if (!value) throw new Error(`RC2 journey refused: ${key} is not set; run run-consumer-journey.mjs`);
    return value;
  };
  const owned = {
    dbPort: env('RC2_OWNED_DB_PORT'), apiPort: env('RC2_OWNED_API_PORT'),
    serverAddr: env('RC2_OWNED_SERVER_ADDR'), systemId: env('RC2_OWNED_SYSTEM_ID'),
  };
  const db = new URL(env('SUPABASE_DB_URL'));
  const api = new URL(env('NEXT_PUBLIC_SUPABASE_URL'));
  for (const [name, url, port] of [['database', db, owned.dbPort], ['API', api, owned.apiPort]] as const) {
    if (!LOOPBACK.has(url.hostname)) throw new Error(`RC2 journey refused: ${name} host ${url.hostname} is not loopback`);
    if (SHARED_PORTS.has(url.port) || SHARED_PORTS.has(port)) {
      throw new Error(`RC2 journey refused: ${name} port ${url.port} is the shared Supabase stack`);
    }
    if (url.port !== port) throw new Error(`RC2 journey refused: ${name} port ${url.port} is not the owned ${port}`);
  }
  return { ...owned, dbUrl: db.toString(), apiUrl: api.origin, serviceKey: env('SUPABASE_SERVICE_ROLE_KEY') };
}

/** A small, valid one-page PDF naming the fictional sheet. */
function pdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** Upload the two drawing prints through the Storage API, then apply the fixture. */
async function applyFixture(): Promise<{ rc2_job: string; manifests: Record<string, string> }> {
  const owned = ownedTarget();
  // A uuid run folder: project-documents policies cast the first path segment
  // to uuid, and one non-uuid folder fails every list of the bucket. The job id
  // is minted by countersign inside the fixture, so the files cannot sit
  // under <job>/ and stay out of the job's stored-document picker.
  const run = randomUUID();
  const files = [
    { path: `${run}/rc2-journey/a-101.pdf`, body: pdf(`RC2 fictional A-101 Living room plan ${run}`) },
    { path: `${run}/rc2-journey/a-201.pdf`, body: pdf(`RC2 fictional A-201 Living room elevations ${run}`) },
  ];
  for (const file of files) {
    const response = await fetch(`${owned.apiUrl}/storage/v1/object/project-documents/${file.path}`, {
      method: 'POST', body: new Uint8Array(file.body),
      headers: { Authorization: `Bearer ${owned.serviceKey}`, apikey: owned.serviceKey, 'Content-Type': 'application/pdf' },
    });
    expect(response.status, `upload ${file.path}: ${await response.clone().text()}`).toBe(200);
  }
  const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex');
  const out = execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-v', `owned_port=${owned.dbPort}`, '-v', `owned_server_addr=${owned.serverAddr}`,
    '-v', `owned_system_id=${owned.systemId}`,
    '-v', `evidence_path_1=${files[0]!.path}`, '-v', `evidence_sha_1=${sha(files[0]!.body)}`,
    '-v', `evidence_path_2=${files[1]!.path}`, '-v', `evidence_sha_2=${sha(files[1]!.body)}`,
    owned.dbUrl, '-f', path.join(__dirname, 'consumer-journey-fixture.sql')], { encoding: 'utf8' });
  console.log('[RC2 fixture]', out.trim());
  return JSON.parse(out.trim().split('\n').pop()!);
}

/** The newest RC2 job: each fixture application composes a fresh one. */
function job(): string {
  const id = psqlScalar(`SELECT id FROM public.projects WHERE client_id='${CLIENT}' ORDER BY created_at DESC LIMIT 1;`);
  expect(id, 'RC2 job exists').toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

/** The fixture's evidence sets: 'rc2-sa-1' (issue 1) and 'rc2-sa-2' (revised issue 2). */
function evidenceSet(project: string, key: 'rc2-sa-1' | 'rc2-sa-2'): string {
  const id = psqlScalar(`SELECT id FROM public.evidence_manifests WHERE project_id='${project}'
    AND purpose='service_acceptance' AND idempotency_key='${key}';`);
  expect(id, `evidence set ${key}`).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

/** The job's one active (agreed) scope edition: [id, edition_number]. */
function agreedEdition(project: string): string[] {
  const rows = psqlScalar(`SELECT string_agg(id || '|' || edition_number, E'\\n') FROM public.project_scope_editions
    WHERE project_id='${project}' AND status='active';`).split('\n').filter(Boolean);
  expect(rows, 'one active scope edition').toHaveLength(1);
  return rows[0]!.split('|');
}

/** [id, lifecycle, aggregate_outcome, outbound_draft_id, superseded_reason, request_number] newest first. */
function requests(project: string): string[][] {
  return psqlScalar(`SELECT string_agg(concat_ws('|', id, lifecycle, aggregate_outcome, outbound_draft_id,
      COALESCE(superseded_reason, '-'), request_number), E'\\n' ORDER BY created_at DESC)
    FROM public.service_acceptance_requests WHERE project_id='${project}';`)
    .split('\n').filter(Boolean).map((line) => line.split('|'));
}

/** The send-time evidence snapshot of a request: member titles and pinned files, in order. */
function snapshot(request: string): { members: string[]; files: string[] } {
  return JSON.parse(psqlScalar(`SELECT json_build_object(
      'members', COALESCE((SELECT json_agg(member_kind || ':' || title ORDER BY ordinal)
        FROM public.service_acceptance_evidence_snapshots WHERE request_id='${request}'), '[]'),
      'files', COALESCE((SELECT json_agg(bucket_id || '/' || object_name ORDER BY ordinal, object_name)
        FROM public.service_acceptance_evidence_snapshot_objects WHERE request_id='${request}'), '[]'));`));
}

function manifestFiles(manifest: string): string[] {
  return JSON.parse(psqlScalar(`SELECT COALESCE(json_agg('project-documents/' || path ORDER BY path), '[]')
    FROM public._service_acceptance_evidence_documents('${manifest}');`));
}

async function openCloseout(page: Page, project: string) {
  await page.goto(`/doc/${project}`);
  const section = page.locator('[data-service-acceptance]');
  await expect(section).toBeAttached({ timeout: 120_000 });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText('Reading service acceptance…')).toHaveCount(0, { timeout: 60_000 });
  return section;
}

/**
 * Draft through the UI on the chosen evidence set, then V22: Ready to send
 * shows the address, Send, and the DB reads `sent` with a dry-run message id,
 * the agreed edition, the chosen set and its send-time snapshot.
 */
async function draftAndSend(page: Page, project: string, before: number, manifest: string) {
  const [edition] = agreedEdition(project);
  const section = await openCloseout(page, project);
  await section.getByLabel('Evidence the client reviews').selectOption(manifest);
  await section.getByRole('button', { name: /^Draft (the|a new) request$/ }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Request drafted.' })).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => requests(project).length, { timeout: 30_000 }).toBe(before + 1);
  const [requestId, lifecycle, , draftId] = requests(project)[0]!;
  expect(lifecycle).toBe('draft');
  expect(psqlRow(`SELECT scope_edition_id, evidence_manifest_id FROM public.service_acceptance_requests
    WHERE id='${requestId}';`), 'request binds the agreed edition and the chosen evidence set').toEqual([edition, manifest]);
  // 00890: the draft is addressed to the project client's profile email.
  expect(psqlRow(`SELECT to_address, status, recipient_kind FROM public.outbound_drafts WHERE id='${draftId}';`))
    .toEqual([CLIENT_EMAIL, 'awaiting_review', 'client']);

  const card = section.locator(`[data-service-acceptance-request="${requestId}"]`);
  await card.getByRole('button', { name: 'Review and send' }).click();
  const sheet = page.getByTestId('ready-to-send-sheet');
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  const row = sheet.locator(`[data-outbound-row="${draftId}"]`);
  await expect(row).toContainText(`To ${CLIENT_EMAIL}`);
  await row.getByRole('checkbox', { name: new RegExp(`to ${CLIENT_EMAIL.replace(/\./g, '\\.')}$`) }).check();
  await sheet.getByRole('button', { name: 'Send the 1 checked' }).click();
  await expect(row.locator('[data-outbound-row-state]')).toHaveText('Sent', { timeout: 90_000 });

  // DB readback: V22 reached `sent` and the request went out (no hand-set rows).
  await expect.poll(() => psqlScalar(`SELECT status FROM public.outbound_drafts WHERE id='${draftId}';`),
    { timeout: 60_000 }).toBe('sent');
  await expect.poll(() => psqlScalar(`SELECT lifecycle FROM public.service_acceptance_requests WHERE id='${requestId}';`),
    { timeout: 30_000 }).toBe('sent');
  // The functions env is EMAIL_DEV_MODE=dry_run: send-email returns dryrun_<ms>
  // before any provider preparation, and the delivery records that id.
  expect(psqlScalar(`SELECT delivery_message_id FROM public.outbound_drafts WHERE id='${draftId}';`),
    'delivery id is a dry-run id, never a provider message').toMatch(/^dryrun_\d+$/);
  const readback = psqlScalar(`SELECT json_build_object('request', r.id, 'number', r.request_number,
      'lifecycle', r.lifecycle, 'sentAt', r.sent_at, 'scopeEdition', r.scope_edition_id, 'manifest', r.evidence_manifest_id,
      'editionActive', e.status = 'active', 'scopeHashMatches', r.scope_content_hash = e.content_hash,
      'manifestHashMatches', r.evidence_manifest_hash = m.manifest_hash,
      'requiredSigners', (SELECT count(*) FROM public.service_acceptance_signers s
        WHERE s.request_id = r.id AND s.required AND s.status = 'active'),
      'draft', json_build_object('id', d.id, 'status', d.status, 'to', d.to_address, 'sentAt', d.sent_at,
        'deliveryMessageId', d.delivery_message_id))
    FROM public.service_acceptance_requests r JOIN public.project_scope_editions e ON e.id = r.scope_edition_id
    JOIN public.evidence_manifests m ON m.id = r.evidence_manifest_id
    JOIN public.outbound_drafts d ON d.id = r.outbound_draft_id WHERE r.id = '${requestId}';`);
  console.log('[RC2 send readback]', readback);
  expect(JSON.parse(readback)).toMatchObject({ lifecycle: 'sent', scopeEdition: edition, manifest, editionActive: true,
    scopeHashMatches: true, manifestHashMatches: true, requiredSigners: 2, draft: { status: 'sent', to: CLIENT_EMAIL } });
  // The send froze the chosen set's issued drawings and every file behind them.
  const frozen = snapshot(requestId);
  console.log('[RC2 evidence snapshot]', JSON.stringify(frozen));
  expect(frozen.files, 'every print file of the set is pinned').toEqual(manifestFiles(manifest));
  return { requestId, frozen };
}

test.describe('RC-2 consumer journey — designer', () => {
  test.setTimeout(300_000);

  // The fixture creates the F01 designer, so it must run before the
  // authenticatedPage fixture signs in: a beforeAll scoped to this leg alone.
  test.describe('send', () => {
    let fixture: Awaited<ReturnType<typeof applyFixture>>;
    test.beforeAll(async () => {
      fixture = await applyFixture();
    });

    test('@rc2-send drafts the request against the agreed edition and evidence set, and sends it through V22', async ({
      authenticatedPage: page,
    }) => {
      const project = job();
      expect(project).toBe(fixture.rc2_job);
      expect(requests(project)).toHaveLength(0);
      const { frozen } = await draftAndSend(page, project, 0, evidenceSet(project, 'rc2-sa-1'));
      expect(frozen.members).toEqual(['plan_issue:RC2 fictional drawing set']);
      expect(frozen.files).toHaveLength(1);
    });
  });

  test('@rc2-resend sends the revised evidence set after the return, and a successor supersedes the open request', async ({
    authenticatedPage: page,
  }) => {
    const project = job();
    const [first] = requests(project);
    // 00886: a decided outcome closes the request ((lifecycle='closed') = (outcome<>'pending')).
    expect(first?.slice(1, 3), 'request 1 was returned by the client leg').toEqual(['closed', 'returned']);
    const firstFiles = snapshot(first![0]!).files;
    // A20: a return needs a new request on new evidence, never a reopened one.
    const revised = evidenceSet(project, 'rc2-sa-2');
    expect(revised).not.toBe(psqlScalar(`SELECT evidence_manifest_id FROM public.service_acceptance_requests
      WHERE id='${first![0]}';`));
    const second = await draftAndSend(page, project, 1, revised);
    expect(second.frozen.members).toEqual(['plan_issue:RC2 fictional drawing set, revised']);
    expect(second.frozen.files, 'the revised set adds the elevations print').toHaveLength(2);
    expect(second.frozen.files).toEqual(expect.arrayContaining(firstFiles));
    // Supersession: drafting again while request 2 is open replaces it.
    const third = await draftAndSend(page, project, 2, revised);
    const rows = requests(project);
    expect(rows.map((row) => row[0])).toEqual([third.requestId, second.requestId, first![0]]);
    expect(rows[1]!.slice(1, 3)).toEqual(['superseded', 'pending']);
    expect(rows[1]![4]).toBe('successor_request');
    expect(rows[2]!.slice(1, 3)).toEqual(['closed', 'returned']);
    expect(psqlScalar(`SELECT predecessor_request_id FROM public.service_acceptance_requests WHERE id='${third.requestId}';`))
      .toBe(second.requestId);
    const section = await openCloseout(page, project);
    await expect(section.locator(`[data-service-acceptance-request="${second.requestId}"]`))
      .toContainText('Replaced because a newer request took its place.');
  });

  test('@rc2-complete completes the service, resolves the condition, returns from care, and revokes', async ({
    authenticatedPage: page,
  }) => {
    const project = job();
    const [current] = requests(project);
    expect(current?.slice(1, 3), 'request 3 accepted with conditions by the client leg')
      .toEqual(['closed', 'accepted_with_conditions']);
    const [edition, editionNumber] = agreedEdition(project);
    expect(psqlScalar(`SELECT scope_edition_id FROM public.service_acceptance_requests WHERE id='${current![0]}';`),
      'the accepted request is on the agreed edition').toBe(edition);
    const closure = psqlRow(`SELECT status, COALESCE(closure_checklist::text, '-') FROM public.projects WHERE id='${project}';`);

    await openCloseout(page, project);
    const service = page.locator('[data-studio-service]');
    await service.scrollIntoViewIfNeeded();
    // A22: the client's open condition is visible; it does not hide the act (K3 option A).
    await expect(service.getByRole('button', { name: 'Complete studio service' })).toBeEnabled({ timeout: 60_000 });
    await service.getByRole('button', { name: 'Complete studio service' }).click();
    await expect(service.locator('[data-studio-service-state="completed_with_conditions"]')).toBeVisible({ timeout: 60_000 });
    expect(psqlRow(`SELECT state, acceptance_request_id, scope_edition_id FROM public.studio_service_completions
      WHERE project_id='${project}' AND revoked_at IS NULL;`), 'completion cites the accepted request and edition')
      .toEqual(['completed_with_conditions', current![0], edition]);
    // A21: service completion is not project closure.
    expect(psqlRow(`SELECT status, COALESCE(closure_checklist::text, '-') FROM public.projects WHERE id='${project}';`))
      .toEqual(closure);

    const open = service.locator('[data-open-condition]').first();
    await open.getByRole('button', { name: 'Resolve this condition' }).click();
    const form = service.getByRole('form', { name: /^Resolve: / });
    await form.getByLabel('How it was resolved').fill('Fictional: confirmed on site with the client.');
    const picker = form.getByRole('combobox');
    await picker.selectOption({ index: 1 });
    await form.getByRole('button', { name: 'Record the resolution' }).click();
    await expect(service.locator('[data-open-condition]')).toHaveCount(0, { timeout: 60_000 });
    expect(psqlScalar(`SELECT count(*) FROM public.service_acceptance_condition_resolutions
      WHERE request_id='${current![0]}';`)).toBe('1');

    // A23: care references name the accepted edition and request, and return to Closeout.
    const care = service.locator('[data-care-references]');
    await expect(care).toContainText(`scope edition ${editionNumber}, in force from`);
    await expect(care).toContainText(`accepted on request ${current![5]}`);
    const opener = care.getByRole('link', { name: 'Open the specification' });
    await opener.click();
    await expect(page).toHaveURL(/unfold=pieces/, { timeout: 60_000 });
    expect(new URL(page.url()).pathname, 'unfolds over the paper, no route change').toBe(`/doc/${project}`);
    const unfold = page.locator('[data-unfold-instrument="pieces"]');
    await expect(unfold).toBeVisible({ timeout: 60_000 });
    // Esc folds back only once the unfold holds focus (ffe-unfold.spec.ts pattern).
    await expect.poll(() => unfold.evaluate((node) => node.contains(document.activeElement)), { timeout: 30_000 }).toBe(true);
    await page.keyboard.press('Escape');
    await expect(unfold).toHaveCount(0, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('unfold')).toBeNull();
    await expect(opener, 'care reference returns to its opener in Closeout').toBeFocused({ timeout: 30_000 });

    await service.getByRole('button', { name: 'Revoke this completion' }).click();
    const revoke = service.getByRole('form', { name: 'Revoke this completion' });
    await revoke.getByLabel('Why it is revoked').fill('Fictional: punch list reopened.');
    await revoke.getByRole('button', { name: 'Revoke' }).click();
    await expect.poll(() => psqlScalar(`SELECT count(*) FROM public.studio_service_completions
      WHERE project_id='${project}' AND revoked_at IS NOT NULL;`), { timeout: 60_000 }).toBe('1');
    const readback = psqlScalar(`SELECT json_agg(json_build_object('completion', c.id, 'state', c.state,
        'request', c.acceptance_request_id, 'scopeEdition', c.scope_edition_id, 'revokedAt', c.revoked_at,
        'revokeReason', c.revoke_reason))
      FROM public.studio_service_completions c WHERE c.project_id='${project}';`);
    console.log('[RC2 completion readback]', readback);
    expect(psqlRow(`SELECT status, COALESCE(closure_checklist::text, '-') FROM public.projects WHERE id='${project}';`))
      .toEqual(closure);
  });
});

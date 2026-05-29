import { test, expect } from '../fixtures/auth';
import { adminDb, getUserIdByEmail } from '../helpers/supabase-admin';

/**
 * Active Project screens — regression guard.
 *
 * A project activated from a proposal persists a *simplified* phase vocabulary
 * (`current_phase='concept'`, `project_phases.phase_key='concept'`) that is NOT
 * a canonical PhaseSlug. Before the `normalizePhaseSlug` fix, the detail page's
 * ProjectIdentityHeader crashed on `PHASE_CONFIG[phase].color` (AP-C0), and the
 * Phase Timeline rendered every phase as "pending" (AP-C4). The mock fixtures
 * dodged this by using canonical phases, so the bug was invisible.
 *
 * This suite seeds exactly that shape via the service role (owned by the
 * signed-in designer so the scoped projects RLS — AP-SEC1 — admits it), then
 * drives the detail screen and every sub-route as the real owner.
 */

const SUB_ROUTES = ['', '/edit', '/decisions', '/ffe', '/financials', '/scope-change', '/complete'];

const CRASH_RE = /Cannot read propert|reading 'color'|undefined is not an object/i;

test.describe('Active Project screens', () => {
  let projectId: string;

  test.beforeAll(async () => {
    const designerId = await getUserIdByEmail('designer@patina.dev');
    const clientId = await getUserIdByEmail('client@patina.dev');

    // The dev seed historically left profiles.full_name empty (handle_new_user
    // pre-creates a bare profile; the seed used ON CONFLICT DO NOTHING — fixed
    // in dev-accounts.sql). Ensure names exist so the client-name assertion is
    // deterministic regardless of live-DB drift.
    await adminDb.from('profiles').update({ full_name: 'Client User', display_name: 'Client User' }).eq('id', clientId);
    await adminDb.from('profiles').update({ full_name: 'Designer User', display_name: 'Designer User' }).eq('id', designerId);

    const { data, error } = await adminDb
      .from('projects')
      .insert({
        name: 'QA Active Project (e2e)',
        created_by: designerId,
        designer_id: designerId,
        client_id: clientId,
        status: 'active',
        current_phase: 'concept', // non-canonical → guards AP-C0
        budget_cents: 500000,
        design_fee_cents: 200000,
        total_amount_cents: 700000,
        committed_cents: 0,
        actual_cents: 0,
        start_date: '2026-05-20',
        target_end_date: '2026-08-20',
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed project failed: ${error.message}`);
    projectId = data.id as string;

    // Non-canonical phase keys here too (guards the AP-C4 timeline mapping).
    const { error: phaseErr } = await adminDb.from('project_phases').insert([
      { project_id: projectId, phase_key: 'concept', name: 'Concept & Design', status: 'in_progress', progress: 40, duration_weeks: 4, sort_order: 0, start_date: '2026-05-20', target_end_date: '2026-06-20' },
      { project_id: projectId, phase_key: 'procurement', name: 'Procurement & Install', status: 'pending', progress: 0, duration_weeks: 8, sort_order: 1 },
    ]);
    if (phaseErr) throw new Error(`seed phases failed: ${phaseErr.message}`);

    // Documents + tasks now live in Supabase public tables (00169), read
    // directly by the portal (previously the disconnected svc_projects store →
    // mock fallback). Seed one of each to assert the wiring end-to-end.
    const { error: docErr } = await adminDb.from('project_documents').insert({
      project_id: projectId, title: 'QA Service Agreement', doc_type: 'pdf',
      category: 'contract', size_bytes: 512000, version: 'v1.0', status: 'signed',
    });
    if (docErr) throw new Error(`seed document failed: ${docErr.message}`);
    const { error: taskErr } = await adminDb.from('project_tasks').insert({
      project_id: projectId, phase_key: 'concept', title: 'QA Present concept storyboards',
      status: 'todo', sort_order: 0,
    });
    if (taskErr) throw new Error(`seed task failed: ${taskErr.message}`);
  });

  test.afterAll(async () => {
    if (projectId) {
      await adminDb.from('project_phases').delete().eq('project_id', projectId);
      await adminDb.from('projects').delete().eq('id', projectId);
    }
  });

  test('detail renders without crashing on a non-canonical phase (AP-C0)', async ({ authenticatedPage: page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(`/portal/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    expect(pageErrors.filter((m) => CRASH_RE.test(m)), `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    await expect(page.getByRole('heading', { name: /QA Active Project/i })).toBeVisible();
    // 'concept' must normalize to the canonical 'concept_development' label.
    await expect(page.getByText('Schematic Design', { exact: false }).first()).toBeVisible();
  });

  test('detail header shows the client name with no dangling separator (AP-C1)', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Client User', { exact: false }).first()).toBeVisible();
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toMatch(/(^|\n)\s*·\s*Started/);
  });

  test('detail shows real documents + tasks from Supabase, not mock (backend)', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    // DocumentGrid (project_documents) and PhaseTimelineV2 tasks (project_tasks).
    await expect(page.getByText('QA Service Agreement', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('QA Present concept storyboards', { exact: false }).first()).toBeVisible();
  });

  for (const route of SUB_ROUTES) {
    test(`sub-route "${route || '/'}" loads without a runtime crash`, async ({ authenticatedPage: page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      const resp = await page.goto(`/portal/projects/${projectId}${route}`);
      await page.waitForLoadState('networkidle');
      expect(resp?.status() ?? 200, `HTTP status for ${route || '/'}`).toBeLessThan(500);
      expect(pageErrors, `page errors on ${route || '/'}: ${pageErrors.join(' | ')}`).toHaveLength(0);
    });
  }
});

test.describe('Projects list', () => {
  test('renders seeded active projects with real client names (AP-A1)', async ({ authenticatedPage: page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto('/portal/projects');
    await page.waitForLoadState('networkidle');
    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    // The seeded designer owns "Aspen Loft Refresh" with client "Client User".
    await expect(page.getByText('Aspen Loft Refresh', { exact: false }).first()).toBeVisible();
  });
});

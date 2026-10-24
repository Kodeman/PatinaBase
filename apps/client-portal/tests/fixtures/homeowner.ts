import { expect, type Page, type Locator } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const LOCAL = 'http://127.0.0.1:54321';
const DESIGNER = 'a0000000-0000-0000-0000-000000000004';
const PASSWORD = 'password123';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export function admin() {
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Export the LOCAL service key').toBeTruthy();
  return createClient(LOCAL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
export async function checked<T extends { data: unknown; error: unknown }>(result: PromiseLike<T>): Promise<T["data"]> {
  const { data, error } = await result;
  expect(error).toBeNull();
  return data;
}
export async function actor(email: string) {
  const client = createClient(LOCAL, ANON, { auth: { persistSession: false } });
  await checked(client.auth.signInWithPassword({ email, password: PASSWORD }));
  return client;
}
export interface Household { id: string; email: string; studio: string; project: string | null; client: SupabaseClient }
export async function household(withProject = false): Promise<Household> {
  const db = admin();
  const email = `cpux-${randomUUID()}@patina.dev`;
  const created = await checked(db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true,
    user_metadata: { full_name: 'Synthetic Homeowner', role: 'homeowner' } }));
  const id = created.user!.id;
  await checked(db.from('profiles').update({ role: 'homeowner', full_name: 'Synthetic Homeowner' }).eq('id', id));
  await checked(db.from('designer_clients').insert({ designer_id: DESIGNER, client_id: id,
    client_name: 'Synthetic Homeowner', client_email: email, status: 'active' }));
  const identity = await checked(db.rpc('resolve_studio_identity', { p_designer_id: DESIGNER }));
  const studio = (Array.isArray(identity) ? identity[0] : identity).studio_id as string;
  const project = withProject ? randomUUID() : null;
  if (project) await checked(db.from('projects').insert({ id: project, name: 'Synthetic homeowner house',
    designer_id: DESIGNER, client_id: id, created_by: DESIGNER, studio_id: studio,
    status: 'active', current_phase: null, budget_cents: 0, design_fee_cents: 0, client_visibility_tier: 'milestone' }));
  return { id, email, studio, project, client: await actor(email) };
}
export async function invoice(house: Household, cents: number, due: string | null, status = 'sent', currency = 'USD') {
  const db = admin();
  const id = randomUUID();
  await checked(db.from('invoices').insert({ id, project_id: house.project, studio_id: house.studio,
    designer_id: DESIGNER, client_id: house.id, invoice_number: `CPUX-${id.slice(0, 8)}`,
    title: `Synthetic invoice ${id.slice(0, 8)}`, status: 'draft', issue_date: '2026-10-01', due_date: due,
    currency, subtotal_cents: cents, tax_cents: 0, tax_rate: 0, total_cents: cents, amount_paid_cents: 0 }));
  if (status !== 'draft') await checked(db.from('invoices').update({ status, sent_at: new Date().toISOString() }).eq('id', id));
  return id;
}
export async function signIn(page: Page, house: Household, path = '/') {
  await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(path)}`);
  const password = page.getByLabel(/password/i).first();
  await expect(async () => {
    if (!await password.isVisible()) await page.getByRole('button', { name: /sign in with email|use (?:email and )?password instead|use a password instead/i }).first().click();
    await expect(password).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 60000 });
  await page.getByLabel(/email/i).first().fill(house.email);
  await password.fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(url => !url.pathname.includes('/auth/signin'), { timeout: 60000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('threshold-hold')).toHaveCount(0, { timeout: 90000 });
  const asks = page.getByRole('link', { name: /\$|Nothing from|Please check|invoices are/ });
  if (await asks.count() && !await page.getByRole('dialog').isVisible()) await asks.click();
}
export function row(page: Page, id: string) { return page.locator(`[data-testid="invoice-row"][data-invoice-id="${id}"]`); }
export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
export async function targetSize(control: Locator) {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  const name = await control.evaluate(node => node.getAttribute('aria-label') || node.textContent || node.tagName);
  expect(box!.height, `${name}: target height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${name}: target width`).toBeGreaterThanOrEqual(44);
}
export async function approval(house: Household) {
  const db = admin();
  const studio = await actor('designer@patina.dev');
  const createdPhase = await checked(studio.rpc('create_project_phase', { p_project_id: house.project,
    p_phase_key: `cpux-${randomUUID()}`, p_name: 'Synthetic review', p_sort_order: 0, p_lane: 'thread' }));
  const phase = createdPhase.id;
  const issue = randomUUID();
  await checked(db.from('plan_issues').insert({ id: issue, project_id: house.project, issue_number: 1,
    name: 'Synthetic elevations', idempotency_key: issue, request_hash: 'a'.repeat(64), set_checksum: 'b'.repeat(64),
    sheet_count: 1, created_by: DESIGNER }));
  await checked(studio.rpc('set_project_decision_authority', { p_project_id: house.project,
    p_decision_lead_id: house.id, p_required_coapprover_id: null, p_expected_revision: 0 }));
  const created = await checked(studio.rpc('create_project_approval_decision', { p_project_id: house.project,
    p_payload: { title: 'Synthetic elevations', question: 'Do these synthetic elevations read right?', dueAt: '2099-11-01T12:00:00Z',
      phaseId: phase, sectionKey: 'project', artifactKind: 'plan_issue', artifactId: issue,
      costCentsDelta: 0, scheduleDaysDelta: 0, leadTimeDaysDelta: 0 }, p_idempotency_key: randomUUID() }));
  await checked(house.client.rpc('confirm_project_decision_review', { p_decision_id: created.decisionId,
    p_payload: { authorityRevision: created.authorityRevision, artifactHash: created.artifactHash, reviewMethod: 'portal_clickthrough' },
    p_idempotency_key: randomUUID() }));
  await checked(studio.rpc('publish_client_decision', { p_decision_id: created.decisionId }));
  return created.decisionId as string;
}

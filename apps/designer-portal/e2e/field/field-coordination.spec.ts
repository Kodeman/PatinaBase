import { test, expect } from '../fixtures/auth';
import { adminDb, getUserIdByEmail } from '../helpers/supabase-admin';

/**
 * Field Coordination (Wave 5) — designer-side surfaces.
 *
 * Three vertical slices, each seeded via the service role owned by the signed-in
 * designer (so the scoped RLS admits it), then driven as the real owner:
 *
 *   1. People Room — add a Sub with a phone + the "Text updates" opt-in; the
 *      party row appears with the "Invited" consent chip. (The invite SMS itself
 *      is Track B's dry-run concern — we assert only the party row + consent.)
 *   2. Desk triage — a seeded needs_review sms_messages row surfaces as a Field
 *      triage card in "In the field"; Apply flips the target task to done and
 *      clears the card.
 *   (3. Phase timeline — removed with the band itself in B3; see below.)
 *
 * ENV: uses the LOCAL Supabase demo stack via apps/designer-portal/.env.local
 * (never the prod checkout's env). The stack must have migrations through 00283.
 */

const DESIGNER_EMAIL = 'designer@patina.dev';
const CLIENT_EMAIL = 'client@patina.dev';

// ─────────────────────────────────────────────────────────────────────────────
// 1. People Room — add a Sub with a text opt-in
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Field Coordination · People Room add a sub', () => {
  let projectId: string;
  const PROJECT_NAME = 'FC People Room (e2e)';

  test.beforeAll(async () => {
    const designerId = await getUserIdByEmail(DESIGNER_EMAIL);
    const clientId = await getUserIdByEmail(CLIENT_EMAIL);
    const { data, error } = await adminDb
      .from('projects')
      .insert({
        name: PROJECT_NAME,
        created_by: designerId,
        designer_id: designerId,
        client_id: clientId,
        status: 'active',
        current_phase: 'concept',
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed project failed: ${error.message}`);
    projectId = data.id as string;
  });

  test.afterAll(async () => {
    if (projectId) await adminDb.from('projects').delete().eq('id', projectId);
  });

  test('adds a sub with a phone + consent → the row shows the "Invited" chip', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/people');
    await page.waitForLoadState('networkidle');

    // Open the add sheet from the Room header.
    await page.getByRole('button', { name: /\bAdd\b/ }).first().click();
    // Choose the sub kind (DM-mono page link).
    await page.getByRole('button', { name: 'a sub' }).click();

    // Project (required) + name + phone.
    await page.getByLabel('Project').selectOption({ label: PROJECT_NAME });
    await page.getByPlaceholder('e.g. Sal Moretti').fill('Sal Moretti (e2e)');
    await page.getByPlaceholder('(555) 123-4567').fill('555-123-9876');
    // "Text updates" is on by default → the row is written with consent 'pending'.

    await page.getByRole('button', { name: /Add to roster/i }).click();

    // The Directory lands on the Field group with the new party row (the roster
    // row is a button; the inline confirmation band also names them, so target
    // the row specifically).
    const row = page.getByRole('button', { name: /Sal Moretti \(e2e\)/ });
    await expect(row).toBeVisible({ timeout: 15_000 });
    // The consent chip reads "Invited" (sms_consent_status = 'pending').
    await expect(row).toContainText('Invited');

    // The party row exists in the DB with consent 'pending'.
    const { data: party } = await adminDb
      .from('project_parties')
      .select('display_name, party_kind, sms_consent_status, phone_e164')
      .eq('project_id', projectId)
      .eq('party_kind', 'sub')
      .maybeSingle();
    expect(party?.sms_consent_status).toBe('pending');
    expect(party?.phone_e164).toBe('+15551239876');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Desk triage — apply a needs_review field text
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Field Coordination · Desk triage', () => {
  let projectId: string;
  let partyId: string;
  let taskId: string;
  let messageId: string;
  let conversationId: string;
  // A run-unique phone so the sms_conversations (twilio_number, phone_e164)
  // UNIQUE never collides with a prior run's conversation (which survives a
  // project delete — active_project_id is ON DELETE SET NULL, not cascade).
  const last4 = String(Date.now()).slice(-4);
  const rawPhone = `555-123-${last4}`;

  test.beforeAll(async () => {
    const designerId = await getUserIdByEmail(DESIGNER_EMAIL);
    const clientId = await getUserIdByEmail(CLIENT_EMAIL);

    // The apply path resolves a designer↔client relationship for some effects;
    // mark_done on a task does not need it, but seed a project the designer owns.
    const { data: proj, error: projErr } = await adminDb
      .from('projects')
      .insert({
        name: 'FC Triage (e2e)',
        created_by: designerId,
        designer_id: designerId,
        client_id: clientId,
        status: 'active',
        current_phase: 'concept',
      })
      .select('id')
      .single();
    if (projErr) throw new Error(`seed project failed: ${projErr.message}`);
    projectId = proj.id as string;

    // A granted sub party with a phone (trigger derives phone_e164).
    const { data: party, error: partyErr } = await adminDb
      .from('project_parties')
      .insert({
        project_id: projectId,
        party_kind: 'sub',
        display_name: 'Sal Moretti',
        trade: 'plumbing',
        phone: rawPhone,
        sms_consent_status: 'granted',
      })
      .select('id, phone_e164')
      .single();
    if (partyErr) throw new Error(`seed party failed: ${partyErr.message}`);
    partyId = party.id as string;

    // A task owned by that party (the effect's target).
    const { data: task, error: taskErr } = await adminDb
      .from('project_tasks')
      .insert({
        project_id: projectId,
        title: 'Rough-in plumbing',
        owner: 'sub',
        owner_party_id: partyId,
        status: 'todo',
      })
      .select('id')
      .single();
    if (taskErr) throw new Error(`seed task failed: ${taskErr.message}`);
    taskId = task.id as string;

    // A conversation + a needs_review inbound text parked with a mark_done parse.
    const { data: convo, error: convoErr } = await adminDb
      .from('sms_conversations')
      .insert({
        twilio_number: '+15550001111',
        phone_e164: party.phone_e164,
        party_id: partyId,
        active_project_id: projectId,
      })
      .select('id')
      .single();
    if (convoErr) throw new Error(`seed conversation failed: ${convoErr.message}`);
    conversationId = convo.id as string;

    const { data: msg, error: msgErr } = await adminDb
      .from('sms_messages')
      .insert({
        conversation_id: convo.id,
        direction: 'inbound',
        body: 'rough-in is done',
        party_id: partyId,
        project_id: projectId,
        needs_review: true,
        confidence: 0.6,
        parsed_intent: { type: 'mark_done', target: { kind: 'task', id: taskId } },
      })
      .select('id')
      .single();
    if (msgErr) throw new Error(`seed message failed: ${msgErr.message}`);
    messageId = msg.id as string;
  });

  test.afterAll(async () => {
    // The conversation survives a project delete (active_project_id SET NULL),
    // so delete it explicitly (messages cascade) before the project.
    if (conversationId) await adminDb.from('sms_conversations').delete().eq('id', conversationId);
    if (projectId) await adminDb.from('projects').delete().eq('id', projectId);
  });

  test('shows the triage card, Apply flips the task to done and clears it', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/desk');
    await page.waitForLoadState('networkidle');

    // "In the field" surfaces the triage card with the message + proposed effect.
    const field = page.getByRole('region', { name: 'In the field' });
    await expect(field.getByText('rough-in is done')).toBeVisible({ timeout: 30_000 });
    await expect(field.getByText(/Mark .*Rough-in plumbing.* done/)).toBeVisible();

    await field.getByRole('button', { name: /^Apply$/ }).click();

    // The card clears (the queue re-reads and the row is no longer needs_review).
    await expect(field.getByText('rough-in is done')).toBeHidden({ timeout: 15_000 });

    // The task flipped to done; the message is marked reviewed.
    const { data: task } = await adminDb
      .from('project_tasks')
      .select('status')
      .eq('id', taskId)
      .single();
    expect(task?.status).toBe('done');
    const { data: msg } = await adminDb
      .from('sms_messages')
      .select('needs_review, reviewed_at')
      .eq('id', messageId)
      .single();
    expect(msg?.needs_review).toBe(false);
    expect(msg?.reviewed_at).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Phase timeline — REMOVED (B3). The band this exercised (the "Phase
//    timeline" region, its per-phase start/target-end date inputs, its Save)
//    went with `phase-timeline.tsx`. Phase dates are edited on the Rule's
//    draggable bars now and committed through the schedule confirm strip;
//    re-covering that path needs a drag/keyboard + confirm-strip walk, which
//    is its own piece of work rather than a rename of this one.
// ─────────────────────────────────────────────────────────────────────────────

import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';
import { adminDb } from '../helpers/supabase-admin';

/**
 * BRING FORWARD — Leah's fifth task (SPEC §5.7, CRM-24, PR-b).
 *
 *   "Bring Dana, Pete, Ingrid and the Stonehaven rep onto Okonkwo. Each
 *    arrives with current consent, document status and one history line,
 *    never with old pricing."
 *
 * The seed already seats those four on the Okonkwo residence — that is the
 * fixture's whole point — so a spec that brought them THERE would only ever
 * read "already on the call sheet". This one opens a fresh job in the same
 * studio, searches the PRIOR JOB by name ("Lindqvist"), ticks four, confirms
 * ONCE, and then asks the database what actually landed.
 *
 * What it asserts, beyond four seats:
 *   · the travel-list pane names what travels and what stays behind;
 *   · Pete Rusk arrives OPTED OUT, with no consent row written by the act —
 *     the record is keyed on his number and was already there (R-AY);
 *   · Northgate Electric's lapse is named in the consequence sentence, out of
 *     `studio_compliance_notices`, which the nightly sweep writes (00630);
 *   · no seat carries prior pricing, prior notes or `show_to_client`.
 *
 * Chromium-pinned: this writes seats for one shared seeded designer, and the
 * three browser projects run in parallel as the same user.
 */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'single-actor: the three browser projects would race the same seeded designer',
);

const OKONKWO = 'd0e00000-0000-0000-0000-00000000000a';
const DESIGNER = 'a0000000-0000-0000-0000-000000000004';
const CARDS = {
  dana: 'd0e10000-0000-0000-0000-000000000011',
  pete: 'd0e10000-0000-0000-0000-000000000012',
  ingrid: 'd0e10000-0000-0000-0000-000000000013',
  claire: 'd0e10000-0000-0000-0000-000000000020',
};

let projectId: string;
let projectName: string;

test.beforeAll(async () => {
  // 00630's nightly sweep, run once so the lapse the studio has been told
  // about has a notice row behind it. The clause the picker prints is the
  // sweep's sentence, not a re-derivation of it.
  const { error: sweepError } = await adminDb.rpc('sweep_compliance_expiries');
  if (sweepError) throw sweepError;

  const seed = await adminDb
    .from('projects')
    .select('designer_id, studio_id, client_id, created_by, status')
    .eq('id', OKONKWO)
    .single();
  if (seed.error) throw seed.error;

  projectName = `Bring forward ${Date.now().toString(36).slice(-5)}`;
  const { data, error } = await adminDb
    .from('projects')
    .insert({
      name: projectName,
      title: projectName,
      designer_id: seed.data.designer_id ?? DESIGNER,
      studio_id: seed.data.studio_id,
      client_id: seed.data.client_id ?? 'bring-forward-e2e',
      created_by: seed.data.created_by ?? DESIGNER,
      status: seed.data.status,
    })
    .select('id')
    .single();
  if (error) throw error;
  projectId = data.id;
});

test.afterAll(async () => {
  if (!projectId) return;
  const { data: seats } = await adminDb
    .from('project_parties')
    .select('id')
    .eq('project_id', projectId);
  for (const seat of seats ?? []) {
    await adminDb
      .from('project_party_authority')
      .delete()
      .eq('engagement_id', seat.id);
  }
  await adminDb.from('project_parties').delete().eq('project_id', projectId);
  await adminDb.from('projects').delete().eq('id', projectId);
});

async function openThePicker(page: import('@playwright/test').Page) {
  await page.goto(`/doc/${projectId}`, { waitUntil: 'domcontentloaded' });
  const instrument = page.locator('[data-action-key="open-call-sheet"]');
  await expect(instrument).toBeVisible({ timeout: 30_000 });
  await instrument.click();
  await expect(page.getByText(`Call sheet · ${projectName}`)).toBeVisible({
    timeout: 30_000,
  });
  await page.locator('[data-action-key="open-rolodex-picker"]').click();
  await expect(page.getByText('From the rolodex')).toBeVisible({
    timeout: 30_000,
  });
}

test('task 5 — search the prior job, tick four, one confirm', async ({
  authenticatedPage: page,
}) => {
  await openThePicker(page);

  // SPEC §5.7 #5 — the travel list is on the face BEFORE anything is ticked.
  const travel = page.locator('[data-travel-list]');
  await expect(travel).toContainText('What travels');
  await expect(travel).toContainText('consent by channel value');
  await expect(travel).toContainText('document expiries');
  await expect(travel).toContainText('What stays behind');
  await expect(travel).toContainText('prior pricing');
  await expect(travel).toContainText('show to client');

  // SPEC §5.7 #3 — the search field takes the PRIOR JOB, not a person.
  await page.getByLabel('Search the rolodex').fill('Lindqvist');
  const rows = page.locator('[data-pick-mark]');
  await expect
    .poll(async () => rows.count(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(4);

  // The history line carries the repeat count and the year the job CLOSED,
  // and never a verdict (PR-i).
  await expect(
    page.getByText(/Worked 1 prior project, Lindqvist kitchen, closed 2025\./).first(),
  ).toBeVisible();

  // Pete arrives carrying his refusal, before a seat exists (F-12).
  await expect(page.locator('[data-carried-consent]').first()).toContainText(
    'Opted out by text, 3 Dec 2025',
  );

  for (const name of [
    'Dana Kowalski',
    'Pete Rusk',
    'Ingrid Halvorsen',
    'Claire Bissett',
  ]) {
    await page.getByRole('checkbox', { name: new RegExp(name) }).click();
  }

  await expect(page.locator('[data-pick-count]')).toContainText(
    '4 of 5 from the Lindqvist kitchen selected',
  );

  // SPEC §5.7 #7 — the consequence sentence, directly under the act row.
  const consequence = page.locator('[data-bring-forward-consequence]');
  await expect(consequence).toContainText(`Adds four seats to the ${projectName}.`);
  await expect(consequence).toContainText('Pete Rusk arrives opted out of texting.');
  await expect(consequence).toContainText('Northgate Electric');
  await expect(consequence).toContainText('insurance lapsed 31 March 2026.');

  // ONE confirm.
  await page.getByRole('button', { name: 'Add four to the roster' }).click();

  await expect
    .poll(
      async () => {
        const { data } = await adminDb
          .from('project_parties')
          .select('id')
          .eq('project_id', projectId);
        return data?.length ?? 0;
      },
      { timeout: 20_000 },
    )
    .toBe(4);

  const { data: seats, error } = await adminDb
    .from('project_parties')
    .select(
      'display_name, trade, studio_contact_id, company_id, show_to_client, bid_outcome, bid_amount_cents, sms_consent_status',
    )
    .eq('project_id', projectId);
  if (error) throw error;

  // Every seat is stamped with the card the live facts hang off (PR-b).
  expect(
    (seats ?? []).map((s) => s.studio_contact_id).sort(),
  ).toEqual([CARDS.dana, CARDS.pete, CARDS.ingrid, CARDS.claire].sort());

  // Nothing about prior pricing, prior notes or client visibility travelled.
  for (const seat of seats ?? []) {
    expect(seat.show_to_client).toBe(false);
    expect(seat.bid_outcome).toBeNull();
    expect(seat.bid_amount_cents).toBeNull();
    // R-AS/R-AY: the frozen column is untouched at its default; the verdict
    // lives on the record.
    expect(seat.sms_consent_status).toBe('not_asked');
  }

  // Pete's seat reads his refusal off the RECORD, with no consent write of
  // this act's own.
  await expect
    .poll(
      async () => {
        const { data } = await adminDb
          .from('people_directory_seats')
          .select('consent_status')
          .eq('project_id', projectId)
          .eq('studio_contact_id', CARDS.pete)
          .maybeSingle();
        return data?.consent_status ?? null;
      },
      { timeout: 20_000 },
    )
    .toBe('opted_out');

  const { data: records } = await adminDb
    .from('studio_channel_consent')
    .select('origin_project_id')
    .eq('channel_value', '+16125550112');
  // One record, still pointing at the job it was recorded on.
  expect(records?.length).toBe(1);
  expect(records?.[0].origin_project_id).not.toBe(projectId);
});

test('Put back clears the pick and writes nothing', async ({
  authenticatedPage: page,
}) => {
  await openThePicker(page);
  await page.getByLabel('Search the rolodex').fill('Lindqvist');
  await page.getByRole('checkbox', { name: /Dana Kowalski/ }).click();
  await expect(
    page.getByRole('button', { name: 'Add one to the roster' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Put back' }).click();
  await expect(
    page.getByRole('button', { name: 'Add no to the roster' }),
  ).toBeVisible();
});

import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const proposal = 'f9830000-0000-4000-8000-000000000001';
const owner = 'f0180000-0000-4000-8000-000000000002';
const studio = 'f0180000-0000-4000-8000-000000000001';
const title = 'B04 Fictional Inactive Scope Reading';
const choices = [
  'Full service with a building team', 'Cabinetry-focused commission',
  'Furnishings with mixed buying', 'Design-only/client implementation',
];
const responsibilities = {
  design: 'studio', purchasing: 'gc', payer: 'client', fabrication_contract: 'other', installation: 'none',
};
const packages = ['included', 'excluded', 'conditional'].map((inclusion) => ({
  packageKey: `pkg.b04-${inclusion}`, label: `B04 ${inclusion} package`, inclusion,
  conditionText: inclusion === 'conditional' ? 'Subject to measured drawings' : null,
  overrideOf: inclusion === 'conditional' ? 'pkg.b04-original' : null,
  roomIds: [], responsibilities, serviceBindings: { design: [], installation: [] },
}));
const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

function localOnly() {
  for (const url of [process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres']) {
    if (new URL(url).hostname !== '127.0.0.1') throw new Error('B04 fixtures require 127.0.0.1');
  }
}

function seed() {
  localOnly();
  psqlRun(`BEGIN;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM public.proposals WHERE id = '${proposal}') THEN
        RAISE EXCEPTION 'B04 fixture ID already occupied; refusing replacement';
      END IF;
    END $$;
    INSERT INTO public.proposals (id, designer_id, studio_id, title, status, document_kind, commercial_state)
      VALUES ('${proposal}', '${owner}', '${studio}', '${title}', 'draft', 'design_services', 'draft');
    -- Imported inactive scope records, not an arrangement application. The native
    -- writer deliberately refuses these while capability activation is held.
    SET LOCAL session_replication_role = replica;
    ${packages.map((payload, index) => `INSERT INTO public.proposal_agreement_parts
      (proposal_id, position, kind, part_key, title, payload)
      VALUES ('${proposal}', ${index + 1}, 'scope_package', '${payload.packageKey}', '${payload.label}', ${literal(payload)});`).join('\n')}
    SET LOCAL session_replication_role = origin;
    COMMIT;`);
}

function cleanup() {
  localOnly();
  psqlRun(`BEGIN;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM public.proposals WHERE id = '${proposal}' AND
        (designer_id IS DISTINCT FROM '${owner}'::uuid OR studio_id IS DISTINCT FROM '${studio}'::uuid OR title IS DISTINCT FROM '${title}'))
      THEN RAISE EXCEPTION 'B04 nonfixture ownership: refusing cleanup'; END IF;
    END $$;
    -- These imported inactive records cannot pass the normal scope writer guard.
    -- Bypass only inside this ownership-checked fixture cleanup transaction.
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.proposal_agreement_parts WHERE proposal_id = '${proposal}';
    DELETE FROM public.proposals WHERE id = '${proposal}';
    SET LOCAL session_replication_role = origin;
    COMMIT;`);
  expect(psqlScalar(`SELECT count(*) FROM public.proposals WHERE id = '${proposal}'`)).toBe('0');
  expect(psqlScalar(`SELECT count(*) FROM public.proposal_agreement_parts WHERE proposal_id = '${proposal}'`)).toBe('0');
}

function snapshot() {
  return psqlScalar(`SELECT jsonb_build_object('proposal', to_jsonb(p), 'parts',
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY position) FROM public.proposal_agreement_parts a WHERE a.proposal_id = p.id))
    FROM public.proposals p WHERE p.id = '${proposal}'`);
}

test('B04 mounted composer keeps arrangements inactive and five independent responsibilities read-only', async ({ authenticatedPage: page }) => {
  test.setTimeout(180_000);
  seed();
  try {
    const before = snapshot();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/rest/v1/') && request.method() !== 'GET') {
        const target = new URL(request.url()).pathname;
        if (/apply_service_arrangement|upsert_agreement_parts|appoint|fabrication|grant.*access/.test(target)) writes.push(target);
      }
    });
    await page.goto(`/drafting/${proposal}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#room-status')).toBeVisible({ timeout: 90_000 });
    const arrangements = page.getByRole('region', { name: 'Service arrangements' });
    await expect(arrangements).toBeVisible();
    for (const name of choices) {
      const radio = arrangements.getByRole('radio', { name, exact: true });
      await expect(radio).toBeDisabled();
      await expect(radio).not.toBeChecked();
    }
    await expect(arrangements.getByRole('radio')).toHaveCount(4);
    await expect(arrangements.getByRole('button')).toHaveCount(0);
    await expect(arrangements).toContainText('Proposed responsibilities do not appoint anyone, grant access or authorize work.');
    await arrangements.screenshot({ path: test.info().outputPath('b04-inactive-arrangements.png') });

    for (const payload of packages) {
      const slug = payload.packageKey.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
      const toggle = page.locator(`#write-${slug}`);
      await toggle.focus();
      await toggle.press('Enter');
      const fold = page.locator(`#fold-${slug}`);
      await expect(fold).toBeVisible();
      await expect(fold.getByRole('combobox', { name: 'Inclusion', exact: true })).toHaveValue(payload.inclusion);
      for (const [label, value] of [
        ['Design', 'studio'], ['Purchasing', 'gc'], ['Payer', 'client'],
        ['Fabrication contract', 'other'], ['Installation', 'none'],
      ]) {
        const control = fold.getByRole('combobox', { name: label, exact: true });
        await expect(control).toHaveValue(value);
        await expect(control).toBeDisabled();
      }
      if (payload.conditionText) {
        await expect(fold.getByRole('textbox', { name: 'Condition', exact: true })).toHaveValue(payload.conditionText);
        await expect(fold.getByRole('textbox', { name: 'Condition', exact: true })).toBeDisabled();
        await expect(fold).toContainText('Overrides pkg.b04-original');
      }
      const bindings = fold.getByRole('region', { name: "This draft's new service bindings" });
      await expect(bindings).toContainText('Design: No new binding recorded');
      await expect(bindings).toContainText('Installation: No new binding recorded');
      await expect(fold).toContainText('Inherited bindings unavailable — no source scope edition is recorded for this draft.');
      await expect(fold).toContainText('No appointment, access or fabrication authority is granted here.');
      await fold.screenshot({ path: test.info().outputPath(`b04-${payload.inclusion}-responsibilities.png`) });
      await page.keyboard.press('Escape');
      await expect(toggle).toBeFocused();
    }
    expect(writes, 'Reading disabled arrangements must not call appointment/access/application writers').toEqual([]);
    expect(snapshot(), 'Opening and keyboard-reading inactive scope must not change proposal or package bytes').toBe(before);
    console.log('[B04 readback] three inclusion states; five distinct responsibilities; empty new bindings; unchanged proposal/parts');
  } catch (error) {
    console.error('[B04 original failure]', error);
    throw error;
  } finally {
    cleanup();
  }
});

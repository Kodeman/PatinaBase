/**
 * Seed/teardown fixtures for the library-configuration e2e walks.
 *
 * ── HOW TO RUN THIS SUITE ──────────────────────────────────────────────────
 *   pnpm --filter @patina/designer-portal test:e2e:library
 * That script is the only sanctioned entry point: chromium-only, `--workers=1`.
 * `playwright.config.ts` sets `fullyParallel: true` and leaves `workers`
 * unpinned off CI, so a plain `playwright test` runs these spec FILES in
 * separate workers — where they race one shared local database as one seeded
 * designer (the spec-book singleton, decision publishes, the picker's library
 * list). `test.describe.configure({ mode: 'serial' })` only orders tests WITHIN
 * a file; the cross-file pinning has to come from the runner.
 *
 * Composes the two sanctioned e2e data helpers:
 *   · `helpers/supabase-admin` — the service-role client, for plain table writes.
 *   · `helpers/psql`           — `psqlAsUser`, for the SECURITY DEFINER RPCs that
 *                                 read `auth.uid()` internally. `service_role`
 *                                 is GRANTed EXECUTE on
 *                                 `upsert_product_configuration_schema` but
 *                                 carries no `sub` claim, so
 *                                 `_can_manage_configurable_product` fails —
 *                                 the JWT-claims GUC is the only way in.
 *
 * ── DATABASE SAFETY ────────────────────────────────────────────────────────
 * `playwright.config.ts` loads `.env.local` into `process.env`, and this repo's
 * `apps/designer-portal/.env.local` has legitimately pointed at Strata PROD.
 * `helpers/supabase-admin` has no guard of its own — it just reads
 * NEXT_PUBLIC_SUPABASE_URL — so these specs would happily seed products into
 * production. Mirror `helpers/psql`'s guard and refuse anything but the local
 * stack, loudly, at module load. Export local env before running:
 *
 *   export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
 *   export SUPABASE_SERVICE_ROLE_KEY=<supabase status → SERVICE_ROLE_KEY>
 */
import { adminDb } from '../helpers/supabase-admin';
import { psqlAsUser, psqlRun, psqlScalar } from '../helpers/psql';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

if (!/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL)) {
  throw new Error(
    `REFUSING to seed library-configuration fixtures against a non-local Supabase URL: ` +
      `"${SUPABASE_URL}". These specs insert products, projects and decisions — they only ` +
      `ever talk to the local stack. Export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321.`,
  );
}

/** The URL the service-role helper actually resolved — printed as run proof. */
export const RESOLVED_SUPABASE_URL = SUPABASE_URL;

export const DESIGNER_EMAIL = 'designer@patina.dev';
export const CLIENT_EMAIL = 'client@patina.dev';

/** A per-run suffix so parallel/retried runs never collide on a product name. */
export function stamp(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/**
 * Resolve a seeded auth user by email.
 *
 * Deliberately NOT `supabase-admin`'s `getUserIdByEmail` — that calls GoTrue's
 * `/admin/users`, which 500s against a freshly reset local stack:
 * `supabase/seed/leads_room_scans.sql` inserts 6 auth.users without the token
 * columns, and GoTrue's Go scanner cannot read a NULL `confirmation_token`
 * ("converting NULL to string is unsupported"). Reading auth.users directly is
 * immune to that, and `helpers/psql` refuses any non-local database.
 */
export function userIdByEmail(email: string): string {
  const id = psqlScalar(`SELECT id FROM auth.users WHERE email = '${email}' LIMIT 1;`);
  if (!id) throw new Error(`Auth user not found for email: ${email}`);
  return id;
}

export function designerAndClientIds(): { designerId: string; clientId: string } {
  return {
    designerId: userIdByEmail(DESIGNER_EMAIL),
    clientId: userIdByEmail(CLIENT_EMAIL),
  };
}

// ─── Seed scope: what this run created, tracked AS IT IS CREATED ────────────
//
// A `beforeAll` that seeds three rows and assigns the ids at the END leaks
// every row it managed to create before it threw — the afterAll then reads
// empty arrays and deletes nothing, and the shared local database keeps them
// forever. So: one scope object, pushed to the instant each row exists, and a
// teardown that attempts EVERY resource even when one of them fails.

export interface SeedScope {
  projectIds: string[];
  productIds: string[];
  decisionTitles: string[];
}

export function seedScope(): SeedScope {
  return { projectIds: [], productIds: [], decisionTitles: [] };
}

/** Seed a project and record it before the caller can drop it on the floor. */
export async function seedProjectIn(
  scope: SeedScope,
  name: string,
  designerId: string,
  clientId: string,
): Promise<string> {
  const id = await seedProject(name, designerId, clientId);
  scope.projectIds.push(id);
  return id;
}

/** Seed a product and record it before authoring its schema can throw. */
export async function seedProductIn(
  scope: SeedScope,
  opts: { name: string; ownerUserId: string; priceRetail?: number },
): Promise<string> {
  const id = await seedProduct(opts);
  scope.productIds.push(id);
  return id;
}

/**
 * Register a decision title the walk is about to publish. Titles are known
 * before the run starts, so they are tracked up front — the row they name may
 * or may not come to exist, and deleting a title that never landed is a no-op.
 */
export function trackDecision(scope: SeedScope, title: string): string {
  scope.decisionTitles.push(title);
  return title;
}

/**
 * Delete everything the scope recorded, in dependency order, each resource in
 * its own try/finally so a failure on one never skips the rest. Teardown noise
 * is logged rather than thrown: a cleanup problem must not mask the test result
 * that caused it.
 */
export function teardownScope(scope: SeedScope): void {
  for (const title of scope.decisionTitles.splice(0)) {
    try {
      deleteDecisionByTitle(title);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[library-configuration] teardown: decision "${title}" —`, err);
    }
  }
  for (const productId of scope.productIds.splice(0)) {
    try {
      deleteProducts([productId]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[library-configuration] teardown: product ${productId} —`, err);
    }
  }
  for (const projectId of scope.projectIds.splice(0)) {
    try {
      deleteProject(projectId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[library-configuration] teardown: project ${projectId} —`, err);
    }
  }
}

/**
 * A project the schedule band will actually render for:
 *   · `status` not 'completed' and `current_phase` not install/walkthrough, or
 *     `document_state.active_section` is not 'project' and the band is absent.
 *   · `client_id` set to the seeded client — the band resolves
 *     `designer_clients` from it, and without a match "+ New open item" no-ops.
 *
 * (Written for CoordinationBand, which stopped mounting when B3 retired the
 * schedule-spine gate; the ScheduleSpine that replaced it takes the same props
 * and needs the same seed, so these conditions still hold.)
 */
export async function seedProject(name: string, designerId: string, clientId: string) {
  const { data, error } = await adminDb
    .from('projects')
    .insert({
      name,
      created_by: designerId,
      designer_id: designerId,
      client_id: clientId,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Teardown as `postgres` — project cascades reach guarded child tables too. */
export function deleteProject(projectId: string): void {
  psqlRun(`DELETE FROM public.projects WHERE id = '${projectId}';`);
}

/**
 * A personal-layer product owned by the designer. Personal + owner is what
 * `_can_manage_configurable_product` requires before the schema RPC will run,
 * and what puts the row in the picker's Library tab for this designer.
 */
export async function seedProduct(opts: {
  name: string;
  ownerUserId: string;
  priceRetail?: number;
}) {
  const { data, error } = await adminDb
    .from('products')
    .insert({
      layer: 'personal',
      owner_user_id: opts.ownerUserId,
      captured_by: opts.ownerUserId,
      captured_at: new Date().toISOString(),
      name: opts.name,
      status: 'published',
      price_retail: opts.priceRetail ?? 3200,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export function deleteProducts(ids: string[]): void {
  if (ids.length === 0) return;
  const list = ids.map((id) => `'${id}'`).join(',');
  psqlRun(`DELETE FROM public.products WHERE id IN (${list});`);
}

/**
 * Author a variant-mode definition: one required "Material" group with three
 * values carrying real price deltas (one of them COM-capable, per 00413), and a
 * matching active variant per value so every selection resolves to a variant and
 * the authoritative evaluate returns valid+complete.
 *
 * Resolved retail comes from the MATCHED VARIANT, not base+delta:
 *   Walnut → 320000c ($3,200) · Oak → 305000c ($3,050) · Boucle → 345000c.
 */
export function authorVariantSchema(designerId: string, productId: string): void {
  psqlAsUser(
    designerId,
    `SELECT public.upsert_product_configuration_schema('${productId}'::uuid, $json$
      {
        "mode": "variant",
        "pricingStrategy": "base_plus_adjustments",
        "optionGroups": [
          {
            "code": "material", "name": "Material", "selectionType": "single",
            "required": true, "minSelections": 1, "maxSelections": 1, "position": 0,
            "values": [
              {"code":"walnut","label":"Walnut","retailPriceDeltaCents":0,"tradePriceDeltaCents":0,"position":0},
              {"code":"oak","label":"Oak","retailPriceDeltaCents":-15000,"tradePriceDeltaCents":-9000,"position":1},
              {"code":"boucle","label":"Boucle","retailPriceDeltaCents":25000,"tradePriceDeltaCents":16000,
               "allowsCom":true,"comRequirements":{"yardage":"12 yards"},"position":2}
            ]
          }
        ],
        "variants": [
          {"code":"m-walnut","name":"Walnut","status":"active","isDefault":true,
           "retailPriceCents":320000,"tradePriceCents":210000,"leadTimeWeeks":8,
           "optionValueCodes":["material:walnut"]},
          {"code":"m-oak","name":"Oak","status":"active",
           "retailPriceCents":305000,"tradePriceCents":201000,"leadTimeWeeks":8,
           "optionValueCodes":["material:oak"]},
          {"code":"m-boucle","name":"Boucle","status":"active",
           "retailPriceCents":345000,"tradePriceCents":226000,"leadTimeWeeks":12,
           "optionValueCodes":["material:boucle"]}
        ]
      }
    $json$::jsonb, NULL);`,
  );
}

/** Author a custom-commission definition (no groups/variants allowed in this mode). */
export function authorCustomSchema(designerId: string, productId: string): void {
  psqlAsUser(
    designerId,
    `SELECT public.upsert_product_configuration_schema('${productId}'::uuid,
       $json$ {"mode": "custom"} $json$::jsonb, NULL);`,
  );
}

// ─── FF&E / spec-book seeding ───────────────────────────────────────────────

/**
 * Insert an FF&E line. `trg_spec_book_attach_ffe_line` auto-creates the matching
 * `project_ffe_specs` row, so the spec never needs inserting by hand.
 */
export async function seedFfeItem(projectId: string, name: string) {
  const { data, error } = await adminDb
    .from('project_ffe_items')
    .insert({ project_id: projectId, name })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Preset the auto-created spec row's dimensions. Safe because the trigger-made
 * row leaves `configuration_locked_at` NULL — `guard_project_configuration_snapshot`
 * only blocks dimension writes once a configuration is locked.
 */
export async function setSpecDimensions(
  ffeItemId: string,
  dims: Record<string, unknown> | null,
): Promise<void> {
  const { error } = await adminDb
    .from('project_ffe_specs')
    .update({ selected_dimensions: dims })
    .eq('ffe_item_id', ffeItemId);
  if (error) throw error;
}

export async function getSpec(ffeItemId: string) {
  const { data, error } = await adminDb
    .from('project_ffe_specs')
    .select('id, selected_dimensions, row_version, readiness_status')
    .eq('ffe_item_id', ffeItemId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Decision read-backs ────────────────────────────────────────────────────

export async function getDecisionByTitle(title: string) {
  const { data, error } = await adminDb
    .from('client_decisions')
    .select('id, title, status, project_id')
    .eq('title', title)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getDecisionOptionsByTitle(title: string) {
  const decision = await getDecisionByTitle(title);
  if (!decision) return [];
  const { data, error } = await adminDb
    .from('client_decision_options')
    .select('id, name, price, product_id, configuration_id, selection_snapshot, sort_order')
    .eq('decision_id', decision.id)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Teardown for a PUBLISHED decision.
 *
 * `guard_client_decision_authority` blocks deletes from `authenticated` and
 * `service_role` alike — a published row may only go through
 * `delete_client_decision_draft` (drafts only). Its one escape hatch is the
 * maintenance arm: `current_user = 'postgres'` with NO JWT claims set, which is
 * exactly a plain `psqlRun` connection. `adminDb` authenticates as service_role
 * and is refused, so teardown must not use it.
 */
export function deleteDecisionByTitle(title: string): void {
  psqlRun(`DELETE FROM public.client_decisions WHERE title = '${title.replace(/'/g, "''")}';`);
}

#!/usr/bin/env node
/**
 * Prod write-path probe for the Chrome extension.
 *
 * Reproduces the extension's exact RLS path (anon key + a signed-in
 * designer's JWT) and exercises every write the extension performs, using
 * the SAME payload/RPC-argument shapes as the extension's own code
 * (apps/extension/src/lib/payloads.ts, apps/extension/src/state/effects.ts,
 * apps/extension/src/lib/spec-book-placement.ts). See README.md in this
 * directory for how to run it against local vs. Strata (prod).
 *
 * Run from apps/extension/ so bare `@supabase/supabase-js` resolves from
 * this workspace's node_modules:
 *   cd apps/extension && node scripts/prod-write-probe.mjs
 *
 * Env (all required unless noted):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, PROBE_EMAIL, PROBE_PASSWORD
 *   PROBE_PROJECT_ID     (optional — skips placement + decision steps if absent)
 *   PROBE_PROPOSAL_ID    (optional — commit_proposal_capture's p_proposal_id is
 *                         nullable, so this is never required; when absent the
 *                         inbox step is called with proposal_id = null)
 *   PROBE_CLIENT_ID      (optional — required, with PROBE_ALLOW_DECISION=1, to
 *                         run the decision step)
 *   PROBE_ALLOW_DECISION (optional — set to "1" to opt into step 7, which
 *                         creates a PENDING client decision that may notify
 *                         the client and leaves rows behind. Skipped by
 *                         default.)
 */

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const PLAN = [
  'step 1  sign_in                — auth.signInWithPassword(PROBE_EMAIL, PROBE_PASSWORD)',
  'step 2  insert_product         — products insert (extension shape: capture_source=web_extension, layer=personal, owner_user_id/captured_by=uid, status=draft) + select-back by id',
  'step 3  insert_product_style   — product_styles insert for the product (style_id = first row of styles)',
  'step 4  insert_vendor          — vendors insert (name=PROBE-VENDOR-<ts>)',
  'step 5  place_in_project       — rpc place_product_in_project_v2 (destination=project_inbox); requires PROBE_PROJECT_ID, else skipped',
  'step 6  commit_proposal_capture — rpc commit_proposal_capture; proposal_id is nullable, uses PROBE_PROPOSAL_ID if set else null',
  'step 7  create_decision        — OPT-IN: requires PROBE_ALLOW_DECISION=1 and PROBE_CLIENT_ID (+ PROBE_PROJECT_ID), else skipped (set PROBE_ALLOW_DECISION=1 — creates a PENDING client decision that may notify the client and leaves rows); inserts its OWN PROBE-DECISION-<ts> product via rpc create_client_decision',
  'cleanup — delete product_styles, proposal_captures (by product id), step-6/step-2/decision products, vendors (best effort); project_ffe_items is NOT attempted (authenticated has no DELETE grant on it)',
];

if (DRY_RUN) {
  console.log('Planned steps (--dry-run, no network calls):');
  for (const line of PLAN) console.log('  ' + line);
  process.exit(0);
}

const env = process.env;
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const PROBE_EMAIL = env.PROBE_EMAIL;
const PROBE_PASSWORD = env.PROBE_PASSWORD;
const PROBE_PROJECT_ID = env.PROBE_PROJECT_ID || null;
const PROBE_PROPOSAL_ID = env.PROBE_PROPOSAL_ID || null;
const PROBE_CLIENT_ID = env.PROBE_CLIENT_ID || null;
const PROBE_ALLOW_DECISION = env.PROBE_ALLOW_DECISION === '1';

const required = { SUPABASE_URL, SUPABASE_ANON_KEY, PROBE_EMAIL, PROBE_PASSWORD };
const missing = Object.entries(required)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Missing required env var(s): ${missing.join(', ')}`);
  process.exit(1);
}
if (!PROBE_PROJECT_ID) {
  console.log('PROBE_PROJECT_ID not set — step 5 (placement) will be skipped, and step 7 (decision) requires it too.');
}
if (!PROBE_PROPOSAL_ID) {
  console.log('PROBE_PROPOSAL_ID not set — step 6 will call commit_proposal_capture with p_proposal_id = null.');
}

const ts = Date.now();
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let allOk = true;
let userId = null;

// Ids of everything this run creates, for cleanup in `finally`.
const created = {
  productId: null,
  productStyleCreated: false,
  vendorId: null,
  ffeSelectionId: null,
  captureRowId: null,
  inboxProductId: null,
  decisionId: null,
  decisionProductId: null,
};

/** Same shape as step 2's productPayload (payloads.ts:25-83 / effects.ts:46-51). */
function baseProductPayload(name, sourceUrl) {
  const nowIso = new Date().toISOString();
  return {
    name,
    description: null,
    source_url: sourceUrl,
    images: [],
    price_retail: null,
    materials: [],
    colors: null,
    finish: null,
    available_colors: null,
    capture_source: 'web_extension',
    capture_provenance: {
      captureOptions: {
        colors: [],
        finishes: [],
        materials: [],
        source: 'web_extension',
        capturedAt: nowIso,
      },
    },
    dimensions: null,
    vendor_id: null,
    retailer_id: null,
    captured_by: userId,
    captured_at: nowIso,
    layer: 'personal',
    owner_user_id: userId,
    status: 'draft',
  };
}

function logOk(n, name, extra = '') {
  console.log(`step ${n} ${name}: ok${extra ? ' ' + extra : ''}`);
}

function logError(n, name, err) {
  allOk = false;
  const code = err?.code ?? err?.status ?? 'unknown';
  const message = err?.message ?? String(err);
  console.log(`step ${n} ${name}: error ${code} ${message}`);
}

function logSkipped(n, name, reason) {
  console.log(`step ${n} ${name}: skipped (${reason})`);
}

// ─── Step 1: sign in ────────────────────────────────────────────────────────
try {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: PROBE_EMAIL,
    password: PROBE_PASSWORD,
  });
  if (error) throw error;
  if (!data?.user?.id) throw new Error('sign-in returned no user id');
  userId = data.user.id;
  logOk(1, 'sign_in', `(user ${userId})`);
} catch (err) {
  logError(1, 'sign_in', err);
}

// ─── Step 2: products insert — exact shape of productRow()/buildProductInsertPayload
//     (payloads.ts:25-83, effects.ts:46-51), status mirrors saveToInbox's 'draft'.
if (userId) {
  try {
    const productPayload = baseProductPayload(`PROBE-${ts}`, `https://probe.invalid/${ts}`);
    const { data: inserted, error: insertError } = await supabase
      .from('products')
      .insert(productPayload)
      .select('id')
      .single();
    if (insertError) throw insertError;
    if (!inserted?.id) throw new Error('insert returned no id');
    created.productId = inserted.id;

    const { data: readBack, error: readError } = await supabase
      .from('products')
      .select('id, name, source_url, capture_source, layer, owner_user_id, captured_by, status')
      .eq('id', inserted.id)
      .single();
    if (readError) throw readError;
    if (!readBack) throw new Error('select-back returned no row (RLS read failed)');
    logOk(2, 'insert_product', `(id ${inserted.id})`);
  } catch (err) {
    logError(2, 'insert_product', err);
  }
} else {
  logSkipped(2, 'insert_product', 'no authenticated user from step 1');
}

// ─── Step 3: product_styles insert — buildProductStyleInserts shape
//     (payloads.ts:129-142 / effects.ts's local styleInserts, 108-117).
if (created.productId) {
  try {
    const { data: style, error: styleError } = await supabase
      .from('styles')
      .select('id')
      .limit(1)
      .single();
    if (styleError) throw styleError;
    if (!style?.id) throw new Error('no rows in styles to reference');

    const { error: insertError } = await supabase.from('product_styles').insert({
      product_id: created.productId,
      style_id: style.id,
      confidence: 1.0,
      is_primary: true,
      source: 'manual',
      assigned_by: userId,
    });
    if (insertError) throw insertError;
    created.productStyleCreated = true;
    logOk(3, 'insert_product_style', `(style ${style.id})`);
  } catch (err) {
    logError(3, 'insert_product_style', err);
  }
} else {
  logSkipped(3, 'insert_product_style', 'no product id from step 2');
}

// ─── Step 4: vendors insert — buildVendorInsertPayload shape (payloads.ts:87-113).
try {
  const vendorPayload = {
    name: `PROBE-VENDOR-${ts}`,
    website: null,
    logo_url: null,
    hero_image_url: null,
    market_position: null,
    production_model: null,
    primary_category: null,
    contact_info: { email: null, phone: null },
    social_links: { instagram: null, pinterest: null, facebook: null },
    founded_year: null,
    headquarters_city: null,
    headquarters_state: null,
    brand_story: null,
    ownership: null,
    made_in: null,
    notes: null,
  };
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .insert(vendorPayload)
    .select('id')
    .single();
  if (vendorError) throw vendorError;
  if (!vendor?.id) throw new Error('insert returned no id');
  created.vendorId = vendor.id;
  logOk(4, 'insert_vendor', `(id ${vendor.id})`);
} catch (err) {
  logError(4, 'insert_vendor', err);
}

// ─── Step 5: place_product_in_project_v2 — PlacementV2Request shape
//     (spec-book-placement.ts:56-70, 190-213), destination = project_inbox.
if (created.productId && PROBE_PROJECT_ID) {
  try {
    const idempotencyKey = `chrome:${created.productId}:${PROBE_PROJECT_ID}:project_inbox:unassigned::reuse`;
    const request = {
      projectId: PROBE_PROJECT_ID,
      productId: created.productId,
      roomId: null,
      assignmentScope: 'unassigned',
      category: null,
      boardId: null,
      disposition: 'candidate',
      duplicateMode: 'reuse',
      placeholderSelectionId: null,
      configurationId: null,
      roleConfigurationIdentity: null,
      idempotencyKey,
      source: 'chrome_extension',
    };
    const { data, error } = await supabase.rpc('place_product_in_project_v2', { p_request: request });
    if (error) throw error;
    const selectionId = data?.selectionId ?? data?.selection_id ?? null;
    created.ffeSelectionId = selectionId;
    logOk(5, 'place_in_project', `(outcome ${data?.outcome}, selection ${selectionId})`);
  } catch (err) {
    logError(5, 'place_in_project', err);
  }
} else if (!created.productId) {
  logSkipped(5, 'place_in_project', 'no product id from step 2');
} else {
  logSkipped(5, 'place_in_project', 'PROBE_PROJECT_ID not set');
}

// ─── Step 6: commit_proposal_capture — buildCommitProposalCaptureArgs shape
//     (payloads.ts:214-265), called by saveToInbox (effects.ts:252-286).
//     p_proposal_id defaults to NULL in the RPC signature (00516) — never
//     required.
if (userId) {
  try {
    const clientCaptureId = globalThis.crypto.randomUUID();
    const sourceUrl = `https://probe.invalid/inbox/${ts}`;
    const payload = {
      name: `PROBE-INBOX-${ts}`,
      description: null,
      sourceUrl,
      images: [],
      priceRetailCents: null,
      materials: [],
      colors: null,
      finish: null,
      availableColors: null,
      dimensions: null,
      vendorId: null,
      retailerId: null,
      captureSource: 'web_extension',
      captureProvenance: {
        captureOptions: { colors: [], finishes: [], materials: [], source: 'web_extension', capturedAt: new Date().toISOString() },
      },
      productStatus: 'draft',
      thumbnailUrl: null,
      rawPayload: { name: `PROBE-INBOX-${ts}`, note: 'prod-write-probe' },
    };
    const { data, error } = await supabase.rpc('commit_proposal_capture', {
      p_client_capture_id: clientCaptureId,
      p_payload: payload,
      p_style_ids: [],
      p_proposal_id: PROBE_PROPOSAL_ID,
      p_scope_room_id: null,
      p_ffe_category_slug: null,
    });
    if (error) throw error;
    const inboxProductId = data?.product_id;
    if (!inboxProductId) throw new Error('RPC returned no product_id');
    created.captureRowId = data?.capture_id ?? null;
    // The RPC-minted product is a second product this run owns — clean it up
    // alongside the step-2 product.
    created.inboxProductId = inboxProductId;
    logOk(6, 'commit_proposal_capture', `(capture ${created.captureRowId}, product ${inboxProductId})`);
  } catch (err) {
    logError(6, 'commit_proposal_capture', err);
  }
} else {
  logSkipped(6, 'commit_proposal_capture', 'no authenticated user from step 1');
}

// ─── Step 7: create_client_decision — mirrors saveAsDecision (effects.ts:289-351).
// OPT-IN: creates a PENDING decision (may notify the client) and, per the
// decision-integrity trigger, permanently pins its product — so this step
// mints its OWN product rather than reusing step 2's, keeping step 2's
// product cleanable regardless of whether step 7 runs.
if (!PROBE_ALLOW_DECISION || !PROBE_CLIENT_ID) {
  logSkipped(
    7,
    'create_decision',
    'set PROBE_ALLOW_DECISION=1 — creates a PENDING client decision that may notify the client and leaves rows'
  );
} else if (!PROBE_PROJECT_ID) {
  logSkipped(7, 'create_decision', 'PROBE_PROJECT_ID not set');
} else if (!userId) {
  logSkipped(7, 'create_decision', 'no authenticated user from step 1');
} else {
  try {
    const decisionProductPayload = baseProductPayload(
      `PROBE-DECISION-${ts}`,
      `https://probe.invalid/decision/${ts}`
    );
    const { data: decisionProduct, error: productError } = await supabase
      .from('products')
      .insert(decisionProductPayload)
      .select('id')
      .single();
    if (productError) throw productError;
    if (!decisionProduct?.id) throw new Error('insert returned no id');
    created.decisionProductId = decisionProduct.id;

    const decisionId = globalThis.crypto.randomUUID();
    const decisionPayload = {
      designer_client_id: PROBE_CLIENT_ID,
      project_id: PROBE_PROJECT_ID,
      room_id: null,
      title: `PROBE-DECISION-${ts}`,
      context: null,
      due_date: null,
      decision_type: 'product',
      blocking_status: 'non_blocking',
      status: 'pending',
    };
    const optionPayload = {
      name: `PROBE-DECISION-${ts}`,
      image_url: null,
      designer_note: null,
      product_id: created.decisionProductId,
      is_recommended: true,
      price: null,
      quantity: 1,
      sort_order: 0,
    };
    const { data, error } = await supabase.rpc('create_client_decision', {
      p_decision_id: decisionId,
      p_payload: decisionPayload,
      p_options: [optionPayload],
      p_blocked_ffe_item_ids: [],
      p_blocked_task_ids: [],
    });
    if (error) throw error;
    if (!data) throw new Error('RPC returned no decision row');
    created.decisionId = decisionId;
    logOk(7, 'create_decision', `(id ${decisionId}, product ${created.decisionProductId})`);
  } catch (err) {
    logError(7, 'create_decision', err);
  }
}

// ─── Cleanup ────────────────────────────────────────────────────────────────
// supabase-js does not error when RLS filters a delete down to zero affected
// rows — it just returns an empty result. So "did the delete actually work"
// is checked by asking for the deleted rows back (.select()) rather than
// trusting the absence of an error.
async function cleanupDelete(table, column, value, note, label = table) {
  if (!value) {
    console.log(`cleanup ${label}: skipped (nothing created)`);
    return;
  }
  try {
    const { data, error } = await supabase.from(table).delete().eq(column, value).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      console.log(`cleanup ${label}: skipped (${note})`);
      return;
    }
    console.log(`cleanup ${label}: ok`);
  } catch (err) {
    const code = err?.code ?? err?.status ?? 'unknown';
    const message = err?.message ?? String(err);
    console.log(`cleanup ${label}: error ${code} ${message}`);
  }
}

try {
  await cleanupDelete(
    'product_styles',
    'product_id',
    created.productStyleCreated ? created.productId : null,
    'RLS forbade delete'
  );
  await cleanupDelete(
    'proposal_captures',
    'product_id',
    created.inboxProductId ?? null,
    'RLS forbade delete'
  );

  // project_ffe_items: NOT attempted — `authenticated` has no table-level
  // DELETE grant on it at all (confirmed against local Postgres grants), only
  // the SECURITY DEFINER RPCs can touch it, so a delete attempt here would
  // only ever surface the same 42501 every time. Informational only.
  console.log(
    created.ffeSelectionId
      ? `cleanup project_ffe_items: not attempted (no DELETE grant for authenticated; row for selection ${created.ffeSelectionId} remains — admin cleanup)`
      : 'cleanup project_ffe_items: not attempted (nothing created)'
  );

  await cleanupDelete(
    'products',
    'id',
    created.inboxProductId ?? null,
    'RLS forbade delete',
    'products (step 6)'
  );
  await cleanupDelete('products', 'id', created.productId, 'RLS forbade delete', 'products (step 2)');

  await cleanupDelete(
    'client_decisions',
    'id',
    created.decisionId,
    'row is not status=draft — client_decisions_studio_legacy_draft_delete only allows deleting draft decisions (00399)'
  );

  // products (decision): expected to fail — a live pending decision option
  // still points at it, and the decision-integrity trigger (23514) blocks
  // deleting a product referenced by a non-canonical-workflow change while
  // that decision exists.
  if (!created.decisionProductId) {
    console.log('cleanup products (decision): skipped (nothing created)');
  } else {
    try {
      const { data, error } = await supabase
        .from('products')
        .delete()
        .eq('id', created.decisionProductId)
        .select('id');
      if (error) throw error;
      console.log(
        !data || data.length === 0
          ? 'cleanup products (decision): skipped (RLS forbade delete)'
          : 'cleanup products (decision): ok'
      );
    } catch (err) {
      if (err?.code === '23514') {
        console.log(
          `cleanup products (decision): left (referenced by pending decision ${created.decisionId ?? 'unknown'})`
        );
      } else {
        const code = err?.code ?? err?.status ?? 'unknown';
        const message = err?.message ?? String(err);
        console.log(`cleanup products (decision): error ${code} ${message}`);
      }
    }
  }

  await cleanupDelete(
    'vendors',
    'id',
    created.vendorId,
    'admin-only delete policy (migration 00058) — row name PROBE-VENDOR-' + ts + ' left for admin'
  );
} finally {
  await supabase.auth.signOut();
}

process.exit(allOk ? 0 : 1);

import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// The Invoice, Standing Alone (00574) — /pay/[token] is a login-less, public
// invoice with a till on it, resolved server-side by the raw 64-hex token.
// This drives the real route against the LOCAL stack (never Strata),
// following plans-link.spec.ts / share-link.spec.ts.
//
// Every fixture is minted through the honest path, because every shortcut is
// refused by a constraint that exists for a reason:
//   - the invoice is INSERTed at 'draft' and then moved to 'sent' with a plain
//     UPDATE, because the link is minted by the trigger on that status write
//     and by nothing else — and `issue_invoice`, the RPC a designer would
//     call, is revoked from service_role (00412, 00511);
//   - a test that voids gets its OWN payment-free mint: the legacy
//     `void_invoice` body raises `has collected payments and cannot be voided`
//     when `amount_paid_cents <> 0`, and the payable fixture deliberately
//     carries $7,605.00 so the three rows quote $9,130.00 / $9,398.75 /
//     $9,125.00;
//   - the houseless invoice carries an explicit `studio_id`, because
//     `set_invoice_studio_id`'s `project_id IS NULL` arm raises
//     `studio_id_not_designer_studio` without one (00571);
//   - the checkout attempt is claimed through W1's own
//     `claim_invoice_link_checkout_attempt`, because a raw insert misses four
//     NOT NULL columns and the `session_created` state CHECK.
//
// Cleanup: rows are left in place under throwaway projects. This is the LOCAL
// stack and `supabase db reset` is the broom.

const LOCAL_URL = "http://127.0.0.1:54321";

// The local service-role key is NOT written into this file. The repo's
// pre-commit scan rejects any file whose content carries a service_role JWT,
// the Supabase CLI's public demo key included, and bypassing that scan is not
// a lane's call — playwright.config.ts states the same rule for the same
// reason. Export it from `supabase status` before running this suite:
//
//   export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)"
//   env -u CI pnpm --filter @patina/client-portal test:e2e -- \
//     --project=chromium tests/pay-link.spec.ts
const SERVICE_JWT = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Seeded dev accounts (supabase/seed/dev-accounts.sql).
const DESIGNER_ID = "a0000000-0000-0000-0000-000000000004";
const CLIENT_ID = "a0000000-0000-0000-0000-000000000005";

// The Supabase CLI's fixed local demo ANON key — the one `supabase status`
// prints on every machine, and the one playwright.config.ts already pins for
// the same reason. It authorizes nothing outside a local stack. (The
// service_role key is NOT written here: the repo's pre-commit scan rejects any
// file carrying one, demo key included.)
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/**
 * The seeded designer, signed in.
 *
 * Two acts on this page belong to a designer and to nobody else: Regenerate
 * and Void. Driving them as service_role proves less than it looks —
 * `void_invoice`'s authority guard evaluates NULL for an actorless caller and
 * the RAISE simply never fires, so the fixture would pass through a hole no
 * real flow takes. These run as the authenticated designer instead.
 */
let designerClientCache: SupabaseClient | null = null;
async function designer(): Promise<SupabaseClient> {
  if (designerClientCache) return designerClientCache;
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: "designer@patina.dev",
    password: "password123",
  });
  expect(error, "the seeded designer must be able to sign in").toBeNull();
  designerClientCache = client;
  return client;
}

// Constructed LAZILY: supabase-js throws `supabaseKey is required.` from its
// constructor, so building this at module scope would crash the import and an
// operator who forgot the export would meet that instead of the sentence
// below (T-4).
let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!adminClient) {
    expect(
      SERVICE_JWT,
      "SUPABASE_SERVICE_ROLE_KEY must be exported from the LOCAL stack (see the note at the top of this file)",
    ).not.toBe("");
    adminClient = createClient(LOCAL_URL, SERVICE_JWT, {
      auth: { persistSession: false },
    });
  }
  return adminClient;
}

interface MintOptions {
  /** Land a part payment, so the balance is $9,125.00. Default true. */
  paid?: boolean;
  /** A studio invoice with no house — needs an explicit studio_id (T-2). */
  houseless?: boolean;
}

interface MintedInvoice {
  invoiceId: string;
  linkId: string;
  projectId: string;
  projectName: string;
  token: string;
}

/** The designer's active design studio, resolved the way the resolver does. */
async function designerStudioId(): Promise<string> {
  const { data, error } = await admin().rpc("resolve_studio_identity", {
    p_designer_id: DESIGNER_ID,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const studioId = (row as { studio_id?: string } | null)?.studio_id;
  expect(
    studioId,
    "the seeded designer must belong to an active design studio",
  ).toBeTruthy();
  return studioId as string;
}

/**
 * A $16,730.00 invoice, $7,605.00 received unless `paid: false` — the design's
 * own fixture, so the three arrived-at totals are $9,130.00 / $9,398.75 /
 * $9,125.00 and a regression in the surcharge formula fails here loudly.
 */
async function mintInvoice(options: MintOptions = {}): Promise<MintedInvoice> {
  const { paid = true, houseless = false } = options;
  const db = admin();
  const suffix = randomUUID().slice(0, 8);
  const projectId = randomUUID();
  const projectName = `Pay E2E ${suffix}`;
  const invoiceId = randomUUID();

  if (!houseless) {
    // `studio_id` is explicit here for the same reason the houseless invoice
    // carries one: the seeded designer is an active owner of TWO active design
    // studios (Leah Hartwell and Local Dev Studio, supabase/seed), so
    // `set_project_studio_id` cannot discover a single candidate and raises
    // `studio_id_not_designer_studio`. Stamping the studio the resolver picks
    // also keeps the project and its invoice on the same anchor, which
    // `set_invoice_studio_id` requires (`project.studio_id = NEW.studio_id`).
    const { error: projectErr } = await db.from("projects").insert({
      id: projectId,
      name: projectName,
      status: "active",
      budget_cents: 0,
      design_fee_cents: 0,
      client_visibility_tier: "milestone",
      client_id: CLIENT_ID,
      designer_id: DESIGNER_ID,
      created_by: DESIGNER_ID,
      studio_id: await designerStudioId(),
    });
    if (projectErr) throw projectErr;
  }

  // Draft first. Every writer of `status = 'sent'` in the codebase is an
  // UPDATE, and the mint trigger fires on exactly that transition — inserting
  // an already-sent invoice would mint nothing.
  const { error: invoiceErr } = await db.from("invoices").insert({
    id: invoiceId,
    project_id: houseless ? null : projectId,
    studio_id: houseless ? await designerStudioId() : null,
    designer_id: DESIGNER_ID,
    client_id: CLIENT_ID,
    invoice_number: `E2E-${suffix}`,
    title: houseless
      ? "Design consultation · June"
      : "Furnishings, second delivery",
    status: "draft",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "2099-08-15",
    payment_terms_days: 15,
    currency: "USD",
    subtotal_cents: 1_673_000,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 1_673_000,
    amount_paid_cents: 0,
    memo: "The credenza left the bench on the 28th.",
  });
  if (invoiceErr) throw invoiceErr;

  const { error: lineErr } = await db.from("invoice_line_items").insert([
    {
      invoice_id: invoiceId,
      kind: "adhoc",
      description: "Sconces — pair",
      quantity: 2,
      unit_amount_cents: 117_000,
      amount_cents: 234_000,
      sort_order: 0,
    },
    {
      invoice_id: invoiceId,
      kind: "adhoc",
      description: "Walnut credenza",
      quantity: 1,
      unit_amount_cents: 1_439_000,
      amount_cents: 1_439_000,
      sort_order: 1,
    },
  ]);
  if (lineErr) throw lineErr;

  // Issue it — the trigger mints the link on this status write (00574:
  // `invoice_link_mint_on_issue`, AFTER UPDATE OF status, WHEN NEW.status IN
  // ('sent','partially_paid','paid')).
  //
  // The status write is made directly rather than through `issue_invoice`:
  // 00412 and 00511 revoked that RPC from service_role and granted it to
  // `authenticated` alone, so calling it with this client 42501s
  // (`permission denied for function issue_invoice`). The trigger and
  // `ensure_invoice_link` both key off the status alone, so the honest path
  // for a service-role fixture is the UPDATE the RPC itself performs.
  const { error: issueErr } = await db
    .from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (issueErr) throw issueErr;

  if (paid) {
    // A part payment, so the balance the three rows quote is $9,125.00 rather
    // than the whole invoice.
    const { error: paymentErr } = await db.from("invoice_payments").insert({
      invoice_id: invoiceId,
      amount_cents: 760_500,
      surcharge_cents: 0,
      method: "check",
      status: "succeeded",
      received_at: new Date().toISOString(),
    });
    if (paymentErr) throw paymentErr;
  }

  // J21: the trigger's own work, asserted BEFORE the idempotent helper below
  // could mask its absence. `ensure_invoice_link` would mint the row itself if
  // `invoice_link_mint_on_issue` had never fired, and the suite would still be
  // green — so the row is read first, and only then is the token asked for.
  const { data: minted, error: mintedErr } = await db
    .from("invoice_links")
    .select("id, status")
    .eq("invoice_id", invoiceId)
    .eq("status", "active")
    .single();
  expect(
    mintedErr,
    "the status write alone must mint the link (invoice_link_mint_on_issue)",
  ).toBeNull();
  expect(minted).not.toBeNull();

  const { data: token, error: linkErr } = await db.rpc("ensure_invoice_link", {
    p_invoice_id: invoiceId,
  });
  if (linkErr) throw linkErr;
  expect(token).toMatch(/^[0-9a-f]{64}$/);

  const { data: link, error: linkRowErr } = await db
    .from("invoice_links")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("status", "active")
    .single();
  if (linkRowErr) throw linkRowErr;

  return {
    invoiceId,
    linkId: (link as { id: string }).id,
    projectId,
    projectName,
    token: token as unknown as string,
  };
}

/**
 * The password leg of the sign-in form, pressed the way `threshold.spec.ts`
 * presses it: the disclosure is server-rendered before React attaches, so an
 * early click is swallowed silently and the button must be retried until the
 * password field it controls actually opens.
 */
async function signInAsClient(page: Page, email: string): Promise<void> {
  await page.goto("/auth/signin", { waitUntil: "domcontentloaded" });

  const disclosure = page
    .getByRole("button", {
      name: /sign in with email|use email and password instead/i,
    })
    .first();
  const password = page.getByLabel(/password/i).first();
  await expect(async () => {
    await disclosure.waitFor({ state: "visible", timeout: 30_000 });
    await disclosure.click();
    await password.waitFor({ state: "visible", timeout: 5_000 });
  }).toPass({ timeout: 120_000 });

  await page.getByLabel(/email/i).first().fill(email);
  await password.fill("password123");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/signin"), {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
}

test.describe("the standing invoice (00574)", () => {
  test("renders the sheet, moves the three figures together, and dies on revoke", async ({
    page,
  }) => {
    const minted = await mintInvoice();

    // ── The holder opens the link (no auth) ──
    const response = await page.goto(`/pay/${minted.token}`);

    // The middleware stamps every bearer-URL surface uncacheable and noindex
    // (S6/S8): a cached copy keyed on the token URL would keep serving a
    // revoked link's payable sheet.
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    const cacheControl = response?.headers()["cache-control"] ?? "";
    expect(cacheControl).toMatch(/no-store|no-cache/);
    expect(cacheControl).not.toMatch(/public|s-maxage|max-age=[1-9]/);

    await expect(page.getByTestId("pay-sheet")).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: /Invoice No\./ }),
    ).toBeVisible();
    await expect(page.getByText("Walnut credenza")).toBeVisible();

    // ── S1: nothing about /pay is in Cache Storage ──
    const cachedPayEntries = await page.evaluate(async () => {
      if (typeof caches === "undefined") return 0;
      const keys = await caches.keys();
      let hits = 0;
      for (const key of keys) {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        hits += requests.filter((request) =>
          request.url.includes("/pay/"),
        ).length;
      }
      return hits;
    });
    expect(cachedPayEntries).toBe(0);

    // ── The chooser: three arrived-at totals, ACH pre-selected ──
    const chooser = page.getByTestId("pay-chooser");
    await expect(
      chooser.getByRole("radio", { name: /bank transfer/i }),
    ).toBeChecked();
    await expect(chooser.getByText("$9,130.00")).toBeVisible();
    await expect(chooser.getByText("$9,398.75")).toBeVisible();
    await expect(chooser.getByText("$9,125.00")).toBeVisible();

    // ── The toggle moves the fee row, the total and the act together ──
    await expect(page.getByTestId("pay-fee-row")).toContainText(
      "Bank transfer fee",
    );
    await expect(page.getByTestId("pay-fee-row")).toContainText("$5.00");
    await expect(page.getByTestId("pay-total-row")).toContainText("$9,130.00");
    await expect(page.getByTestId("pay-act")).toHaveText("Pay $9,130.00");

    await chooser.getByRole("radio", { name: /^card/i }).check();
    await expect(page.getByTestId("pay-fee-row")).toContainText(
      "Card processing fee",
    );
    await expect(page.getByTestId("pay-fee-row")).toContainText("$273.75");
    await expect(page.getByTestId("pay-total-row")).toContainText("$9,398.75");
    await expect(page.getByTestId("pay-act")).toHaveText("Pay $9,398.75");

    await chooser.getByRole("radio", { name: /mail a check/i }).check();
    await expect(page.getByTestId("pay-fee-row")).toHaveCount(0);
    await expect(page.getByTestId("pay-total-row")).toContainText("$9,125.00");
    await expect(page.getByTestId("pay-act")).toContainText(
      "know a check is coming",
    );
    await expect(page.getByTestId("pay-check-panel")).toBeVisible();

    // ── The one live region carries the figure that moved ──
    await expect(page.getByTestId("pay-live-region")).toHaveText(
      /Total to pay \$9,125\.00/,
    );

    // ── `state` re-reads without recording a view, and says little ──
    const stateResponse = await page.request.get(`/pay/${minted.token}/state`);
    expect(stateResponse.status()).toBe(200);
    const state = await stateResponse.json();
    // The exact key set, so a widening is a deliberate act: this body reaches
    // an unauthenticated browser every three seconds.
    expect(Object.keys(state).sort()).toEqual([
      "amount_paid_cents",
      "balance_cents",
      "kind",
      "payable",
      "payments",
      "processing",
      "status",
    ]);
    expect(state.payable).toBe(true);
    expect(state.balance_cents).toBe(912_500);

    // ── Regenerate → the old link is dead ──
    // J21: through the RPC the folio calls, as the designer who owns the
    // invoice — not a raw UPDATE on invoice_links. The revoke is a side effect
    // of minting the replacement, and only this path proves the two happen
    // together.
    const { data: freshToken, error: revokeErr } = await (
      await designer()
    ).rpc("regenerate_invoice_link", { p_invoice_id: minted.invoiceId });
    expect(revokeErr).toBeNull();
    expect(freshToken).toMatch(/^[0-9a-f]{64}$/);
    expect(freshToken).not.toBe(minted.token);

    await page.goto(`/pay/${minted.token}`);
    await expect(page.getByTestId("pay-dead-link")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("Walnut credenza")).toHaveCount(0);
    // The dead sheet names no studio, no number and no amount.
    await expect(page.getByText(/\$/)).toHaveCount(0);
  });

  test("a studio invoice with no house stands on its title", async ({
    page,
  }) => {
    const minted = await mintInvoice({ houseless: true });

    await page.goto(`/pay/${minted.token}`);
    await expect(page.getByTestId("pay-sheet")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("from the studio")).toBeVisible();
    await expect(page.getByText(/Design consultation · June/)).toBeVisible();
  });

  test("void puts the sheet into withdrawn, and the till is gone", async ({
    page,
  }) => {
    // Its OWN mint, with no payment: `_void_invoice_authorized_legacy_00397`
    // raises `has collected payments and cannot be voided` when
    // `amount_paid_cents <> 0` (T-1). The payable fixture above needs that
    // payment; this one needs its absence, so they cannot share a mint.
    const minted = await mintInvoice({ paid: false });

    // J12: as the DESIGNER. `void_invoice`'s guard is
    // `IF NOT FOUND OR NOT _can_manage_invoice_owner(...)`, which evaluates
    // NULL — never true — for an actorless service_role caller, so a
    // service-role void slips past the authority check through a
    // three-valued-logic hole that no real flow uses.
    const { error: voidErr } = await (
      await designer()
    ).rpc("void_invoice", {
      p_invoice_id: minted.invoiceId,
      p_reason: "e2e",
    });
    expect(voidErr).toBeNull();

    await page.goto(`/pay/${minted.token}`);
    await expect(page.getByTestId("pay-withdrawn-sheet")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/was withdrawn by/)).toBeVisible();
    await expect(page.getByTestId("pay-chooser")).toHaveCount(0);
    await expect(page.getByTestId("pay-act")).toHaveCount(0);
  });

  test("the return hop 303s to the sheet, and an unknown nonce to the dead one", async ({
    page,
  }) => {
    const minted = await mintInvoice();

    // Claimed through W1's own RPC, never a raw insert (T-3): the attempts
    // table carries four NOT NULL columns the test has no business inventing
    // (`stripe_customer_id`, `amount_cents`, `currency`,
    // `stripe_idempotency_key`) and a state CHECK that demands a session id
    // for `session_created`. The RPC is also what stamps `return_nonce`, which
    // is the whole point of the hop under test.
    // The customer is stamped on the LINK first, exactly as the real path
    // does it (`_shared/invoice-checkout-stripe.ts` calls
    // `set_invoice_link_stripe_customer`, a compare-and-set that returns the
    // winning customer, before the driver claims the attempt).
    // `claim_invoice_link_checkout_attempt` raises
    // `invoice_checkout_customer_mismatch` while the link still carries no
    // customer, so the two calls cannot be reordered nor the first skipped.
    const customerId = `cus_e2e_${randomUUID().slice(0, 8)}`;
    const { data: linkCustomer, error: customerErr } = await admin().rpc(
      "set_invoice_link_stripe_customer",
      {
        p_link_id: minted.linkId,
        p_stripe_customer_id: customerId,
      },
    );
    expect(customerErr).toBeNull();
    expect(linkCustomer).toBe(customerId);

    const { error: claimErr } = await admin().rpc(
      "claim_invoice_link_checkout_attempt",
      {
        p_invoice_id: minted.invoiceId,
        p_invoice_link_id: minted.linkId,
        p_stripe_customer_id: customerId,
        p_payment_method: "card",
      },
    );
    expect(claimErr).toBeNull();

    const { data: attempt, error: attemptErr } = await admin()
      .from("invoice_checkout_attempts")
      .select("return_nonce")
      .eq("invoice_id", minted.invoiceId)
      .not("return_nonce", "is", null)
      .single();
    expect(attemptErr).toBeNull();
    const nonce = (attempt as { return_nonce: string }).return_nonce;
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);

    const hop = await page.request.get(
      `/pay/return/${nonce}?checkout=success&session_id=cs_1`,
      {
        maxRedirects: 0,
      },
    );
    expect(hop.status()).toBe(303);
    expect(hop.headers()["location"]).toContain(`/pay/${minted.token}`);
    expect(hop.headers()["location"]).toContain("checkout=success");
    expect(hop.headers()["cache-control"]).toBe("private, no-store, max-age=0");

    const stale = await page.request.get(
      `/pay/return/${"0".repeat(64)}?checkout=success`,
      {
        maxRedirects: 0,
      },
    );
    expect(stale.status()).toBe(303);
    expect(stale.headers()["location"]).toContain("/pay/dead");
  });

  test("a garbage token and a malformed one are the same calm dead sheet", async ({
    page,
  }) => {
    await page.goto(`/pay/${"0".repeat(64)}`);
    await expect(page.getByTestId("pay-dead-link")).toBeVisible({
      timeout: 20000,
    });

    await page.goto("/pay/not-a-token");
    await expect(page.getByTestId("pay-dead-link")).toBeVisible({
      timeout: 20000,
    });
  });

  /* ── F6: the letterbox names the invoice without ever fetching it ─────────
     Opening the house signed-in must cost the pay link nothing: a request to
     `/pay/` here would record a view on the link and spend the page's
     rate-limit budget on a letter nobody opened.

     What this does NOT prove is `letterbox.tsx`'s `prefetch={false}`. The
     suite runs against `next dev`, which disables prefetching outright, so
     this test passes just as green with that prop deleted — measured, not
     assumed. The prop is asserted where it can be: `letterbox.test.tsx`
     ('never warms the pay page by scrolling past it'), which does go red when
     it is removed. This test guards the server-rendered and client-effect
     paths instead — a beacon, a loader or a warm-up fetch that reached
     `/pay/` would fail here and nowhere else.

     The fixture is this file's own throwaway invoice, so nothing here can move
     a figure another spec reads. ──────────────────────────────────────────── */
  test("the letterbox names the invoice without ever requesting it", async ({
    page,
  }) => {
    // J21: its OWN invoice and its OWN house. This test used to mint a link on
    // the seed invoice `threshold.spec.ts` drives, which coupled the two files
    // through shared rows for no gain — `mintInvoice` already builds a house
    // this client owns, with a link already on it.
    const minted = await mintInvoice();

    const payRequests: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname === "/pay" || pathname.startsWith("/pay/")) {
        payRequests.push(`${request.method()} ${pathname}`);
      }
    });

    await signInAsClient(page, "client@patina.dev");
    await page.goto(`/projects/${minted.projectId}`, {
      waitUntil: "domcontentloaded",
    });
    // The house is the absence of the hold, not the presence of the doorplate
    // (threshold.tsx holds everything below it until the letter has answered).
    await expect(page.getByTestId("doorplate")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("threshold-hold")).toHaveCount(0, {
      timeout: 90_000,
    });

    // Not a vacuous assertion: the action is on the page, at this token.
    const openInvoice = page.getByRole("link", { name: /open the invoice/i });
    await expect(openInvoice).toBeVisible();
    await expect(openInvoice).toHaveAttribute("href", `/pay/${minted.token}`);

    expect(
      payRequests,
      "the letterbox must not warm /pay/ before the client asks for it",
    ).toEqual([]);
  });

  test("the sheet reflows at 390px with no horizontal scroll", async ({
    page,
  }) => {
    const minted = await mintInvoice();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/pay/${minted.token}`);
    await expect(page.getByTestId("pay-sheet")).toBeVisible({ timeout: 20000 });

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // The money column comes FIRST in DOM order, so a phone reader and a
    // screen-reader user meet the same thing: what is owed, then how to pay.
    const moneyBeforeRecord = await page.evaluate(() => {
      const money = document.querySelector("[data-pay-money]");
      const record = document.querySelector("[data-pay-record]");
      if (!money || !record) return false;
      return !!(
        money.compareDocumentPosition(record) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    });
    expect(moneyBeforeRecord).toBe(true);
  });
});

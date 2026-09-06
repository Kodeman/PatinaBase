import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// The Invoice, Standing Alone (00574) — /pay/[token] is a login-less, public
// invoice with a till on it, resolved server-side by the raw 64-hex token.
// This drives the real route against the LOCAL stack (never Strata),
// following plans-link.spec.ts / share-link.spec.ts:
//   - the invoice is a service-role INSERT at 'draft', then ISSUED through the
//     honest RPC, because the link is minted by the trigger on that status
//     write and nothing else may mint it;
//   - the token comes back from `ensure_invoice_link`, never from a hand-rolled
//     insert, so this exercises the same path the four letter producers use.
//
// Cleanup: rows are left in place under a throwaway project. This is the LOCAL
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

const admin = createClient(LOCAL_URL, SERVICE_JWT, {
  auth: { persistSession: false },
});

// Fail loudly rather than minting nothing and asserting a dead link by
// accident — every test here needs an honestly minted invoice.
test.beforeAll(() => {
  expect(
    SERVICE_JWT,
    "SUPABASE_SERVICE_ROLE_KEY must be exported from the LOCAL stack (see the note above)",
  ).not.toBe("");
});

interface MintedInvoice {
  invoiceId: string;
  projectId: string;
  projectName: string;
  token: string;
}

/**
 * A $9,125.00 balance on a $16,730.00 invoice — the design's own fixture, so
 * the three arrived-at totals are $9,130.00 / $9,398.75 / $9,125.00 and a
 * regression in the surcharge formula fails here loudly.
 */
async function mintInvoice(
  options: { houseless?: boolean } = {},
): Promise<MintedInvoice> {
  const suffix = randomUUID().slice(0, 8);
  const projectId = randomUUID();
  const projectName = `Pay E2E ${suffix}`;
  const invoiceId = randomUUID();

  if (!options.houseless) {
    const { error: projectErr } = await admin.from("projects").insert({
      id: projectId,
      name: projectName,
      status: "active",
      budget_cents: 0,
      design_fee_cents: 0,
      client_visibility_tier: "milestone",
      client_id: CLIENT_ID,
      designer_id: DESIGNER_ID,
      created_by: DESIGNER_ID,
    });
    if (projectErr) throw projectErr;
  }

  // Draft first. Every writer of `status = 'sent'` in the codebase is an
  // UPDATE, and the mint trigger fires on exactly that transition — inserting
  // an already-sent invoice would mint nothing.
  const { error: invoiceErr } = await admin.from("invoices").insert({
    id: invoiceId,
    project_id: options.houseless ? null : projectId,
    designer_id: DESIGNER_ID,
    client_id: CLIENT_ID,
    invoice_number: `E2E-${suffix}`,
    title: options.houseless
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

  const { error: lineErr } = await admin.from("invoice_line_items").insert([
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

  // Issue it — the trigger mints the link on this status write.
  const { error: issueErr } = await admin.rpc("issue_invoice", {
    p_invoice_id: invoiceId,
  });
  if (issueErr) throw issueErr;

  // A part payment, so the sheet renders the partially-paid ladder and the
  // balance the three rows quote is $9,125.00 rather than the whole invoice.
  const { error: paymentErr } = await admin.from("invoice_payments").insert({
    invoice_id: invoiceId,
    amount_cents: 760_500,
    surcharge_cents: 0,
    method: "check",
    status: "succeeded",
    received_at: new Date().toISOString(),
  });
  if (paymentErr) throw paymentErr;

  const { data: token, error: linkErr } = await admin.rpc(
    "ensure_invoice_link",
    {
      p_invoice_id: invoiceId,
    },
  );
  if (linkErr) throw linkErr;
  expect(token).toMatch(/^[0-9a-f]{64}$/);

  return {
    invoiceId,
    projectId,
    projectName,
    token: token as unknown as string,
  };
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
    expect(Object.keys(state).sort()).toEqual([
      "amount_paid_cents",
      "balance_cents",
      "kind",
      "payments",
      "status",
    ]);
    expect(state.balance_cents).toBe(912_500);

    // ── Revoke (a Regenerate) → the link is dead ──
    const { error: revokeErr } = await admin
      .from("invoice_links")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("invoice_id", minted.invoiceId)
      .eq("status", "active");
    expect(revokeErr).toBeNull();

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
    const minted = await mintInvoice();

    const { error: voidErr } = await admin.rpc("void_invoice", {
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

    const nonce = "f".repeat(64);
    const { error: attemptErr } = await admin
      .from("invoice_checkout_attempts")
      .insert({
        invoice_id: minted.invoiceId,
        state: "session_created",
        payment_method: "card",
        return_nonce: nonce,
        invoice_link_id: (
          await admin
            .from("invoice_links")
            .select("id")
            .eq("invoice_id", minted.invoiceId)
            .eq("status", "active")
            .single()
        ).data?.id,
      });
    expect(attemptErr).toBeNull();

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

/**
 * The vendor manifest the Order Assistant puts on the clipboard.
 *
 * Two sides render the same configured piece for the same audience: this
 * formatter, and the PO PDF built by `supabase/functions/po-send`. They share no
 * code — one is portal TypeScript, the other Deno — so the only thing that can
 * hold them together is a shared FIXTURE. Both sides read
 * `supabase/functions/po-send/fixtures/configuration-snapshot.fixture.json`;
 * `po-send/index.test.ts` asserts the vendor block it produces, and the
 * assertions below assert what THIS side does with the identical bytes. A
 * hand-written local fixture would pin nothing: it would drift the moment the
 * snapshot shape moved, and both suites would still be green.
 */
import configurationSpecFixture from "../../../../../../../supabase/functions/po-send/fixtures/configuration-snapshot.fixture.json";
import { formatItemDetailsForClipboard } from "./step-review";

const VENDOR = {
  id: "vendor-1",
  name: "Northstar Workshop",
  default_payment_terms: null,
};
const PROJECT = { id: "project-1", name: "Hawthorn House" };

describe("formatItemDetailsForClipboard", () => {
  it("keeps client retail out of the vendor manifest", () => {
    const result = formatItemDetailsForClipboard(VENDOR, PROJECT, [
      {
        id: "ffe-1",
        name: "Field Sectional",
        line_total_cents: 895_000,
        quantity: 1,
        unit_price_cents: 895_000,
        trade_price_cents: 610_000,
        configurationSnapshotHash: "sha256:sectional-1",
        configurationSnapshot: {
          productName: "Field Sectional",
          configurationMode: "configured",
          schemaRevision: 4,
          selections: [{ groupName: "Upholstery", valueLabel: "Oatmeal linen" }],
          components: [],
          retailPriceCents: 895_000,
          tradePriceCents: 610_000,
          leadTimeWeeks: 12,
          dimensions: null,
        },
      },
    ]);

    expect(result).toContain("$6,100");
    expect(result).not.toContain("$8,950");
    expect(result).not.toContain("Commercial:");
  });

  // ── The cross-side contract, on the SAME bytes the edge function asserts ──

  const fromSharedFixture = () =>
    formatItemDetailsForClipboard(VENDOR, PROJECT, [
      {
        id: "ffe-shared",
        name: "Halden Sofa",
        line_total_cents: 868_000,
        quantity: 1,
        unit_price_cents: 1_240_000,
        trade_price_cents: 868_000,
        configurationSnapshotHash: configurationSpecFixture.configuration_snapshot_hash,
        configurationLockedAt: configurationSpecFixture.configuration_locked_at,
        configurationSnapshot: configurationSpecFixture.configuration_snapshot,
      },
    ]);

  it("renders the shared fixture's configured piece for the vendor", () => {
    const result = fromSharedFixture();
    expect(result).toContain("Configuration: Halden Sofa");
    // The selections the PO prints as "Wood: Walnut" etc. — same three choices.
    expect(result).toContain("Walnut");
    expect(result).toContain("Antique Brass");
    expect(result).toContain("Customer's Own Material");
    expect(result).toContain("Dimensions: 96 × 40 × 33");
    // The snapshot is locked in the fixture, so the manifest says so.
    expect(result).toContain("State: issued snapshot (locked)");
    expect(result).toContain(configurationSpecFixture.configuration_snapshot_hash);
  });

  it("leaks no retail or markup from the shared fixture, exactly as po-send must not", () => {
    const result = fromSharedFixture();
    // The fixture deliberately carries retail everywhere: a 1240000 total and
    // per-selection retail deltas. The vendor manifest prints the trade line
    // amount and nothing else about money.
    expect(result).toContain("$8,680");
    for (const banned of [
      "1240000",
      "12,400",
      "retail",
      "Retail",
      "markup",
      "Markup",
      "Commercial:",
    ]) {
      expect(result).not.toContain(banned);
    }
  });
});

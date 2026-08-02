import { formatItemDetailsForClipboard } from "./step-review";

describe("formatItemDetailsForClipboard", () => {
  it("keeps client retail out of the vendor manifest", () => {
    const result = formatItemDetailsForClipboard(
      {
        id: "vendor-1",
        name: "Northstar Workshop",
        default_payment_terms: null,
      },
      { id: "project-1", name: "Hawthorn House" },
      [
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
            selections: [
              { groupName: "Upholstery", valueLabel: "Oatmeal linen" },
            ],
            components: [],
            retailPriceCents: 895_000,
            tradePriceCents: 610_000,
            leadTimeWeeks: 12,
            dimensions: null,
          },
        },
      ],
    );

    expect(result).toContain("$6,100");
    expect(result).not.toContain("$8,950");
    expect(result).not.toContain("Commercial:");
  });
});

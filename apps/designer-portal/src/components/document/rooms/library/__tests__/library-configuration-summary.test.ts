import {
  capabilityLabels,
  matchesCapabilityFilter,
  readLibraryConfigurationSummary,
} from "../library-configuration-summary";

describe("Library configuration summaries", () => {
  it("describes size variants and their honest starting price", () => {
    const summary = readLibraryConfigurationSummary({
      configuration_mode: "variant",
      configuration_summary: {
        activeVariantCount: 4,
        primaryGroupName: "Size",
        primaryGroupValueCount: 4,
        minRetailPriceCents: 220000,
        maxRetailPriceCents: 310000,
      },
    });

    expect(capabilityLabels(summary)).toEqual(["4 sizes", "From $2,200"]);
    expect(matchesCapabilityFilter(summary, "variant")).toBe(true);
    expect(matchesCapabilityFilter(summary, "modular")).toBe(false);
  });

  it("distinguishes modular configured families from ordinary configured pieces", () => {
    const modular = readLibraryConfigurationSummary({
      configuration_mode: "configured",
      configuration_summary: {
        activeComponentCount: 7,
        minRetailPriceCents: 185000,
      },
    });
    const optionsOnly = readLibraryConfigurationSummary({
      configuration_mode: "configured",
      configuration_summary: {
        groupCount: 2,
        activeComponentCount: 0,
        minRetailPriceCents: 90000,
      },
    });

    expect(capabilityLabels(modular)).toEqual(["Modular", "From $1,850"]);
    expect(matchesCapabilityFilter(modular, "modular")).toBe(true);
    expect(capabilityLabels(optionsOnly)).toEqual([
      "Configurable",
      "From $900",
    ]);
    expect(matchesCapabilityFilter(optionsOnly, "modular")).toBe(false);
    expect(matchesCapabilityFilter(optionsOnly, "configured")).toBe(true);
  });

  it("keeps custom and flat pieces explicit instead of inventing a price", () => {
    const custom = readLibraryConfigurationSummary({
      configuration_mode: "custom",
      configuration_summary: {},
    });
    const flat = readLibraryConfigurationSummary({
      price_retail: null,
    });

    expect(capabilityLabels(custom)).toEqual(["Custom", "Price on request"]);
    expect(capabilityLabels(flat)).toEqual([
      "One specification",
      "Price on request",
    ]);
    expect(matchesCapabilityFilter(flat, "standard")).toBe(true);
  });
});

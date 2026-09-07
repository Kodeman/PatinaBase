import type { AgreementPart } from "@patina/types";
import {
  addPartOptions,
  FEE_BASIS_VARIANTS,
  feeBasisParts,
  scheduleValueIsSet,
} from "../part-kinds";

let seq = 0;
function schedule(
  variant: string,
  payload: Record<string, unknown> = {},
): AgreementPart {
  seq += 1;
  return {
    id: `part-${seq}`,
    proposalId: "agreement-1",
    position: seq,
    kind: "schedule",
    variant: variant as AgreementPart["variant"],
    partKey: `custom.${variant}-${seq}`,
    title: variant,
    payload,
    required: false,
    clientVisible: true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
  };
}

beforeEach(() => {
  seq = 0;
});

describe("addPartOptions — R18, one fee basis", () => {
  it("offers both fee bases on an agreement that names neither", () => {
    const offered = addPartOptions([]).map((option) => option.variant);
    expect(offered).toEqual(expect.arrayContaining(["flat", "per_phase"]));
  });

  it("offers neither once the agreement carries a flat fee", () => {
    const offered = addPartOptions([schedule("flat", { cents: 900_000 })]).map(
      (option) => option.variant,
    );
    expect(offered).not.toContain("flat");
    expect(offered).not.toContain("per_phase");
  });

  it("offers neither once the agreement carries a fee by phase", () => {
    const offered = addPartOptions([schedule("per_phase", { phases: [] })]).map(
      (option) => option.variant,
    );
    expect(offered).not.toContain("per_phase");
    expect(offered).not.toContain("flat");
  });

  it("leaves the rest of the menu standing", () => {
    const offered = addPartOptions([schedule("flat")]).map(
      (option) => option.variant,
    );
    expect(offered).toEqual(
      expect.arrayContaining(["rate_card", "ceiling", "retainer", "cadence"]),
    );
  });

  it("still refuses a second ceiling — the per-variant rule is untouched", () => {
    const offered = addPartOptions([schedule("ceiling", { cents: 100 })]).map(
      (option) => option.variant,
    );
    expect(offered).not.toContain("ceiling");
    expect(offered).toContain("flat");
  });
});

describe("feeBasisParts", () => {
  it("names exactly flat and per_phase", () => {
    expect([...FEE_BASIS_VARIANTS].sort()).toEqual(["flat", "per_phase"]);
  });

  it("returns them in rail order and nothing else", () => {
    const flat = schedule("flat");
    const ceiling = schedule("ceiling");
    const perPhase = schedule("per_phase");
    expect(feeBasisParts([flat, ceiling, perPhase])).toEqual([flat, perPhase]);
  });
});

describe("scheduleValueIsSet — the Wave 2 fee schedules", () => {
  it.each([
    ["percent_of_cost", { basis: "cost", percent: 12 }],
    ["percent_of_spend", { basis: "spend", percent: 8.5 }],
    ["cost_plus", { markupPercent: 18 }],
    ["day_rate", { dayRateCents: 120_000 }],
    ["package", { name: "One room", priceCents: 850_000, includes: [] }],
  ])("reads a written %s as set", (variant, payload) => {
    expect(scheduleValueIsSet(schedule(variant, payload))).toBe(true);
  });

  it.each([
    ["percent_of_cost", {}],
    ["percent_of_spend", { basis: "spend", percent: null }],
    ["cost_plus", { disclosure: "How net is established." }],
    ["day_rate", { minimumDays: 2 }],
    ["package", { name: "  ", priceCents: 850_000 }],
    ["package", { name: "One room", priceCents: null }],
  ])("reads an empty %s as unset", (variant, payload) => {
    expect(scheduleValueIsSet(schedule(variant, payload))).toBe(false);
  });

  it("still answers true for a variant the room opens no editor for", () => {
    expect(scheduleValueIsSet(schedule("draws", {}))).toBe(true);
  });
});

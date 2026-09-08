/**
 * J-5 — the Halvorsen kitchen and mudroom, cent for cent.
 *
 * The same table SQL-T6 asserts against the database, asserted here against
 * the browser's own arithmetic, so the two cannot drift: a homeowner reading
 * a draw schedule on her door and a designer reading it in the Contract Room
 * must be reading one number.
 *
 * The figures are READ from `source/fixtures.json`, never retyped. A fixture
 * that moves has to move the code with it; a fixture that goes missing fails
 * this suite loudly rather than quietly asserting nothing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeDrawGross,
  computeRetainage,
  contractSumCents,
  costBasisCents,
  drawTable,
  feeCents,
  readCostLines,
  readDraws,
  readPricingBasis,
  readSubDisclosure,
  withCostBasisCents,
  scheduleOfValues,
  totalPaidCents,
  validateDrawSet,
  validatePricingBasis,
} from "../design-build";
import type { DesignBuildPricingBasisPayload } from "@patina/types";

const FIXTURES_PATH = join(
  __dirname,
  "../../../../../../artifacts/agreement-composed-2026-09-06/source/fixtures.json",
);

interface HalvorsenFixture {
  costBasisLines: {
    id: string;
    label: string;
    category: string;
    basisCents: number;
  }[];
  feePct: number;
  retainagePct: number;
  draws: {
    id: string;
    label: string;
    pct: number;
    retainageApplies: boolean;
  }[];
  expected: {
    costBasisCents: number;
    feeCents: number;
    gmpCents: number;
    scheduleOfValuesCents: Record<string, number>;
    scheduleOfValuesTotalCents: number;
    drawsGrossCents: Record<string, number>;
    drawsGrossTotalCents: number;
    retainageHeldCents: Record<string, number>;
    retainageCumulativeCents: Record<string, number>;
    retainageTotalCents: number;
    drawsNetCents: Record<string, number>;
    finalRetainageReleaseCents: number;
    totalPaidCents: number;
  };
}

const halvorsen: HalvorsenFixture = JSON.parse(
  readFileSync(FIXTURES_PATH, "utf8"),
).halvorsen;

/** The pricing basis exactly as the composer would hold it after step 5 of
 *  the walk. `subMarkupBps` is deliberately absent — step 8 is where a markup
 *  enters, and the no-double-count suite is where it is tested. */
function pricingBasisPayload(): Record<string, unknown> {
  return {
    basis: "cost_plus_gmp",
    costLines: halvorsen.costBasisLines,
    feeBps: halvorsen.feePct * 100,
    gmpCents: halvorsen.expected.gmpCents,
    subDisclosure: "closed_book",
  };
}

function drawsPayload(): Record<string, unknown> {
  return {
    draws: halvorsen.draws.map((draw, index) => ({
      key: draw.id === "roughIn" ? "rough_in" : draw.id,
      label: draw.label,
      sortOrder: index,
      pct: draw.pct,
      retainageApplies: draw.retainageApplies,
    })),
    retainageBps: halvorsen.retainagePct * 100,
  };
}

/** The walk's draw ids, in schedule order, so a keyed expectation can be read
 *  positionally without retyping either list. */
const DRAW_IDS = ["deposit", "roughIn", "cabinetsSet", "substantialCompletion"];

describe("the Halvorsen pricing basis", () => {
  const basis: DesignBuildPricingBasisPayload = readPricingBasis(
    pricingBasisPayload(),
  );

  it("reads the seven cost lines, general conditions included", () => {
    expect(readCostLines(pricingBasisPayload())).toHaveLength(7);
    expect(
      readCostLines(pricingBasisPayload()).find(
        (line) => line.id === "generalConditions",
      )?.category,
    ).toBe("general_conditions");
  });

  it("sums the cost basis to the cent", () => {
    expect(costBasisCents(basis)).toBe(halvorsen.expected.costBasisCents);
  });

  it("takes the fee to the cent", () => {
    expect(feeCents(basis)).toBe(halvorsen.expected.feeCents);
  });

  it("reaches the guaranteed maximum price to the cent", () => {
    expect(contractSumCents(basis)).toBe(halvorsen.expected.gmpCents);
    expect(costBasisCents(basis) + feeCents(basis)).toBe(
      halvorsen.expected.gmpCents,
    );
  });

  it("is valid", () => {
    expect(validatePricingBasis(basis)).toBeNull();
  });

  it("carries the cost basis the database asserts, on the read payload", () => {
    // `_validate_pricing_basis_payload` refuses a payload whose
    // `costBasisCents` is not exactly Σ of the lines beneath it.
    expect(basis.costBasisCents).toBe(halvorsen.expected.costBasisCents);
    expect(basis.costBasisCents).toBe(costBasisCents(basis));
    expect(withCostBasisCents(pricingBasisPayload()).costBasisCents).toBe(
      halvorsen.expected.costBasisCents,
    );
  });

  it("reads an unwritten basis and mode as unwritten, never as a default", () => {
    // The seeded template lays both down as NULL. A default here would make
    // readiness green over the question the send door asks first.
    const blank = readPricingBasis({ costLines: halvorsen.costBasisLines });
    expect(blank.basis).toBeNull();
    expect(blank.subDisclosure).toBeNull();
    expect(contractSumCents(blank)).toBeNull();
    expect(scheduleOfValues(blank)).toEqual([]);
    expect(validatePricingBasis(blank)).toBe(
      "Choose how this agreement is priced.",
    );
  });

  it("reads an unwritten disclosure clause as unwritten", () => {
    expect(readSubDisclosure({ body: "" }).mode).toBeNull();
  });

  it("refuses a GMP that is a cent away from cost plus fee", () => {
    const off = readPricingBasis({
      ...pricingBasisPayload(),
      gmpCents: halvorsen.expected.gmpCents + 1,
    });
    expect(validatePricingBasis(off)).toBe(
      "The cost basis plus the fee must equal the guaranteed maximum price, to the cent.",
    );
  });
});

describe("the Halvorsen schedule of values", () => {
  const basis = readPricingBasis(pricingBasisPayload());

  it("pro-rates every line under closed-book, to the cent", () => {
    const lines = scheduleOfValues(basis, "closed_book");
    const byId = Object.fromEntries(lines.map((line) => [line.id, line.cents]));
    expect(byId).toEqual(halvorsen.expected.scheduleOfValuesCents);
  });

  it("sums to the contract sum", () => {
    const lines = scheduleOfValues(basis, "closed_book");
    expect(lines.reduce((sum, line) => sum + line.cents, 0)).toBe(
      halvorsen.expected.scheduleOfValuesTotalCents,
    );
  });

  it("shows the trades at cost and the fee as its own line under open-book", () => {
    const lines = scheduleOfValues(basis, "open_book");
    const trades = lines.filter((line) => line.id !== "fee");
    expect(trades.map((line) => line.cents)).toEqual(
      halvorsen.costBasisLines.map((line) => line.basisCents),
    );
    expect(lines.find((line) => line.id === "fee")?.cents).toBe(
      halvorsen.expected.feeCents,
    );
    expect(lines.reduce((sum, line) => sum + line.cents, 0)).toBe(
      halvorsen.expected.gmpCents,
    );
  });

  it("never lets a closed-book line be divided back into a sub’s bid", () => {
    // RC-4: under closed-book every line carries the fee, so `line ÷ (1 + fee)`
    // is the cost — which is exactly why no line may equal a cost line.
    const lines = scheduleOfValues(basis, "closed_book");
    for (const line of lines) {
      const cost = halvorsen.costBasisLines.find((l) => l.id === line.id);
      expect(line.cents).not.toBe(cost?.basisCents);
    }
  });
});

describe("the Halvorsen draw schedule", () => {
  const basis = readPricingBasis(pricingBasisPayload());
  const draws = readDraws(drawsPayload());
  const sum = contractSumCents(basis) as number;

  it("is valid", () => {
    expect(validateDrawSet(sum, draws)).toBeNull();
  });

  it("draws gross to the cent, and they sum to the contract sum", () => {
    const gross = computeDrawGross(sum, draws.draws);
    expect(Object.fromEntries(DRAW_IDS.map((id, i) => [id, gross[i]]))).toEqual(
      halvorsen.expected.drawsGrossCents,
    );
    expect(gross.reduce((total, value) => total + value, 0)).toBe(
      halvorsen.expected.drawsGrossTotalCents,
    );
  });

  it("withholds retainage on every draw but the deposit", () => {
    const rows = drawTable(sum, draws);
    const work = rows.filter((row) => !row.isRetainageRelease);
    expect(work[0].retainageCents).toBe(0);
    const held = Object.fromEntries(
      DRAW_IDS.slice(1).map((id, i) => [id, work[i + 1].retainageCents]),
    );
    expect(held).toEqual(halvorsen.expected.retainageHeldCents);
  });

  it("carries the cumulative retainage the walk reads", () => {
    const rows = drawTable(sum, draws).filter((row) => !row.isRetainageRelease);
    const cumulative = Object.fromEntries(
      DRAW_IDS.slice(1).map((id, i) => [
        id,
        rows[i + 1].retainageHeldToDateCents,
      ]),
    );
    expect(cumulative).toEqual(halvorsen.expected.retainageCumulativeCents);
  });

  it("pays each draw net, retainage withheld and not billed", () => {
    const rows = drawTable(sum, draws).filter((row) => !row.isRetainageRelease);
    expect(
      Object.fromEntries(DRAW_IDS.map((id, i) => [id, rows[i].netCents])),
    ).toEqual(halvorsen.expected.drawsNetCents);
  });

  it("pins a final release row for exactly what was withheld", () => {
    const rows = drawTable(sum, draws);
    const release = rows[rows.length - 1];
    expect(release.isRetainageRelease).toBe(true);
    expect(release.label).toBe("Final · retainage release");
    expect(release.netCents).toBe(
      halvorsen.expected.finalRetainageReleaseCents,
    );
    expect(release.netCents).toBe(halvorsen.expected.retainageTotalCents);
  });

  it("closes the identity — every net paid, plus the release, is the GMP", () => {
    expect(totalPaidCents(drawTable(sum, draws))).toBe(
      halvorsen.expected.totalPaidCents,
    );
    expect(halvorsen.expected.totalPaidCents).toBe(halvorsen.expected.gmpCents);
  });

  it("draws no release row when nothing is withheld", () => {
    const noRetainage = readDraws({ ...drawsPayload(), retainageBps: 0 });
    const rows = drawTable(sum, noRetainage);
    expect(rows.some((row) => row.isRetainageRelease)).toBe(false);
    expect(totalPaidCents(rows)).toBe(halvorsen.expected.gmpCents);
  });

  it("computes retainage on cents, never on a rounded percent", () => {
    expect(computeRetainage(2_524_020, 500)).toBe(126_201);
    expect(computeRetainage(3_365_360, 500)).toBe(168_268);
    expect(computeRetainage(1_682_680, 500)).toBe(84_134);
  });
});

describe("the draw schedule's refusals", () => {
  const basis = readPricingBasis(pricingBasisPayload());
  const sum = contractSumCents(basis) as number;

  it("refuses percentages that do not come to 100", () => {
    const payload = drawsPayload() as { draws: { pct: number }[] };
    payload.draws[1].pct = 29;
    expect(validateDrawSet(sum, readDraws(payload))).toBe(
      "The draws come to 99% — they must come to 100%.",
    );
  });

  it("refuses retainage on the deposit — nothing has been built yet", () => {
    const payload = drawsPayload() as {
      draws: { retainageApplies: boolean }[];
    };
    payload.draws[0].retainageApplies = true;
    expect(validateDrawSet(sum, readDraws(payload))).toBe(
      "The deposit does not carry retainage — nothing has been built yet.",
    );
  });

  it("refuses retainage above ten percent", () => {
    expect(
      validateDrawSet(
        sum,
        readDraws({ ...drawsPayload(), retainageBps: 1_500 }),
      ),
    ).toBe("Retainage must be between 0 and 10 percent.");
  });

  it("refuses a lone draw", () => {
    const payload = drawsPayload() as { draws: unknown[] };
    payload.draws = [payload.draws[0]];
    expect(validateDrawSet(sum, readDraws(payload))).toBe(
      "A schedule needs at least a deposit and a second draw.",
    );
  });

  it("refuses two draws sharing a key", () => {
    const payload = drawsPayload() as { draws: { key: string }[] };
    payload.draws[2].key = "rough_in";
    expect(validateDrawSet(sum, readDraws(payload))).toBe(
      "Two draws share a key. Rename one.",
    );
  });

  it("refuses drawing against a contract sum nobody has written", () => {
    expect(validateDrawSet(null, readDraws(drawsPayload()))).toBe(
      "Set the contract sum on the pricing basis before drawing against it.",
    );
  });
});

/**
 * The turnkey editors, through the part editor that dispatches to them.
 *
 * The dispatch itself is half the point: with no turnkey context the editor
 * falls through to Wave 1's read-only card, which is what the flag-off
 * snapshot next door pins in pixels and what the first case here pins in
 * behaviour.
 *
 * The arithmetic is not re-asserted here — `design-build-arithmetic.test.ts`
 * pins it against `source/fixtures.json`. These cases pin what the room
 * DRAWS and what it WRITES.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { PartEditor } from "../part-editor";
import { JurisdictionAttachments } from "../turnkey/jurisdiction-attachments";
import { TURNKEY_PART_KEYS, type TurnkeyContext } from "../turnkey/context";
import { UNWRITTEN_NOTE } from "../turnkey/schedule-of-values";
import { MODE_UNCHOSEN_NOTE } from "../turnkey/sub-disclosure-clause";

const mockJurisdictionNotices = jest.fn();
const mockTradeAgreements = jest.fn();

jest.mock("@patina/supabase", () => ({
  useAgreementJurisdictionNotices: () => mockJurisdictionNotices(),
  useTradeAgreements: () => mockTradeAgreements(),
}));

let seq = 0;
function part(
  input: Partial<AgreementPart> & { partKey: string },
): AgreementPart {
  seq += 1;
  return {
    id: input.id ?? `part-${seq}`,
    proposalId: "agreement-1",
    position: input.position ?? seq,
    kind: input.kind ?? "clause",
    variant: input.variant ?? null,
    partKey: input.partKey,
    title: input.title ?? "Part",
    payload: input.payload ?? {},
    required: false,
    clientVisible: true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
  };
}

const PRICING_BASIS = part({
  partKey: TURNKEY_PART_KEYS.pricingBasis,
  kind: "schedule",
  variant: "pricing_basis",
  title: "Pricing basis",
  payload: {
    basis: "cost_plus_gmp",
    feeBps: 1800,
    gmpCents: 8_413_400,
    subDisclosure: "closed_book",
    costLines: [
      {
        id: "cabinetry",
        label: "Cabinetry & millwork",
        category: "sub",
        basisCents: 3_800_000,
      },
      {
        id: "electrical",
        label: "Electrical",
        category: "sub",
        basisCents: 950_000,
      },
      {
        id: "plumbing",
        label: "Plumbing",
        category: "sub",
        basisCents: 720_000,
      },
      {
        id: "generalConditions",
        label: "General conditions / site",
        category: "general_conditions",
        basisCents: 630_000,
      },
      {
        id: "tile",
        label: "Tile allowance",
        category: "allowance",
        basisCents: 400_000,
      },
      {
        id: "plumbingFixtures",
        label: "Plumbing fixtures allowance",
        category: "allowance",
        basisCents: 350_000,
      },
      {
        id: "lighting",
        label: "Lighting allowance",
        category: "allowance",
        basisCents: 280_000,
      },
    ],
    // R43 — the client-facing schedule of values, written by the studio and
    // summing to the guaranteed maximum. Under a closed book this is what the
    // homeowner reads; the cost lines above are the studio's own.
    scheduleOfValues: [
      { id: "kitchen", label: "Kitchen", cents: 6_400_000 },
      { id: "mudroom", label: "Mudroom", cents: 2_013_400 },
    ],
  },
});

const DRAWS = part({
  partKey: TURNKEY_PART_KEYS.draws,
  kind: "schedule",
  variant: "draws",
  title: "Draws",
  payload: {
    retainageBps: 500,
    draws: [
      {
        key: "deposit",
        label: "Deposit at signing",
        sortOrder: 0,
        pct: 10,
        retainageApplies: false,
      },
      {
        key: "rough_in",
        label: "Rough-in",
        sortOrder: 1,
        pct: 30,
        retainageApplies: true,
      },
      {
        key: "cabinets_set",
        label: "Cabinets set",
        sortOrder: 2,
        pct: 40,
        retainageApplies: true,
      },
      {
        key: "substantial_completion",
        label: "Substantial completion",
        sortOrder: 3,
        pct: 20,
        retainageApplies: true,
      },
    ],
  },
});

const SUB_DISCLOSURE = part({
  partKey: TURNKEY_PART_KEYS.subDisclosure,
  kind: "clause",
  title: "Who is doing the work",
  payload: { body: "", mode: "closed_book" },
});

function contextOf(
  parts: AgreementPart[],
  writePart = jest.fn(),
  projectId: string | null = "project-1",
): TurnkeyContext {
  return { parts, writePart, projectId };
}

function renderTurnkey(
  target: AgreementPart,
  context: TurnkeyContext | undefined,
  onChange = jest.fn(),
) {
  render(
    <PartEditor
      part={target}
      onChange={onChange}
      readOnly={false}
      libraryOn
      turnkey={context}
    />,
  );
  return onChange;
}

beforeEach(() => {
  seq = 0;
  jest.clearAllMocks();
  mockJurisdictionNotices.mockReturnValue({ data: [], isLoading: false });
  mockTradeAgreements.mockReturnValue({ data: [], isLoading: false });
});

describe("the dispatch", () => {
  it("leaves the pricing basis in the read-only card with no turnkey context", () => {
    renderTurnkey(PRICING_BASIS, undefined);
    expect(
      screen.getByText(/This part opens in a later release/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Fee percent")).not.toBeInTheDocument();
  });

  it("opens the pricing-basis editor once the context is handed down", () => {
    renderTurnkey(PRICING_BASIS, contextOf([PRICING_BASIS]));
    expect(screen.getByLabelText("Fee percent")).toBeInTheDocument();
    expect(
      screen.queryByText(/This part opens in a later release/),
    ).not.toBeInTheDocument();
  });
});

describe("the pricing-basis editor", () => {
  it("draws the three derived chips M6 draws", () => {
    const { container } = render(
      <PartEditor
        part={PRICING_BASIS}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS])}
      />,
    );
    expect(
      container.querySelector('[data-chip="cost-basis"]')?.textContent,
    ).toBe("Cost basis $71,300.00");
    expect(container.querySelector('[data-chip="fee"]')?.textContent).toBe(
      "Fee 18% · $12,834.00",
    );
    expect(
      container.querySelector('[data-chip="contract-sum"]')?.textContent,
    ).toBe("GMP $84,134.00");
  });

  /**
   * The seeded turnkey template lays `basis` down as NULL and the clause's
   * `mode` as NULL. A reader that answered "cost_plus_gmp" and "closed_book"
   * would draw two pressed buttons over a payload that says nothing, let
   * readiness go green, and be refused at the send door — and closed-book is
   * a term the homeowner reads (R13, R21).
   */
  const unwritten = part({
    partKey: TURNKEY_PART_KEYS.pricingBasis,
    kind: "schedule",
    variant: "pricing_basis",
    title: "Pricing basis",
    payload: {
      basis: null,
      costBasisCents: null,
      feeBps: null,
      gmpCents: null,
      subDisclosure: null,
      costLines: [
        {
          id: "cabinetry",
          label: "Cabinetry & millwork",
          category: "sub",
          basisCents: 3_800_000,
        },
      ],
    },
  });

  it("presses no basis until the designer chooses one", () => {
    render(
      <PartEditor
        part={unwritten}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([unwritten])}
      />,
    );
    for (const name of [
      "Fixed price",
      "Cost-plus",
      "Cost-plus with GMP",
      "Time and materials with a not-to-exceed",
    ]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    // No basis, so no contract-sum field standing in for the unanswered
    // question — and the refusal the send door would give, given here.
    expect(screen.queryByLabelText("GMP dollars")).not.toBeInTheDocument();
    expect(
      screen.getByText("Choose how this agreement is priced."),
    ).toBeInTheDocument();
  });

  it("draws no schedule of values over an unwritten basis", () => {
    const { container } = render(
      <PartEditor
        part={unwritten}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([unwritten])}
      />,
    );
    expect(
      container.querySelector('[data-sov-line="cabinetry"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(UNWRITTEN_NOTE)).toBeInTheDocument();
  });

  it("draws no schedule of values until the disclosure mode is chosen", () => {
    // A written basis with a contract sum, and no mode: pro-rating IS the
    // closed-book presentation, so there is no honest table yet.
    const noMode = part({
      partKey: TURNKEY_PART_KEYS.subDisclosure,
      kind: "clause",
      title: "Who is doing the work",
      payload: { body: "" },
    });
    const { container } = render(
      <PartEditor
        part={PRICING_BASIS}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, noMode])}
      />,
    );
    expect(
      container.querySelector('[data-sov-line="cabinetry"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(UNWRITTEN_NOTE)).toBeInTheDocument();
  });

  it("carries the derived cost basis on every write", () => {
    const onChange = renderTurnkey(PRICING_BASIS, contextOf([PRICING_BASIS]));
    fireEvent.change(screen.getByLabelText("Cost line 2 amount"), {
      target: { value: "10000" },
    });
    const written = onChange.mock.calls.at(-1)?.[0] as {
      costBasisCents: number;
      costLines: { basisCents: number }[];
    };
    expect(written.costBasisCents).toBe(
      written.costLines.reduce((sum, line) => sum + line.basisCents, 0),
    );
    expect(written.costBasisCents).toBe(7_180_000);
  });

  it("hides the fee percentage on a fixed price and clears it", () => {
    const onChange = renderTurnkey(PRICING_BASIS, contextOf([PRICING_BASIS]));
    fireEvent.click(screen.getByRole("button", { name: "Fixed price" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ basis: "fixed", feeBps: null }),
    );
  });

  it("shows the studio's own lines under closed-book, and no cost line", () => {
    const { container } = render(
      <PartEditor
        part={PRICING_BASIS}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, SUB_DISCLOSURE])}
      />,
    );
    expect(
      container.querySelector('[data-sov-line="kitchen"]')?.textContent,
    ).toContain("$64,000.00");
    expect(
      container.querySelector('[data-sov-line="cabinetry"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-sov-line="fee"]'),
    ).not.toBeInTheDocument();
    // The pro-rated figure this wave stopped publishing is nowhere on the page.
    expect(container.textContent).not.toContain("$44,840.00");
  });

  /* R43 — the closed-book lines are TYPED, in this editor, so the studio can
     divide the work the way it sells it. */
  it("writes a client-facing schedule-of-values line the studio types", () => {
    const onChange = jest.fn();
    render(
      <PartEditor
        part={PRICING_BASIS}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, SUB_DISCLOSURE])}
      />,
    );
    fireEvent.change(screen.getByLabelText("Schedule of values line 1"), {
      target: { value: "Kitchen and pantry" },
    });
    const written = onChange.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(
      (written.scheduleOfValues as { label: string }[])[0].label,
    ).toBe("Kitchen and pantry");
    expect(written.costLines).toEqual(PRICING_BASIS.payload.costLines);
  });

  it("offers no client schedule of values under open-book", () => {
    const openBook = { ...SUB_DISCLOSURE, payload: { mode: "open_book" } };
    render(
      <PartEditor
        part={PRICING_BASIS}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, openBook])}
      />,
    );
    expect(
      screen.queryByLabelText("Schedule of values line 1"),
    ).not.toBeInTheDocument();
  });

  it("shows the fee as its own line under open-book", () => {
    const openBook = { ...SUB_DISCLOSURE, payload: { mode: "open_book" } };
    const { container } = render(
      <PartEditor
        part={PRICING_BASIS}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, openBook])}
      />,
    );
    expect(
      container.querySelector('[data-sov-line="cabinetry"]')?.textContent,
    ).toContain("$38,000.00");
    expect(container.querySelector('[data-sov-line="fee"]')?.textContent).toBe(
      "Fee · 18%$12,834.00",
    );
  });
});

describe("the draws editor", () => {
  it("derives gross, held and net for every row", () => {
    const { container } = render(
      <PartEditor
        part={DRAWS}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, DRAWS])}
      />,
    );
    const roughIn = container.querySelector(
      '[data-draw-key="rough_in"]',
    ) as HTMLElement;
    expect(roughIn.querySelector('[data-cell="gross"]')?.textContent).toBe(
      "$25,240.20",
    );
    expect(roughIn.querySelector('[data-cell="retainage"]')?.textContent).toBe(
      "$1,262.01",
    );
    expect(roughIn.querySelector('[data-cell="net"]')?.textContent).toBe(
      "$23,978.19",
    );
  });

  it("pins a final release row for exactly what was withheld", () => {
    const { container } = render(
      <PartEditor
        part={DRAWS}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, DRAWS])}
      />,
    );
    const release = container.querySelector(
      '[data-draw-key="retainage_release"]',
    ) as HTMLElement;
    expect(release.textContent).toContain("Final · retainage release");
    expect(release.querySelector('[data-cell="net"]')?.textContent).toBe(
      "$3,786.03",
    );
  });

  it("will not let the deposit carry retainage", () => {
    render(
      <PartEditor
        part={DRAWS}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, DRAWS])}
      />,
    );
    expect(screen.getByLabelText("Retainage applies to draw 1")).toBeDisabled();
    expect(
      screen.getByLabelText("Retainage applies to draw 2"),
    ).not.toBeDisabled();
  });
});

describe("minting a draw key", () => {
  /**
   * The key is the identity the ledger row and the invoice are stamped with
   * (I-3 takes `p_draw_key`), and it is frozen once minted — so a key minted
   * from the array's LENGTH is a bug with no escape hatch: remove a middle
   * draw, add one, and `draw_3` arrives twice with no rename control anywhere
   * in this editor.
   */
  const keysWritten = (onChange: jest.Mock) => {
    const payload = onChange.mock.calls.at(-1)?.[0] as {
      draws: { key: string }[];
    };
    return payload.draws.map((draw) => draw.key);
  };

  it("does not repeat a key after a middle draw is removed", () => {
    // [deposit, rough_in, cabinets_set, substantial_completion] with the
    // middle two removed leaves [deposit, substantial_completion]; the row
    // added next used to be `draw_3`, which is nothing here, but the shape is
    // the same one that collides. Drive the real removal first.
    const onChange = jest.fn();
    const { rerender } = render(
      <PartEditor
        part={DRAWS}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, DRAWS])}
      />,
    );
    // Remove "Cabinets set" (row 3 of 4).
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[2]);
    const afterRemoval = keysWritten(onChange);
    expect(afterRemoval).toEqual([
      "deposit",
      "rough_in",
      "substantial_completion",
    ]);

    const shortened = {
      ...DRAWS,
      payload: {
        ...DRAWS.payload,
        draws: (onChange.mock.calls.at(-1)?.[0] as { draws: unknown[] }).draws,
      },
    };
    onChange.mockClear();
    rerender(
      <PartEditor
        part={shortened}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, shortened])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Add a draw" }));
    const keys = keysWritten(onChange);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => key === "deposit")).toHaveLength(1);
  });

  it("re-seats the deposit when the first draw is removed", () => {
    // Remove the deposit from [deposit, rough_in, cabinets_set,
    // substantial_completion] and the first row used to be `rough_in` — which
    // `validateDrawSet` and the database both refuse, and which this editor
    // offered no way to rename. Re-keying is safe: the ledger is materialized
    // at SEND and the composer is read-only from that moment.
    const onChange = jest.fn();
    render(
      <PartEditor
        part={DRAWS}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, DRAWS])}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    const written = onChange.mock.calls.at(-1)?.[0] as {
      draws: { key: string; retainageApplies: boolean; sortOrder: number }[];
    };
    expect(written.draws.map((draw) => draw.key)).toEqual([
      "deposit",
      "cabinets_set",
      "substantial_completion",
    ]);
    expect(written.draws[0].retainageApplies).toBe(false);
    expect(written.draws.map((draw) => draw.sortOrder)).toEqual([0, 1, 2]);
    expect(new Set(written.draws.map((draw) => draw.key)).size).toBe(3);
  });

  it("re-mints a later row that already carried the deposit key", () => {
    const onChange = jest.fn();
    const twoDeposits = {
      ...DRAWS,
      payload: {
        retainageBps: 500,
        draws: [
          {
            key: "first",
            label: "Money on signing",
            sortOrder: 0,
            pct: 50,
            retainageApplies: false,
          },
          {
            key: "deposit",
            label: "Second draw",
            sortOrder: 1,
            pct: 50,
            retainageApplies: true,
          },
        ],
      },
    };
    render(
      <PartEditor
        part={twoDeposits}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, twoDeposits])}
      />,
    );
    fireEvent.change(screen.getByLabelText("Draw 1 percent"), {
      target: { value: "40" },
    });
    const keys = keysWritten(onChange);
    expect(keys[0]).toBe("deposit");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never mints the reserved retainage-release key", () => {
    const onChange = jest.fn();
    const nearlyReserved = {
      ...DRAWS,
      payload: {
        retainageBps: 500,
        draws: [
          {
            key: "deposit",
            label: "Deposit",
            sortOrder: 0,
            pct: 50,
            retainageApplies: false,
          },
          {
            key: "retainage_release",
            label: "Retainage release",
            sortOrder: 1,
            pct: 50,
            retainageApplies: true,
          },
        ],
      },
    };
    render(
      <PartEditor
        part={nearlyReserved}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, nearlyReserved])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Add a draw" }));
    const keys = keysWritten(onChange);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps the first row's key `deposit`, whatever it is called", () => {
    const onChange = jest.fn();
    const keyless = {
      ...DRAWS,
      payload: {
        retainageBps: 0,
        draws: [
          {
            key: "",
            label: "",
            sortOrder: 0,
            pct: 100,
            retainageApplies: false,
          },
        ],
      },
    };
    render(
      <PartEditor
        part={keyless}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, keyless])}
      />,
    );
    fireEvent.change(screen.getByLabelText("Draw 1"), {
      target: { value: "Money on signing" },
    });
    expect(keysWritten(onChange)).toEqual(["deposit"]);
  });
});

describe("the allowances editor", () => {
  const allowances = part({
    partKey: TURNKEY_PART_KEYS.allowances,
    kind: "schedule",
    variant: "allowances",
    title: "Allowances",
    payload: {
      allowances: [
        {
          id: "tile",
          label: "Tile allowance",
          amountCents: 400_000,
          overageRule: "change_order",
          underageRule: "credit",
        },
      ],
    },
  });

  it("writes the matching cost line in the same act", () => {
    const writePart = jest.fn();
    const onChange = jest.fn();
    render(
      <PartEditor
        part={allowances}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, allowances], writePart)}
      />,
    );
    fireEvent.change(screen.getByLabelText("Allowance 1 amount"), {
      target: { value: "4500" },
    });
    expect(onChange).toHaveBeenCalled();
    const [key, payload] = writePart.mock.calls[0];
    expect(key).toBe(TURNKEY_PART_KEYS.pricingBasis);
    const lines = (
      payload as { costLines: { id: string; basisCents: number }[] }
    ).costLines;
    const tile = lines.find((line) => line.id === "tile");
    expect(tile?.basisCents).toBe(450_000);
    // Every non-allowance line survives untouched.
    expect(lines.filter((line) => line.id === "cabinetry")).toHaveLength(1);
  });

  it("rewrites the allowance line in place, never at the end", () => {
    // The pricing basis' LAST cost line takes the schedule of values'
    // rounding remainder. A rebuild that dropped the allowance lines and
    // re-appended them would move which row absorbs the cents — a change to
    // the paper made by typing in a field that has nothing to do with it.
    const writePart = jest.fn();
    const basisWithAllowanceInTheMiddle = {
      ...PRICING_BASIS,
      payload: {
        ...PRICING_BASIS.payload,
        costLines: [
          {
            id: "cabinetry",
            label: "Cabinetry & millwork",
            category: "sub",
            basisCents: 3_800_000,
          },
          {
            id: "tile",
            label: "Tile allowance",
            category: "allowance",
            basisCents: 400_000,
          },
          {
            id: "electrical",
            label: "Electrical",
            category: "sub",
            basisCents: 950_000,
          },
        ],
      },
    };
    render(
      <PartEditor
        part={allowances}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf(
          [basisWithAllowanceInTheMiddle, allowances],
          writePart,
        )}
      />,
    );
    fireEvent.change(screen.getByLabelText("Allowance 1 amount"), {
      target: { value: "4500" },
    });
    const [, payload] = writePart.mock.calls[0];
    const lines = (payload as { costLines: { id: string }[] }).costLines;
    expect(lines.map((line) => line.id)).toEqual([
      "cabinetry",
      "tile",
      "electrical",
    ]);
  });

  it("leaves an allowance line it never wrote alone, and names it", () => {
    // A designer can give a cost line the "Allowance" category on the pricing
    // basis itself. `_validate_allowances_payload` asks allowance → line only,
    // so that line is legal — and it used to be deleted, silently changing the
    // contract sum, the moment any allowance field was touched.
    const writePart = jest.fn();
    const basisWithAnOrphan = {
      ...PRICING_BASIS,
      payload: {
        ...PRICING_BASIS.payload,
        costLines: [
          {
            id: "tile",
            label: "Tile allowance",
            category: "allowance",
            basisCents: 400_000,
          },
          {
            id: "appliances",
            label: "Appliance allowance",
            category: "allowance",
            basisCents: 900_000,
          },
        ],
      },
    };
    render(
      <PartEditor
        part={allowances}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([basisWithAnOrphan, allowances], writePart)}
      />,
    );
    expect(
      screen.getByText(/Appliance allowance is an allowance line/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Allowance 1 amount"), {
      target: { value: "4500" },
    });
    const [, payload] = writePart.mock.calls[0];
    const lines = (
      payload as {
        costLines: { id: string; basisCents: number }[];
      }
    ).costLines;
    expect(lines.map((line) => line.id)).toEqual(["tile", "appliances"]);
    expect(lines.find((line) => line.id === "appliances")?.basisCents).toBe(
      900_000,
    );
  });

  it("W3R1-03: naming an allowance ADOPTS its orphan line rather than doubling it", () => {
    // The walk: the seven fixture cost lines stand at COST BASIS $71,300, three
    // of them `category: 'allowance'` with nothing behind them, and readiness
    // says "Add them here". Naming one appended an EIGHTH line and the chip
    // moved to $75,300; naming all three took it to $81,600 and the room
    // refused the save with "The cost basis plus the fee must equal the
    // guaranteed maximum price, to the cent."
    const writePart = jest.fn();
    const onChange = jest.fn();
    const noAllowancesYet = {
      ...allowances,
      payload: { allowances: [] as unknown[] },
    };
    render(
      <PartEditor
        part={noAllowancesYet}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, noAllowancesYet], writePart)}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "+ Add an allowance" }),
    );
    // A blank allowance claims nothing: the eight lines would be the defect.
    const [, blankBasis] = writePart.mock.calls[0];
    expect(
      (blankBasis as { costLines: unknown[] }).costLines,
    ).toHaveLength(7);

    // Now the designer names it — with the blank row on the payload, exactly
    // as the composer would hand it back.
    const named = {
      ...allowances,
      payload: {
        allowances: [
          {
            id: "allowance-1",
            label: "",
            amountCents: 0,
            overageRule: "change_order",
            underageRule: "credit",
          },
        ],
      },
    };
    writePart.mockClear();
    const onChangeNamed = jest.fn();
    render(
      <PartEditor
        part={named}
        onChange={onChangeNamed}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, named], writePart)}
      />,
    );
    fireEvent.change(screen.getByLabelText("Allowance 1"), {
      target: { value: "Tile allowance" },
    });

    // The allowance took the line's id AND its money.
    const [written] = onChangeNamed.mock.calls[0];
    expect((written as { allowances: { id: string; amountCents: number }[] }).allowances).toEqual([
      {
        id: "tile",
        label: "Tile allowance",
        amountCents: 400_000,
        overageRule: "change_order",
        underageRule: "credit",
      },
    ]);
    // And the pricing basis still carries seven lines at $71,300.
    const [, basisPayload] = writePart.mock.calls[0];
    const lines = (
      basisPayload as {
        costLines: { id: string; basisCents: number }[];
        costBasisCents: number;
      }
    ).costLines;
    expect(lines).toHaveLength(7);
    expect(lines.map((line) => line.id)).toEqual([
      "cabinetry",
      "electrical",
      "plumbing",
      "generalConditions",
      "tile",
      "plumbingFixtures",
      "lighting",
    ]);
    expect(
      (basisPayload as { costBasisCents: number }).costBasisCents,
    ).toBe(7_130_000);
  });

  it("W3R1-03: an allowance whose name matches nothing still gets its own line", () => {
    const writePart = jest.fn();
    const onChange = jest.fn();
    const named = {
      ...allowances,
      payload: {
        allowances: [
          {
            id: "allowance-1",
            label: "",
            amountCents: 0,
            overageRule: "change_order",
            underageRule: "credit",
          },
        ],
      },
    };
    render(
      <PartEditor
        part={named}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, named], writePart)}
      />,
    );
    fireEvent.change(screen.getByLabelText("Allowance 1"), {
      target: { value: "Countertop allowance" },
    });
    const [, basisPayload] = writePart.mock.calls[0];
    const lines = (basisPayload as { costLines: { id: string }[] }).costLines;
    expect(lines).toHaveLength(8);
    expect(lines[7].id).toBe("allowance-1");
  });

  it("takes a removed allowance's own line out of the contract sum", () => {
    const writePart = jest.fn();
    render(
      <PartEditor
        part={allowances}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, allowances], writePart)}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    const [, payload] = writePart.mock.calls[0];
    const lines = (payload as { costLines: { id: string }[] }).costLines;
    expect(lines.some((line) => line.id === "tile")).toBe(false);
    expect(lines.some((line) => line.id === "cabinetry")).toBe(true);
  });

  it("refuses an allowance whose cost line disagrees with it", () => {
    const outOfStep = {
      ...allowances,
      payload: {
        allowances: [
          {
            id: "tile",
            label: "Tile allowance",
            amountCents: 999_999,
            overageRule: "change_order",
            underageRule: "credit",
          },
        ],
      },
    };
    render(
      <PartEditor
        part={outOfStep}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, outOfStep])}
      />,
    );
    expect(
      screen.getByText(/are the same number said twice/),
    ).toBeInTheDocument();
  });
});

describe("the sub-disclosure clause", () => {
  it("stores the mode where the validator reads it, on the pricing basis", () => {
    const writePart = jest.fn();
    const onChange = jest.fn();
    render(
      <PartEditor
        part={SUB_DISCLOSURE}
        onChange={onChange}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, SUB_DISCLOSURE], writePart)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open-book" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "open_book" }),
    );
    expect(writePart).toHaveBeenCalledWith(
      TURNKEY_PART_KEYS.pricingBasis,
      expect.objectContaining({ subDisclosure: "open_book" }),
    );
  });

  it("presses neither mode until the designer chooses one", () => {
    const unchosen = part({
      partKey: TURNKEY_PART_KEYS.subDisclosure,
      kind: "clause",
      title: "Who is doing the work",
      payload: { body: "" },
    });
    mockTradeAgreements.mockReturnValue({ data: [], isLoading: false });
    render(
      <PartEditor
        part={unchosen}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, unchosen])}
      />,
    );
    expect(screen.getByRole("button", { name: "Open-book" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Closed-book" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText(MODE_UNCHOSEN_NOTE)).toBeInTheDocument();
    // And no note claiming what the client reads, either way.
    expect(
      screen.queryByText(
        "Your client reads one price per line, your fee spread across all of them.",
      ),
    ).not.toBeInTheDocument();
  });

  it("says so plainly when there is no project to hold Trade Agreements yet", () => {
    render(
      <PartEditor
        part={SUB_DISCLOSURE}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, SUB_DISCLOSURE], jest.fn(), null)}
      />,
    );
    expect(
      screen.getByText(/Trade Agreements appear here once/),
    ).toBeInTheDocument();
  });

  it("shows identities and never a price, under either mode", () => {
    mockTradeAgreements.mockReturnValue({
      data: [
        {
          id: "ta-1",
          contactDisplayName: "Kestrel Cabinetry",
          contactCompanyName: "Kestrel Cabinetry LLC",
          trade: "Cabinetry",
          priceCents: 3_800_000,
        },
      ],
      isLoading: false,
    });
    render(
      <PartEditor
        part={SUB_DISCLOSURE}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={contextOf([PRICING_BASIS, SUB_DISCLOSURE])}
      />,
    );
    const table = screen.getByLabelText("Who is doing the work");
    expect(
      within(table).getByText(/Kestrel Cabinetry LLC/),
    ).toBeInTheDocument();
    expect(table.textContent).not.toContain("38,000");
  });
});

describe("the jurisdiction attachments", () => {
  it("holds all six seeded notices for counsel when none is enabled (R11)", () => {
    const { container } = render(
      <JurisdictionAttachments onAttach={jest.fn()} readOnly={false} />,
    );
    const held = container.querySelectorAll('[data-notice-held="true"]');
    expect(held).toHaveLength(6);
    expect(screen.getAllByText("Held for counsel review").length).toBe(6);
    expect(
      screen.queryByRole("button", { name: "Attach" }),
    ).not.toBeInTheDocument();
  });

  it("offers only what counsel has cleared", () => {
    mockJurisdictionNotices.mockReturnValue({
      data: [
        {
          state: "WI",
          kind: "cancellation_notice",
          title: "Notice of cancellation (Wisconsin)",
          body: "…",
          citation: "Wis. Admin. Code ATCP 110",
          enabled: true,
        },
      ],
      isLoading: false,
    });
    const onAttach = jest.fn();
    const { container } = render(
      <JurisdictionAttachments onAttach={onAttach} readOnly={false} />,
    );
    expect(
      container.querySelectorAll('[data-notice-held="true"]'),
    ).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(onAttach).toHaveBeenCalledWith(
      expect.objectContaining({ state: "WI" }),
    );
  });
});

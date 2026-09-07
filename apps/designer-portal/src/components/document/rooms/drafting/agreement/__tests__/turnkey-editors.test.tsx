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

  it("hides the fee percentage on a fixed price and clears it", () => {
    const onChange = renderTurnkey(PRICING_BASIS, contextOf([PRICING_BASIS]));
    fireEvent.click(screen.getByRole("button", { name: "Fixed price" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ basis: "fixed", feeBps: null }),
    );
  });

  it("pro-rates the schedule of values under closed-book", () => {
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
      container.querySelector('[data-sov-line="cabinetry"]')?.textContent,
    ).toContain("$44,840.00");
    expect(
      container.querySelector('[data-sov-line="fee"]'),
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

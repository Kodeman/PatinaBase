/**
 * The editor's Wave 2 deltas, and the Wave 1 shape underneath them.
 *
 * Every case here is run twice in spirit: with the Library flag on, and with
 * it off. Flag off, this component is Wave 1's editor — the flag-off snapshot
 * next door pins the pixels; these pin the behaviour.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { PartEditor } from "../part-editor";
import { RECORD_ONLY_HELP } from "../schedules";

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

function renderEditor(
  target: AgreementPart,
  libraryOn: boolean,
  onChange = jest.fn(),
) {
  render(
    <PartEditor
      part={target}
      onChange={onChange}
      readOnly={false}
      libraryOn={libraryOn}
    />,
  );
  return onChange;
}

beforeEach(() => {
  seq = 0;
});

describe("the part editor · the authority chip", () => {
  it("chips a schedule part with the flag on", () => {
    renderEditor(
      part({
        partKey: "custom.flat",
        kind: "schedule",
        variant: "flat",
        title: "Flat fee",
      }),
      true,
    );
    expect(screen.getByText("creates authority")).toBeInTheDocument();
  });

  it("chips nothing with the flag off", () => {
    renderEditor(
      part({
        partKey: "custom.flat",
        kind: "schedule",
        variant: "flat",
        title: "Flat fee",
      }),
      false,
    );
    expect(screen.queryByText("creates authority")).not.toBeInTheDocument();
  });

  it("chips nothing on a clause, whatever the flag says", () => {
    renderEditor(part({ partKey: "patina.services", title: "Services" }), true);
    expect(screen.queryByText(/creates authority/)).not.toBeInTheDocument();
    expect(screen.queryByText("record only (R9)")).not.toBeInTheDocument();
  });

  it("puts one sentence of help under a record-only editor, and only there", () => {
    const { unmount } = render(
      <PartEditor
        part={part({
          partKey: "custom.cost-plus",
          kind: "schedule",
          variant: "cost_plus",
          title: "Cost plus",
        })}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
      />,
    );
    expect(screen.getByText("record only (R9)")).toBeInTheDocument();
    expect(screen.getByText(RECORD_ONLY_HELP)).toBeInTheDocument();
    unmount();

    renderEditor(
      part({
        partKey: "custom.flat",
        kind: "schedule",
        variant: "flat",
        title: "Flat fee",
      }),
      true,
    );
    expect(screen.queryByText(RECORD_ONLY_HELP)).not.toBeInTheDocument();
  });
});

describe("the part editor · the record-only variants", () => {
  const RECORD_ONLY_WITH_EDITORS = [
    "percent_of_cost",
    "percent_of_spend",
    "cost_plus",
    "day_rate",
    "package",
  ] as const;

  it.each(RECORD_ONLY_WITH_EDITORS)("opens %s with the flag on", (variant) => {
    renderEditor(
      part({
        partKey: `custom.${variant}`,
        kind: "schedule",
        variant,
        title: variant,
      }),
      true,
    );
    expect(
      screen.queryByText(/This part opens in a later release/),
    ).not.toBeInTheDocument();
  });

  it.each(RECORD_ONLY_WITH_EDITORS)(
    "leaves %s in Wave 1's read-only card with the flag off",
    (variant) => {
      renderEditor(
        part({
          partKey: `custom.${variant}`,
          kind: "schedule",
          variant,
          title: variant,
        }),
        false,
      );
      expect(
        screen.getByText(/This part opens in a later release/),
      ).toBeInTheDocument();
    },
  );

  it("leaves the three Wave 3 variants read-only even with the flag on", () => {
    for (const variant of ["pricing_basis", "draws", "allowances"] as const) {
      const { unmount } = render(
        <PartEditor
          part={part({
            partKey: `custom.${variant}`,
            kind: "schedule",
            variant,
            title: variant,
          })}
          onChange={jest.fn()}
          readOnly={false}
          libraryOn
        />,
      );
      expect(
        screen.getByText(/This part opens in a later release/),
      ).toBeInTheDocument();
      expect(screen.getByText("record only (R9)")).toBeInTheDocument();
      unmount();
    }
  });
});

describe("the part editor · the retainer's credit rule", () => {
  const retainer = () =>
    part({
      partKey: "patina.retainer",
      kind: "schedule",
      variant: "retainer",
      title: "Retainer",
      payload: {
        cents: 500000,
        creditRule: "credited",
        activationPolicy: "immediate",
      },
    });

  it("offers the three rules either way", () => {
    renderEditor(retainer(), true);
    for (const label of ["Credited", "Non-refundable", "Replenishing"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("stops saying the rule is stored for later once it projects", () => {
    renderEditor(retainer(), true);
    expect(
      screen.queryByText(/starts appearing on new agreements/),
    ).not.toBeInTheDocument();
  });

  it("still says so with the flag off", () => {
    renderEditor(retainer(), false);
    expect(
      screen.getByText(/starts appearing on new agreements/),
    ).toBeInTheDocument();
  });

  it("writes the chosen rule onto the payload", () => {
    const onChange = renderEditor(retainer(), true);
    fireEvent.click(screen.getByRole("button", { name: "Non-refundable" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ creditRule: "non_refundable" }),
    );
  });
});

describe("the part editor · attachments", () => {
  const attachment = () =>
    part({
      partKey: "custom.coi",
      kind: "attachment",
      title: "Certificate of insurance",
      payload: { body: "On file with the studio.", acknowledgeRequired: false },
    });

  it("opens an attachment with the flag on", () => {
    renderEditor(attachment(), true);
    expect(
      screen.getByDisplayValue("On file with the studio."),
    ).toBeInTheDocument();
  });

  it("leaves an attachment in Wave 1's read-only card with the flag off", () => {
    renderEditor(attachment(), false);
    expect(
      screen.getByText(/This part opens in a later release/),
    ).toBeInTheDocument();
  });

  it("asks whether the client must confirm she received it", () => {
    const onChange = renderEditor(attachment(), true);
    fireEvent.click(
      screen.getByLabelText(
        "Ask the client to confirm she received this before she signs",
      ),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgeRequired: true }),
    );
  });
});

describe("the part editor · the furnishings deposit", () => {
  const deposit = () =>
    part({
      partKey: "patina.deposit",
      kind: "schedule",
      variant: "procurement",
      title: "Furnishings deposit",
      payload: { depositPercent: 50 },
    });

  it("chips deposit-only authority (R9)", () => {
    renderEditor(deposit(), true);
    expect(
      screen.getByText("creates authority · deposit only"),
    ).toBeInTheDocument();
  });

  it("adds the trade terms with the flag on", () => {
    renderEditor(deposit(), true);
    expect(screen.getByText("Markup basis")).toBeInTheDocument();
    expect(screen.getByText("Freight and handling")).toBeInTheDocument();
    expect(screen.getByText("Terms of sale")).toBeInTheDocument();
  });

  it("shows the deposit chips alone with the flag off", () => {
    renderEditor(deposit(), false);
    expect(screen.queryByText("Markup basis")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "50%", pressed: true }),
    ).toBeInTheDocument();
  });

  it("drops a trade term the designer clears rather than storing an empty string", () => {
    const onChange = renderEditor(deposit(), true);
    fireEvent.change(screen.getByLabelText("Markup basis"), {
      target: { value: "  " },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ markupBasis: undefined }),
    );
  });
});

describe("the part editor · the per-phase total", () => {
  const perPhase = () =>
    part({
      partKey: "custom.per-phase",
      kind: "schedule",
      variant: "per_phase",
      title: "Fee by phase",
      payload: {
        phases: [
          { key: "a", label: "Concept", cents: 350000 },
          { key: "b", label: "Documentation", cents: 450000 },
          { key: "c", label: "Install", cents: 300000 },
        ],
      },
    });

  it("adds up what the client will read", () => {
    renderEditor(perPhase(), true);
    expect(screen.getByText("3 phases · $11,000.00")).toBeInTheDocument();
  });

  it("shows Wave 1's sentence, and no total, with the flag off", () => {
    renderEditor(perPhase(), false);
    expect(screen.queryByText(/3 phases/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/starts creating billing authority in a later release/),
    ).toBeInTheDocument();
  });

  it("reorders the phases with the flag on", () => {
    const onChange = renderEditor(perPhase(), true);
    fireEvent.click(screen.getByRole("button", { name: "Move phase 2 up" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        phases: [
          expect.objectContaining({ label: "Documentation" }),
          expect.objectContaining({ label: "Concept" }),
          expect.objectContaining({ label: "Install" }),
        ],
      }),
    );
  });

  it("offers no reordering with the flag off", () => {
    renderEditor(perPhase(), false);
    expect(
      screen.queryByRole("button", { name: "Move phase 2 up" }),
    ).not.toBeInTheDocument();
  });
});

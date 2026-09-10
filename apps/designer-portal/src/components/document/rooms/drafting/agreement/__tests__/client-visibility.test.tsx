/**
 * R39 — hiding a part from the client, and everything that has to agree
 * about it.
 *
 * Wave 2 shipped R33 as defence in depth: a hidden fee never projects, and
 * readiness says so where the designer typed it. What was missing was the
 * ACT. These cases pin the act, the chip on the rail, and the preview — the
 * three places a designer looks to find out whether her client will read a
 * part.
 *
 * The act is gated on `design-build` like every other Wave 3 surface, which
 * is why the composer's flag-off snapshot next door is unchanged.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { DESIGN_BUILD_COPY, type AgreementPart } from "@patina/types";
import { PartEditor } from "../part-editor";
import { GalleyPart } from "../galley/galley-part";
import {
  HIDDEN_FEE_BLOCKER,
  HIDDEN_TURNKEY_MONEY_BLOCKER,
  assessAgreementReadiness,
} from "../readiness";
import { AgreementPartsBody } from "../../../../commercial/agreement-parts-body";
import type { CommercialDocument } from "@/lib/document/commercial-documents";

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
    required: input.required ?? false,
    clientVisible: input.clientVisible ?? true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
  };
}

const document: CommercialDocument = {
  id: "agreement-1",
  projectId: null,
  kind: "design_services",
  state: "draft",
  title: "Okafor design agreement",
  version: 1,
  waveName: null,
  sentAt: null,
  executedAt: null,
  supersededAt: null,
  replacementProposalId: null,
};

beforeEach(() => {
  seq = 0;
});

describe("the visibility act on a part", () => {
  it("is absent when the composer does not offer it", () => {
    render(
      <PartEditor
        part={part({ partKey: "patina.terms", title: "Terms" })}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
      />,
    );
    expect(
      screen.queryByLabelText(DESIGN_BUILD_COPY.hiddenFromClient),
    ).not.toBeInTheDocument();
  });

  it("writes client_visible false when the designer hides a part", () => {
    const onToggle = jest.fn();
    render(
      <PartEditor
        part={part({ partKey: "patina.terms", title: "Terms" })}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        onToggleClientVisible={onToggle}
      />,
    );
    fireEvent.click(screen.getByLabelText(DESIGN_BUILD_COPY.hiddenFromClient));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("says what hiding a part means, once it is hidden", () => {
    render(
      <PartEditor
        part={part({
          partKey: "studio.note",
          title: "Studio note",
          clientVisible: false,
        })}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        onToggleClientVisible={jest.fn()}
      />,
    );
    expect(
      screen.getByText(DESIGN_BUILD_COPY.hiddenFromClientHelp),
    ).toBeInTheDocument();
  });
});

describe("the hide act on the part", () => {
  const hidden = part({
    partKey: "studio.note",
    title: "Studio note",
    clientVisible: false,
  });

  function renderPart(onHide?: (next: boolean) => void) {
    return render(
      <GalleyPart
        part={hidden}
        ids={{
          section: "part-studio-note",
          head: "head-studio-note",
          foldAct: "write-studio-note",
          foldPanel: "fold-studio-note",
        }}
        currency="USD"
        turnkey={false}
        drawsNothing={false}
        open={false}
        readOnly={false}
        canMoveUp={false}
        canMoveDown
        onToggle={jest.fn()}
        onMove={jest.fn()}
        onHide={onHide}
      >
        <p>the fold</p>
      </GalleyPart>,
    );
  }

  // AR-e — the act lives with the other part acts, on every agreement.
  it("marks a hidden part when the act exists", () => {
    const { container } = renderPart(jest.fn());
    expect(
      container.querySelector('[data-client-visible="false"]')?.textContent,
    ).toBe("Show to the client");
  });

  it("marks nothing where the act is withheld (R48)", () => {
    const { container } = renderPart(undefined);
    expect(
      container.querySelector('[data-client-visible="false"]'),
    ).not.toBeInTheDocument();
  });
});

describe("the client's copy", () => {
  it("does not carry a hidden part", () => {
    render(
      <AgreementPartsBody
        parts={[
          part({
            partKey: "patina.services",
            title: "Services",
            payload: { body: "Interior design services." },
          }),
          part({
            partKey: "studio.note",
            title: "Studio note",
            clientVisible: false,
            payload: { body: "Our own note." },
          }),
        ]}
        currency="USD"
      />,
    );
    expect(screen.getByText("Interior design services.")).toBeInTheDocument();
    expect(screen.queryByText("Studio note")).not.toBeInTheDocument();
    expect(screen.queryByText("Our own note.")).not.toBeInTheDocument();
  });
});

describe("readiness on a hidden fee (R33, already in place)", () => {
  it("names the hidden fee rather than claiming the agreement has none", () => {
    const hiddenFee = part({
      partKey: "custom.flat",
      kind: "schedule",
      variant: "flat",
      title: "Flat fee",
      clientVisible: false,
      payload: { cents: 800_000 },
    });
    const readiness = assessAgreementReadiness({
      document,
      parts: [hiddenFee],
      recipientEmail: "okafor@example.com",
    });
    const messages = readiness.blockers.map((blocker) => blocker.message);
    expect(messages).toContain(HIDDEN_FEE_BLOCKER);
    expect(messages).not.toContain(
      "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
    );
  });
});

/* ── R48 · W3R2-01 — THE PRICE IS NEVER HIDDEN ──────────────────────────────
   R39's act, applied to a turnkey pricing basis, sent a design-build paper to
   a homeowner with no price on it: the projection dropped the guaranteed
   maximum price, the schedule of values, the cost basis and the fee, while the
   draw schedule went on billing against them. R33's own sentence could not
   fire, because its fee set is rate_card/flat/per_phase and does not carry
   `pricing_basis`.

   The act no longer exists on either money part, `upsert_agreement_parts` and
   `send_commercial_document` (00578) refuse both, and readiness says so. ── */

const TURNKEY_DOCUMENT: CommercialDocument = {
  ...document,
  kind: "design_build",
  title: "Halvorsen kitchen and mudroom",
};

const turnkeyMoney = () => [
  part({
    partKey: "patina.pricing_basis",
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
          id: "cab",
          label: "Cabinetry",
          category: "sub",
          basisCents: 7_130_000,
        },
      ],
      scheduleOfValues: [{ id: "k", label: "Kitchen", cents: 8_413_400 }],
    },
  }),
  part({
    partKey: "patina.draws",
    kind: "schedule",
    variant: "draws",
    title: "Draw schedule",
    payload: {
      retainageBps: 500,
      draws: [
        {
          key: "deposit",
          label: "Deposit",
          pct: 10,
          sortOrder: 1,
          retainageApplies: false,
        },
        {
          key: "final",
          label: "Final",
          pct: 90,
          sortOrder: 2,
          retainageApplies: true,
        },
      ],
    },
  }),
];

describe("R48 · the two turnkey money parts cannot be hidden", () => {
  it.each([
    ["pricing basis", 0],
    ["draw schedule", 1],
  ])("blocks readiness when the %s is hidden", (_label, index) => {
    const parts = turnkeyMoney();
    parts[index] = { ...parts[index], clientVisible: false };
    const readiness = assessAgreementReadiness({
      document: TURNKEY_DOCUMENT,
      parts,
      recipientEmail: "halvorsen@example.com",
      turnkey: { attestationLive: true, enabledJurisdictions: [] },
    });
    expect(readiness.ready).toBe(false);
    expect(
      readiness.blockers.find((blocker) => blocker.partId === parts[index].id)
        ?.message,
    ).toBe(HIDDEN_TURNKEY_MONEY_BLOCKER);
  });

  // The room must be the STRICTER side with `design-build` off, never the
  // looser: `turnkey` is omitted here exactly as the composer omits it when
  // the flag has not reached this member.
  it("blocks with the flag off too, because the rule reads the kind", () => {
    const parts = turnkeyMoney();
    parts[0] = { ...parts[0], clientVisible: false };
    const readiness = assessAgreementReadiness({
      document: TURNKEY_DOCUMENT,
      parts,
      recipientEmail: "halvorsen@example.com",
    });
    expect(readiness.blockers.map((blocker) => blocker.message)).toContain(
      HIDDEN_TURNKEY_MONEY_BLOCKER,
    );
  });

  it("says nothing while both stand visible", () => {
    const readiness = assessAgreementReadiness({
      document: TURNKEY_DOCUMENT,
      parts: turnkeyMoney(),
      recipientEmail: "halvorsen@example.com",
      turnkey: { attestationLive: true, enabledJurisdictions: [] },
    });
    expect(readiness.blockers.map((blocker) => blocker.message)).not.toContain(
      HIDDEN_TURNKEY_MONEY_BLOCKER,
    );
  });

  it("offers no hide toggle on either of them", () => {
    for (const money of turnkeyMoney()) {
      const view = render(
        <PartEditor
          part={money}
          onChange={jest.fn()}
          readOnly={false}
          // The composer withholds the callback for these two variants; the
          // editor renders the act only when it is given one.
          onToggleClientVisible={undefined}
        />,
      );
      expect(
        screen.queryByLabelText(DESIGN_BUILD_COPY.hiddenFromClient),
      ).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

/**
 * J-6 — supervision is paid once.
 *
 * Three layers hold the rule and all three say the SAME sentence: the
 * composer (here), `upsert_agreement_parts`, and `send_commercial_document`.
 * The sentence lives in `@patina/types` so the database's message and the
 * room's message cannot become two wordings of one rule; these cases pin that
 * it is rendered verbatim and that readiness turns red on it.
 */

import { render, screen } from "@testing-library/react";
import { DESIGN_BUILD_COPY, type AgreementPart } from "@patina/types";
import { PartEditor } from "../part-editor";
import { assessAgreementReadiness, documentBlockers } from "../readiness";
import { TURNKEY_PART_KEYS, type TurnkeyContext } from "../turnkey/context";
import type { CommercialDocument } from "@/lib/document/commercial-documents";

jest.mock("@patina/supabase", () => ({
  useAgreementJurisdictionNotices: () => ({ data: [], isLoading: false }),
  useTradeAgreements: () => ({ data: [], isLoading: false }),
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
    required: input.required ?? false,
    clientVisible: input.clientVisible ?? true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
  };
}

function pricingBasis(subMarkupBps: number | null): AgreementPart {
  return part({
    partKey: TURNKEY_PART_KEYS.pricingBasis,
    kind: "schedule",
    variant: "pricing_basis",
    title: "Pricing basis",
    payload: {
      basis: "cost_plus_gmp",
      feeBps: 1800,
      gmpCents: 8_413_400,
      subMarkupBps,
      subDisclosure: "closed_book",
      costLines: [
        {
          id: "cabinetry",
          label: "Cabinetry",
          category: "sub",
          basisCents: 7_130_000,
        },
      ],
      // R43 — a closed book carries the client-facing lines the studio wrote.
      scheduleOfValues: [
        { id: "kitchen", label: "Kitchen", cents: 8_413_400 },
      ],
    },
  });
}

function supervision(feeCents: number | null): AgreementPart {
  return part({
    partKey: TURNKEY_PART_KEYS.supervision,
    kind: "clause",
    title: "Supervision",
    payload: { body: "We run the job.", supervisionFeeCents: feeCents },
  });
}

const draws = part({
  partKey: TURNKEY_PART_KEYS.draws,
  kind: "schedule",
  variant: "draws",
  title: "Draws",
  payload: {
    retainageBps: 500,
    draws: [
      {
        key: "deposit",
        label: "Deposit",
        sortOrder: 0,
        pct: 10,
        retainageApplies: false,
      },
      {
        key: "final",
        label: "Final",
        sortOrder: 1,
        pct: 90,
        retainageApplies: true,
      },
    ],
  },
});

const document: CommercialDocument = {
  id: "agreement-1",
  projectId: "project-1",
  kind: "design_build",
  state: "draft",
  title: "Halvorsen kitchen and mudroom",
  version: 1,
  waveName: null,
  sentAt: null,
  executedAt: null,
  supersededAt: null,
  replacementProposalId: null,
};

function context(parts: AgreementPart[]): TurnkeyContext {
  return { parts, writePart: jest.fn(), projectId: "project-1" };
}

beforeEach(() => {
  seq = 0;
});

describe("the no-double-count validation", () => {
  it("fires on the supervision clause with §4.3's copy, verbatim", () => {
    const parts = [pricingBasis(1500), supervision(250_000)];
    render(
      <PartEditor
        part={parts[1]}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={context(parts)}
      />,
    );
    expect(
      screen.getByText(DESIGN_BUILD_COPY.noDoubleCount),
    ).toBeInTheDocument();
    expect(
      screen.getByText(DESIGN_BUILD_COPY.noDoubleCountAside),
    ).toBeInTheDocument();
  });

  it("puts both fields into an error state", () => {
    const parts = [pricingBasis(1500), supervision(250_000)];
    render(
      <PartEditor
        part={parts[1]}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={context(parts)}
      />,
    );
    expect(screen.getByLabelText("Supervision fee dollars")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Supervision fee percent")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("says nothing when only one of the two is set", () => {
    const onlyFee = [pricingBasis(null), supervision(250_000)];
    render(
      <PartEditor
        part={onlyFee[1]}
        onChange={jest.fn()}
        readOnly={false}
        libraryOn
        turnkey={context(onlyFee)}
      />,
    );
    expect(
      screen.queryByText(DESIGN_BUILD_COPY.noDoubleCount),
    ).not.toBeInTheDocument();
  });

  it("turns readiness red, in the same sentence", () => {
    const parts = [pricingBasis(1500), draws, supervision(250_000)];
    const readiness = assessAgreementReadiness({
      document,
      parts,
      recipientEmail: "halvorsen@example.com",
      turnkey: { attestationLive: true, enabledJurisdictions: [] },
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map((blocker) => blocker.message)).toContain(
      DESIGN_BUILD_COPY.noDoubleCount,
    );
    // R49 (W3R2-04) — the refusal is about a PAIR, so it is filed three ways:
    // once against no part at all, which is what puts it in the readiness rail
    // where the walk found nothing said; and once against each of the two
    // parts that have to change for it to go, so both rows mark and both
    // editors print it.
    const filed = readiness.blockers
      .filter((blocker) => blocker.message === DESIGN_BUILD_COPY.noDoubleCount)
      .map((blocker) => blocker.partId);
    expect(filed).toContain(null);
    expect(filed).toContain(parts[0].id);
    expect(filed).toContain(parts[2].id);
    expect(
      documentBlockers(readiness).map((blocker) => blocker.message),
    ).toContain(DESIGN_BUILD_COPY.noDoubleCount);
  });

  // R49 — read over the payloads, not the seeded key: a supervision clause
  // that arrived renamed from the Library still counts, and the database
  // (`_validate_no_double_count`) reads it the same way.
  it("counts a supervision clause the studio renamed", () => {
    const renamed = {
      ...supervision(250_000),
      partKey: "studio.oversight",
      title: "Oversight",
    };
    const parts = [pricingBasis(1500), draws, renamed];
    const readiness = assessAgreementReadiness({
      document,
      parts,
      recipientEmail: "halvorsen@example.com",
      turnkey: { attestationLive: true, enabledJurisdictions: [] },
    });
    expect(readiness.ready).toBe(false);
    expect(
      readiness.blockers
        .filter(
          (blocker) => blocker.message === DESIGN_BUILD_COPY.noDoubleCount,
        )
        .map((blocker) => blocker.partId),
    ).toContain(renamed.id);
  });

  it("goes green the moment the markup is cleared", () => {
    const parts = [pricingBasis(null), draws, supervision(250_000)];
    const readiness = assessAgreementReadiness({
      document,
      parts,
      recipientEmail: "halvorsen@example.com",
      turnkey: { attestationLive: true, enabledJurisdictions: [] },
    });
    expect(readiness.blockers.map((blocker) => blocker.message)).not.toContain(
      DESIGN_BUILD_COPY.noDoubleCount,
    );
    expect(readiness.ready).toBe(true);
  });
});

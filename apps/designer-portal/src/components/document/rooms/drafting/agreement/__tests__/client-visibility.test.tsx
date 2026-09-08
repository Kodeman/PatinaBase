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
import { PartsRail } from "../parts-rail";
import { HIDDEN_FEE_BLOCKER, assessAgreementReadiness } from "../readiness";
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

describe("the chip on the rail", () => {
  const hidden = part({
    partKey: "studio.note",
    title: "Studio note",
    clientVisible: false,
  });

  function renderRail(visibilityOn: boolean) {
    return render(
      <PartsRail
        parts={[hidden]}
        selectedId={hidden.id}
        blockedIds={new Set()}
        onSelect={jest.fn()}
        onReorder={jest.fn()}
        onRename={jest.fn()}
        onRemove={jest.fn()}
        onAdd={jest.fn()}
        readOnly={false}
        libraryOn
        visibilityOn={visibilityOn}
      />,
    );
  }

  it("marks a hidden row when the act exists", () => {
    const { container } = renderRail(true);
    expect(
      container.querySelector('[data-client-visible="false"]')?.textContent,
    ).toBe(DESIGN_BUILD_COPY.hiddenFromClient);
  });

  it("marks nothing when it does not — Wave 2's rail exactly", () => {
    const { container } = renderRail(false);
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

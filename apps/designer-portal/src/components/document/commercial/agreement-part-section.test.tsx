/**
 * FS-5 — one part, printed alone, is the same paper as that part inside the
 * whole body. The galley prints parts one at a time and the "read the whole
 * paper" overlay prints them together; if these two trees ever diverge, the
 * studio is looking at something the homeowner will not receive (N-1/R27).
 *
 * The fixture is `artifacts/agreement-room-2026-09-10/specimens/SPEC.md` §6.2 —
 * the nine standard parts of the Okonkwo agreement, with the Furnishings
 * deposit left unwritten.
 */

import { render } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import {
  AgreementPartSection,
  AgreementPartsBody,
  partDrawsNothing,
} from "./agreement-parts-body";

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
    title: input.title ?? "Part",
    payload: input.payload ?? {},
    required: input.required ?? false,
    clientVisible: input.clientVisible ?? true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
    partKey: input.partKey,
  };
}

beforeEach(() => {
  seq = 0;
});

function okonkwoParts(): AgreementPart[] {
  return [
    part({
      partKey: "patina.services",
      position: 1,
      title: "Services",
      payload: {
        body: "Middle West Studio provides interior design services for the Okonkwo house.",
      },
    }),
    part({
      partKey: "patina.deliverables",
      position: 2,
      kind: "list",
      title: "Deliverables",
      payload: {
        items: [
          { id: "a", text: "Concept presentation for each room in scope" },
          { id: "b", text: "One walkthrough at installation", optional: true },
        ],
      },
    }),
    part({
      partKey: "patina.exclusions",
      position: 3,
      kind: "list",
      title: "Exclusions",
      payload: {
        items: [{ id: "c", text: "Construction labor and permits" }],
      },
    }),
    part({
      partKey: "patina.role_rates",
      position: 4,
      kind: "schedule",
      variant: "rate_card",
      title: "Role rates",
      payload: {
        roles: [
          { roleName: "Principal", hourlyRateCents: 18500, sortOrder: 0 },
          { roleName: "Designer", hourlyRateCents: 14000, sortOrder: 1 },
          { roleName: "Assistant", hourlyRateCents: 8500, sortOrder: 2 },
        ],
      },
    }),
    part({
      partKey: "patina.ceiling",
      position: 5,
      kind: "schedule",
      variant: "ceiling",
      title: "Ceiling",
      payload: { cents: 2400000 },
    }),
    part({
      partKey: "patina.deposit",
      position: 6,
      kind: "schedule",
      variant: "procurement",
      title: "Furnishings deposit",
      payload: { depositPercent: 0 },
    }),
    part({
      partKey: "patina.retainer",
      position: 7,
      kind: "schedule",
      variant: "retainer",
      title: "Retainer",
      payload: { cents: 500000, activationPolicy: "retainer_paid" },
    }),
    part({
      partKey: "patina.cadence",
      position: 8,
      kind: "schedule",
      variant: "cadence",
      title: "Billing cadence",
      payload: { cadence: "monthly" },
    }),
    part({
      partKey: "patina.terms",
      position: 9,
      title: "Terms",
      payload: { body: "Wisconsin law governs this agreement." },
    }),
  ];
}

/** That part's own slice of the whole nine-part body. Unmounted before the
 *  comparison so the two renders never share a document. */
function sliceOfWholeBody(partKey: string): string {
  const { container, unmount } = render(
    <AgreementPartsBody parts={okonkwoParts()} currency="USD" />,
  );
  const slice =
    container.querySelector(`[data-part-key="${partKey}"]`)?.outerHTML ?? "";
  unmount();
  return slice;
}

describe("AgreementPartSection — one part, the same paper", () => {
  const parts = okonkwoParts();

  it.each(parts.map((one) => [one.title, one.partKey] as const))(
    "%s prints alone exactly as it prints in the whole body",
    (_title, partKey) => {
      const inWhole = sliceOfWholeBody(partKey);
      const one = okonkwoParts().find((row) => row.partKey === partKey)!;
      const alone = render(
        <AgreementPartSection part={one} currency="USD" />,
      ).container;
      expect(alone.innerHTML).toBe(inWhole);
    },
  );

  it("draws nothing for the unwritten Furnishings deposit, and says so", () => {
    const deposit = parts.find((one) => one.partKey === "patina.deposit")!;
    expect(partDrawsNothing(deposit, "USD", false)).toBe(true);
    expect(sliceOfWholeBody("patina.deposit")).toBe("");
    expect(
      render(<AgreementPartSection part={deposit} currency="USD" />).container
        .innerHTML,
    ).toBe("");
  });

  it("draws something for every written part", () => {
    for (const one of parts) {
      if (one.partKey === "patina.deposit") continue;
      expect(partDrawsNothing(one, "USD", false)).toBe(false);
    }
  });

  it("prints no heading of its own when the caller's head carries the title", () => {
    const services = parts[0]!;
    const headed = render(
      <AgreementPartSection part={services} currency="USD" />,
    ).container;
    const headless = render(
      <AgreementPartSection part={services} currency="USD" headless />,
    ).container;
    expect(headed.querySelector("h3")).not.toBeNull();
    expect(headless.querySelector("h3")).toBeNull();
    expect(headless.querySelector("[data-part-key]")?.textContent).toBe(
      String(services.payload.body),
    );
  });

  it("letters an attachment from the caller, never restarting at A", () => {
    const attachment = part({
      partKey: "patina.attachment.b",
      kind: "attachment",
      title: "Insurance certificate",
      payload: { body: "Certificate of liability insurance." },
    });
    const alone = render(
      <AgreementPartSection
        part={attachment}
        currency="USD"
        attachmentLetter="B"
      />,
    ).container;
    expect(alone.textContent).toContain("Attachment B · Insurance certificate");
  });
});

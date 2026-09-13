/**
 * THE COMPANY CARD (W2b) — six regions, and the three rules the face keeps:
 * a firm has neither consent nor reach, the Paper region always prints, and on
 * the crew line only the name is a control.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CompanyCard } from "../company-card";

const cardData: { current: Record<string, unknown> | null } = { current: null };
const docsData: { current: unknown[] } = { current: [] };
const chaseMutate = jest.fn();

jest.mock("@patina/supabase", () => ({
  useStudioContact: () => ({ data: cardData.current }),
  useStudioContacts: () => ({
    data: [
      { id: "card-dana", entity_kind: "person", full_name: "Dana Kowalski" },
    ],
  }),
  useAffiliations: () => ({
    data: [
      {
        id: "aff-1",
        person_id: "card-dana",
        company_id: "firm-northgate",
        role_at_firm: "owner-operator",
        is_paperwork_contact: true,
        is_signer: true,
        holds_trade_license: true,
      },
    ],
  }),
  useComplianceDocuments: () => ({ data: docsData.current }),
  // `compliance_state()` reduces worst-first over the holder's own paper, so
  // the mock follows the fixture rather than pinning one word.
  useComplianceState: () => ({
    data: docsData.current.length === 0 ? "not_on_file" : "lapsed",
  }),
  usePeopleSeats: () => ({ data: [] }),
  useUpdateStudioContact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRecordComplianceDocument: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  COMPLIANCE_BLOCK_LABELS: {
    site_access: "site access",
    payment: "payment",
    draw: "the draw",
  },
  COMPLIANCE_DOC_TYPE_LABELS: { coi_gl: "COI, general liability" },
  ALL_COMPLIANCE_BLOCKS: ["site_access", "payment", "draw"],
  ALL_COMPLIANCE_DOC_TYPES: ["coi_gl"],
  complianceDocRequiresExpiry: () => true,
}));

jest.mock("../compliance-chase", () => {
  const actual = jest.requireActual("../compliance-chase");
  return {
    ...actual,
    useChaseTheRenewal: () => ({ mutate: chaseMutate, isPending: false }),
  };
});

jest.mock("@/lib/analytics/people-events", () => ({
  peopleEvents: { companyCardOpened: jest.fn() },
}));

const TODAY = new Date("2026-10-20T00:00:00Z");

function renderCard(over: Record<string, unknown> = {}) {
  const onOpenPerson = jest.fn();
  render(
    <CompanyCard
      firmId="firm-northgate"
      organizationId="org-1"
      jobsCount={2}
      onOpenPerson={onOpenPerson}
      onAnnounce={jest.fn()}
      onBack={jest.fn()}
      today={TODAY}
      {...over}
    />,
  );
  return { onOpenPerson };
}

beforeEach(() => {
  chaseMutate.mockClear();
  docsData.current = [
    {
      id: "doc-1",
      doc_type: "coi_gl",
      doc_label: null,
      number: "GL-9021-18",
      issuer: "Lakes Casualty",
      issued_on: "2025-04-01",
      expires_on: "2026-03-31",
      held_by: "studio",
      blocks: ["site_access", "payment", "draw"],
    },
  ];
  cardData.current = {
    id: "firm-northgate",
    organization_id: "org-1",
    entity_kind: "company",
    company_name: "Northgate Electric",
    contact_kind: "sub",
    company_kind: "sub",
    trades: ["electrical"],
    warranty_until: "2026-11-21",
    remit_to: "Northgate Electric",
    tax_id_last4: "4417",
    retainage_bps: 1000,
    signer_person_id: "card-dana",
    paperwork_contact_person_id: "card-dana",
    site_contact_person_id: "card-dana",
    studio_verdict: null,
  };
});

describe("the six regions", () => {
  it("prints each head", () => {
    renderCard();
    for (const head of [
      "Crew & designations",
      "Paper",
      "Payee",
      "Jobs",
      "History",
    ]) {
      expect(screen.getByRole("heading", { name: head })).toBeInTheDocument();
    }
  });

  it("the identity line counts the crew, the jobs and the warranty", () => {
    renderCard();
    expect(
      screen.getByText(
        "Electrical sub · 1 person · 2 projects · warranty through 21 November 2026",
      ),
    ).toBeInTheDocument();
  });

  it("a firm has neither a consent word nor a reach word", () => {
    const { container } = render(
      <CompanyCard
        firmId="firm-northgate"
        organizationId="org-1"
        onOpenPerson={jest.fn()}
        onAnnounce={jest.fn()}
        onBack={jest.fn()}
        today={TODAY}
      />,
    );
    expect(container.querySelector('[data-state-family="consent"]')).toBeNull();
    expect(container.querySelector('[data-state-family="reach"]')).toBeNull();
  });
});

describe("R-W — the crew line", () => {
  it("makes the NAME the control and leaves the designations plain", () => {
    const { onOpenPerson } = renderCard();
    const control = screen.getByRole("button", { name: "Dana Kowalski" });
    fireEvent.click(control);
    expect(onOpenPerson).toHaveBeenCalledWith("card-dana");
    const line = control.closest("li") as HTMLElement;
    expect(line).toHaveTextContent(
      "owner-operator · paperwork contact · signer · site contact · holds the trade licence",
    );
    expect(within(line).getAllByRole("button")).toHaveLength(1);
  });
});

describe("R-P — the Paper region, in one fixed order", () => {
  it("prints the table, the leading-rule clause, the sentence, then the acts", () => {
    renderCard();
    const region = document.querySelector(
      "[data-company-paper]",
    ) as HTMLElement;
    const text = region.textContent ?? "";
    const table = text.indexOf("COI, general liability");
    const clause = text.indexOf("Site access, payment and the draw are held");
    const sentence = text.indexOf("This drafts a note to");
    const act = text.indexOf("Record a document");
    expect(table).toBeGreaterThanOrEqual(0);
    expect(clause).toBeGreaterThan(table);
    expect(sentence).toBeGreaterThan(clause);
    expect(act).toBeGreaterThan(sentence);
  });

  it("C21 — a firm with no paper still prints the region, the word and the act", () => {
    docsData.current = [];
    renderCard();
    expect(screen.getByText("Not on file")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record a document" }),
    ).toBeInTheDocument();
  });

  it("C13 — a lender prints one line and no act at all", () => {
    cardData.current = {
      ...(cardData.current as object),
      company_kind: "lender",
    };
    renderCard();
    expect(
      screen.getByText("No paper is held for this firm."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record a document" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Chase the renewal" }),
    ).not.toBeInTheDocument();
  });
});

describe("Chase the renewal", () => {
  it("files a draft for review and says so — nothing is sent", () => {
    renderCard();
    const act = screen.getByRole("button", { name: "Chase the renewal" });
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(
      "This drafts a note to Northgate Electric's paperwork contact and files it for your review. Nothing is sent until you send it.",
    );
    fireEvent.click(act);
    expect(chaseMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "firm-northgate",
        companyName: "Northgate Electric",
        paperworkContactPersonId: "card-dana",
      }),
      expect.anything(),
    );
  });
});

describe("the payee region", () => {
  it("prints the remit line, the tax id tail and the retainage", () => {
    renderCard();
    expect(screen.getByText("Remit to Northgate Electric")).toBeInTheDocument();
    expect(screen.getByText("Tax id ending 4417")).toBeInTheDocument();
    expect(screen.getByText("Retainage 10%")).toBeInTheDocument();
    expect(screen.getByText("Signs: Dana Kowalski")).toBeInTheDocument();
  });
});

describe("the history region", () => {
  it("says no verdict is recorded, and offers to record one", () => {
    renderCard();
    expect(screen.getByText("No verdict recorded.")).toBeInTheDocument();
    const act = screen.getByRole("button", { name: "Record a verdict" });
    expect(act).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(act);
    expect(act).toHaveAttribute("aria-expanded", "true");
  });
});

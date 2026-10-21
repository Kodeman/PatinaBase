import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";

import type { Invoice, Proposal } from "@patina/supabase";

/* ── The studio-only door (CPUX-01, Arrival-Studio) ──────────────────────────
   A household with no house still lands on a page that says what it is for and
   where everything is: Invoices, Approvals, Progress and help, each landing on
   content, an honest empty state, or a recovery message. The letterbox and the
   origin door are stood in by stubs; their own suites own their insides. */

jest.mock("@patina/supabase", () => ({
  useClientInvoices: jest.fn(),
  useStudioIdentity: jest.fn(),
}));

jest.mock("@/hooks/use-proposals-client", () => ({
  ...jest.requireActual("@/hooks/use-proposals-client"),
  useClientProposals: jest.fn(),
}));

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { name: "June Brennan" } }),
}));
jest.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));
jest.mock("@/hooks/use-commercial-client", () => ({
  clientCommercialDocumentQueryOptions: (id: string) => ({
    queryKey: ["bundle", id],
    queryFn: () => null,
    enabled: false,
  }),
}));
jest.mock("@/lib/threshold/checkout-return", () => ({
  useNamedInvoice: () => null,
}));

jest.mock("@/components/projects/ProjectsEmptyState", () => ({
  ProjectsEmptyState: () => <div data-testid="projects-empty-state" />,
  EmptyStateActs: () => <div data-testid="empty-state-acts" />,
}));

const letterboxProps: Array<Record<string, unknown>> = [];
jest.mock("@/components/threshold/letterbox", () => ({
  Letterbox: (props: Record<string, unknown>) => {
    letterboxProps.push(props);
    return <section id="letterbox" data-testid="letterbox-stub" />;
  },
}));

jest.mock("../door-gate", () => ({
  DoorGate: ({
    first,
    proposal,
  }: {
    first: boolean;
    proposal: { title: string };
  }) => (
    <section id={first ? "door" : undefined} data-testid="door-gate">
      {proposal.title}
    </section>
  ),
}));

import { useClientInvoices, useStudioIdentity } from "@patina/supabase";
import { useClientProposals } from "@/hooks/use-proposals-client";

import type { InvoiceProjection, InvoiceServerHold } from "@/lib/threshold/invoice-rollup";

import { LetterboxDoor } from "../letterbox-door";

const invoicesMock = useClientInvoices as jest.Mock;
const identityMock = useStudioIdentity as jest.Mock;
const proposalsMock = useClientProposals as jest.Mock;

function settled<T>(data: T) {
  return {
    data,
    isPending: false,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
}
const FAILED = {
  data: undefined,
  isPending: false,
  isLoading: false,
  isError: true,
  refetch: jest.fn(),
};

function studioInvoice(id: string, overrides: Partial<Invoice> = {}): Invoice {
  return {
    id,
    project_id: null,
    studio_id: "studio-1",
    designer_id: "designer-1",
    invoice_number: `INV-${id}`,
    status: "sent",
    currency: "USD",
    total_cents: 60_000,
    amount_paid_cents: 0,
    due_date: "2026-09-25",
    payments: [],
    ...overrides,
  } as unknown as Invoice;
}

const ORIGIN_AGREEMENT = {
  id: "prop-origin",
  title: "Design services agreement",
  document_kind: "design_services",
  commercial_state: "sent",
  status: "sent",
  total_amount: 450_000,
  sent_at: "2026-10-09",
  updated_at: "2026-10-09",
  designer_id: "designer-1",
  version: 1,
} as unknown as Proposal;

function renderDoor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LetterboxDoor />
    </QueryClientProvider>,
  );
}

/** Every landmark as [label, href], and proof each href lands on the page. */
function landmarks(container: HTMLElement): Array<[string, string]> {
  const nav = screen.getByTestId("landmark-ledger");
  return within(nav)
    .getAllByRole("link")
    .map((link) => {
      const href = link.getAttribute("href") ?? "";
      expect(container.querySelector(href)).not.toBeNull();
      return [link.textContent?.trim() ?? "", href];
    });
}

beforeEach(() => {
  letterboxProps.length = 0;
  identityMock.mockReturnValue(
    settled({ name: "Birchwood Studio", source: "studio" }),
  );
  proposalsMock.mockReturnValue(settled([]));
  invoicesMock.mockReturnValue(
    settled([
      studioInvoice("014"),
      studioInvoice("023", { total_cents: 5_000, due_date: "2026-11-30" }),
    ]),
  );
});

describe("LetterboxDoor — the studio-only arrival", () => {
  it("introduces the page with its purpose and the studio, not a project", () => {
    renderDoor();

    expect(screen.getByTestId("doorplate-title")).toHaveTextContent(
      "Birchwood Studio",
    );
    expect(
      screen.getByText(
        "Pay invoices, review approvals, and follow your project here.",
      ),
    ).toBeInTheDocument();
  });

  it("offers Invoices, Approvals, Progress and help, each landing on the page", () => {
    const { container } = renderDoor();

    expect(landmarks(container)).toEqual([
      ["Invoices", "#letterbox"],
      ["Approvals", "#approvals"],
      ["Progress", "#road"],
      ["Contact your designer", "#contact"],
    ]);
  });

  it("counts the studio invoices to pay, and never says letters are waiting", () => {
    const { container } = renderDoor();

    expect(
      screen.getByText("You have two invoices to pay."),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/letters? (is|are) waiting/);
  });

  it("lands Progress on the not-connected explanation, claiming nothing about the project", () => {
    renderDoor();

    const progress = screen.getByTestId("door-progress");
    expect(progress).toHaveAttribute("id", "road");
    expect(
      within(progress).getByRole("heading", { name: "Progress" }),
    ).toBeInTheDocument();
    expect(progress).toHaveTextContent(
      "Your project isn’t connected to this page yet. You can still view and pay your studio invoices.",
    );
    expect(progress.textContent).not.toMatch(/not started|hasn.t started/i);
  });

  it("gives help as the honest fallback — no invented phone or email", () => {
    renderDoor();

    const help = screen.getByTestId("contact-designer");
    expect(help).toHaveAttribute("id", "contact");
    expect(help).toHaveTextContent(
      "Contact your designer using the phone number or email you already use.",
    );
    expect(within(help).queryByRole("link")).not.toBeInTheDocument();
  });

  it("says nothing waits for approval only once the papers have been read", () => {
    renderDoor();

    expect(screen.getByTestId("approvals")).toHaveTextContent(
      "Nothing is waiting for your approval.",
    );
  });

  it("sends Approvals to the origin agreement when one is waiting", () => {
    proposalsMock.mockReturnValue(settled([ORIGIN_AGREEMENT]));
    const { container } = renderDoor();

    expect(landmarks(container)).toContainEqual(["Approvals", "#door"]);
    expect(
      screen.getByText("One agreement is waiting for you."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("approvals-empty")).not.toBeInTheDocument();
  });

  it("keeps the agreement and the invoices standing when the papers fail", () => {
    proposalsMock.mockReturnValue(FAILED);
    renderDoor();

    expect(screen.getByTestId("papers-unread")).toBeInTheDocument();
    expect(screen.queryByTestId("approvals-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("letterbox-stub")).toBeInTheDocument();
  });

  it("hands the letterbox the projection read from the studio invoices", () => {
    renderDoor();

    const props = letterboxProps.at(-1)!;
    const projection = props.projection as {
      read: string;
      counts: { payable: number };
    };
    expect(projection.read).toBe("complete");
    expect(projection.counts.payable).toBe(2);
    expect(props.projectName).toBeNull();
    expect(typeof props.onHold).toBe("function");
  });

  it("stands on a failed invoice read so the letterbox can say so — never an empty state", () => {
    invoicesMock.mockReturnValue(FAILED);
    const { container } = renderDoor();

    expect(
      screen.queryByTestId("projects-empty-state"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("letterbox-stub")).toBeInTheDocument();
    expect((letterboxProps.at(-1)!.projection as { read: string }).read).toBe(
      "failed",
    );
    // No count and no all-clear over money the page could not read.
    expect(container.textContent).not.toMatch(
      /invoices? to pay\.|Nothing is waiting for you\./,
    );
  });

  it("stands on an empty cache whose refresh failed, keeping the retry — never an empty state", async () => {
    const refetch = jest.fn();
    invoicesMock.mockReturnValue({ ...settled([]), isError: true, refetch });
    const { container } = renderDoor();

    expect(
      screen.queryByTestId("projects-empty-state"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("letterbox-stub")).toBeInTheDocument();
    const props = letterboxProps.at(-1)!;
    expect((props.projection as { read: string }).read).toBe("stale");
    // The letterbox's Retry is this read again.
    await (props.onRefetch as () => Promise<void>)();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(
      /invoices? to pay\.|Nothing is waiting for you\./,
    );
  });

  it("withholds the count when an invoice arrived without its payments", () => {
    invoicesMock.mockReturnValue(
      settled([
        studioInvoice("014", { payments: undefined } as Partial<Invoice>),
      ]),
    );
    const { container } = renderDoor();

    expect(container.textContent).not.toMatch(
      /invoices? to pay\.|Nothing is waiting for you\./,
    );
  });

  it("meets the empty state only when nothing at all is here", () => {
    invoicesMock.mockReturnValue(settled([]));
    renderDoor();

    expect(screen.getByTestId("projects-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("landmark-ledger")).not.toBeInTheDocument();
  });
});

describe("LetterboxDoor — a held invoice yields only to a read newer than the hold (SQ-1546 F1)", () => {
  const paid = studioInvoice("014", {
    status: "paid",
    amount_paid_cents: 60_000,
    paid_at: "2026-10-20T08:00:00Z",
    payments: [
      {
        id: "pay-014",
        invoice_id: "014",
        amount_cents: 60_000,
        status: "succeeded",
        stripe_payment_intent_id: "pi_014",
      },
    ],
  } as Partial<Invoice>);
  const refunded = studioInvoice("014", {
    payments: [
      {
        id: "pay-014",
        invoice_id: "014",
        amount_cents: 60_000,
        status: "refunded",
        stripe_payment_intent_id: "pi_014",
      },
    ],
  } as Partial<Invoice>);
  const readAt = (rows: Invoice[], dataUpdatedAt: number) => ({ ...settled(rows), dataUpdatedAt });
  const last = () => letterboxProps[letterboxProps.length - 1] as {
    projection: InvoiceProjection;
    onHold: (invoiceId: string, hold: InvoiceServerHold) => void;
  };
  const groupOf = (id: string) => {
    const { projection } = last();
    return (["review", "processing", "payable", "history"] as const).find((group) =>
      projection[group].some((row) => row.invoice.id === id),
    );
  };

  afterEach(() => jest.restoreAllMocks());

  it("keeps a late processing hold over the cached paid read, and retires it on a later paid read", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const door = () => (
      <QueryClientProvider client={client}>
        <LetterboxDoor />
      </QueryClientProvider>
    );
    // The cached read: paid, its rows from t=500.
    invoicesMock.mockReturnValue(readAt([paid], 500));
    const { rerender } = render(door());
    expect(groupOf("014")).toBe("history");

    // A late checkout answer lands at t=1000, after that read.
    jest.spyOn(Date, "now").mockReturnValue(1_000);
    act(() => last().onHold("014", "payment_processing"));
    expect(groupOf("014")).toBe("processing");

    // The same cached read, re-rendered while a refetch is out, still proves nothing.
    rerender(door());
    expect(groupOf("014")).toBe("processing");

    // A refund the cached read never saw: the kept hold still stands in front of payment.
    invoicesMock.mockReturnValue(readAt([refunded], 500));
    rerender(door());
    expect(groupOf("014")).toBe("processing");

    // A paid read that arrived after the hold proves it settled and retires it…
    invoicesMock.mockReturnValue(readAt([paid], 2_000));
    rerender(door());
    expect(groupOf("014")).toBe("history");

    // …so a later refund reopen is judged on its own read: payable, nothing in flight.
    invoicesMock.mockReturnValue(readAt([refunded], 3_000));
    rerender(door());
    expect(groupOf("014")).toBe("payable");
    expect(last().projection.payable[0].paymentInFlight).toBe(false);
  });
});

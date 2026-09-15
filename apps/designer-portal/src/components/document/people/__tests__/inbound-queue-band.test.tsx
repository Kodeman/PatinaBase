/**
 * THE INBOUND QUEUE (upload-door-spec §6, acceptance 8).
 *
 * The band prints only where paper is actually waiting, both acts are two-step
 * inline confirms, the reject's reason is required and HELD rather than
 * `disabled`, and a refusal from 00637 reaches the face as a sentence.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { asInboundDocumentError } from "@patina/supabase";
import {
  InboundQueueBand,
  CONFIRM_CONSEQUENCE_SENTENCE,
  REJECT_HELD_SENTENCE,
} from "../inbound-queue-band";

const pending: { current: unknown[] } = { current: [] };
const confirmMutate = jest.fn();
const rejectMutate = jest.fn();

jest.mock("@patina/supabase", () => ({
  // The real mapper, so a token 00637 raises that nobody gave a sentence is
  // caught here rather than announced to the studio (W4 r2 MAJOR-1).
  asInboundDocumentError: jest.requireActual("@patina/supabase")
    .asInboundDocumentError,
  useInboundDocuments: () => ({ data: pending.current }),
  useConfirmInboundDocument: () => ({
    mutateAsync: confirmMutate,
    isPending: false,
  }),
  useRejectInboundDocument: () => ({
    mutateAsync: rejectMutate,
    isPending: false,
  }),
  inboundQueueHeading: (n: number) =>
    `${n} document${n === 1 ? "" : "s"} waiting for your check`,
  inboundDocumentLine: (d: { doc_type: string }, firm: string) =>
    `${d.doc_type}, uploaded 12 Sep 2026 by ${firm}.`,
}));

const DOC = {
  id: "doc-1",
  holder_id: "firm-northgate",
  doc_type: "coi_gl",
  doc_label: null,
  created_at: "2026-09-12T10:00:00Z",
};

const announce = jest.fn();

function renderBand() {
  return render(
    <InboundQueueBand
      holderId="firm-northgate"
      firmName="Northgate Electric"
      onAnnounce={announce}
    />,
  );
}

beforeEach(() => {
  pending.current = [DOC];
  confirmMutate.mockReset().mockResolvedValue("doc-1");
  rejectMutate.mockReset().mockResolvedValue("doc-1");
  announce.mockReset();
});

describe("the inbound queue band", () => {
  it("prints nothing at all where no paper is waiting", () => {
    pending.current = [];
    const { container } = renderBand();
    expect(container.querySelector("[data-inbound-queue]")).toBeNull();
  });

  it("counts the waiting paper in the band's own words", () => {
    renderBand();
    expect(
      screen.getByText("1 document waiting for your check"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("coi_gl, uploaded 12 Sep 2026 by Northgate Electric."),
    ).toBeInTheDocument();
  });

  it("confirms in TWO steps, saying what the confirm costs first", async () => {
    renderBand();
    fireEvent.click(screen.getByText("Confirm"));
    // The first press writes nothing: it states the consequence.
    expect(confirmMutate).not.toHaveBeenCalled();
    expect(
      screen.getByText(`– ${CONFIRM_CONSEQUENCE_SENTENCE}`),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Confirm the document"));
    await waitFor(() =>
      expect(confirmMutate).toHaveBeenCalledWith({
        documentId: "doc-1",
        holderId: "firm-northgate",
      }),
    );
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        "coi_gl, uploaded 12 Sep 2026 by Northgate Electric is confirmed.",
      ),
    );
  });

  it("holds the refusal until a reason is written, with the reason visible", () => {
    renderBand();
    fireEvent.click(screen.getByText("Reject"));
    const refuse = screen.getByText("Refuse it").closest("button")!;
    // Direction §5.5 — aria-disabled, never `disabled`, so the sentence
    // beside it stays reachable by keyboard.
    expect(refuse).toHaveAttribute("aria-disabled", "true");
    expect(refuse).not.toHaveAttribute("disabled");
    expect(screen.getByText(REJECT_HELD_SENTENCE)).toBeInTheDocument();
    fireEvent.click(refuse);
    expect(rejectMutate).not.toHaveBeenCalled();
  });

  it("sends the reason with the refusal and names the note it drafts", async () => {
    renderBand();
    fireEvent.click(screen.getByText("Reject"));
    fireEvent.change(screen.getByLabelText("Why it is refused"), {
      target: { value: "no expiry on the certificate" },
    });
    fireEvent.click(screen.getByText("Refuse it"));
    await waitFor(() =>
      expect(rejectMutate).toHaveBeenCalledWith({
        documentId: "doc-1",
        holderId: "firm-northgate",
        reason: "no expiry on the certificate",
      }),
    );
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        expect.stringContaining(
          "A note to Northgate Electric is waiting for your review.",
        ),
      ),
    );
  });

  it("says R-AZ's refusal in the row's own alert, never as a status", async () => {
    confirmMutate.mockRejectedValue(
      new Error("The paper this would retire blocks more than this one does."),
    );
    renderBand();
    fireEvent.click(screen.getByText("Confirm"));
    fireEvent.click(screen.getByText("Confirm the document"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("blocks more than this one does");
    expect(announce).not.toHaveBeenCalled();
  });

  // W4 r2 MAJOR-1: every token 00637's confirm/reject can raise, put through
  // the SAME path the hook takes (`throw new Error(asInboundDocumentError(e))`),
  // asserting the alert never carries the schema word.
  it.each([
    "compliance_confirm_needs_a_live_date",
    "compliance_confirm_already_lapsed",
    "compliance_confirm_ends_sooner",
    "compliance_confirm_drops_a_gate",
    "compliance_document_not_found",
    "compliance_document_already_rejected",
  ])("never lets %s reach the alert as a bare token", async (token) => {
    confirmMutate.mockRejectedValue(
      new Error(asInboundDocumentError(new Error(token))),
    );
    renderBand();
    fireEvent.click(screen.getByText("Confirm"));
    fireEvent.click(screen.getByText("Confirm the document"));
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(token);
    expect(alert).not.toHaveTextContent(/compliance_/);
    expect(alert.textContent?.trim().endsWith(".")).toBe(true);
  });
});

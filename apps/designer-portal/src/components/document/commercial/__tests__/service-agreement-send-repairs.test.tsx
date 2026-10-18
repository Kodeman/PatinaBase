import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ServiceAgreementSendSheet } from "../service-agreement-send-sheet";
import type { CommercialDocument } from "@/lib/document/commercial-documents";

jest.mock("@/hooks/use-commercial-documents", () => ({
  useSendServiceAgreement: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const agreement: CommercialDocument = {
  id: "agreement-1", projectId: null, kind: "design_services", state: "draft",
  title: "Design agreement", version: 1, waveName: null, sentAt: null,
  executedAt: null, supersededAt: null, replacementProposalId: null,
};

const blockers = [
  { message: "Link a client with an email address." },
  { message: "Write Services.", partId: "services-1", partTitle: "Services" },
  { message: "Write Terms.", partId: "terms-1", partTitle: "Terms" },
  { message: "Only a draft agreement can be sent." },
];

const mockFixPart = jest.fn();
let mockRemoveServices: (() => void) | null = null;

function SheetWithPartRefetch() {
  const [remaining, setRemaining] = useState([
    { message: "Write Services.", partId: "services-1", partTitle: "Services" },
    { message: "Write Terms.", partId: "terms-1", partTitle: "Terms" },
    { message: "Write Fee.", partId: "fee-1", partTitle: "Fee" },
  ]);
  mockRemoveServices = () => setRemaining((rows) => rows.filter((row) => row.partId !== "services-1"));
  return (
    <ServiceAgreementSendSheet
      open onClose={jest.fn()} document={agreement} terms={null} rates={[]}
      recipientEmail="client@example.com"
      readinessOverride={{ ready: false, blockers: remaining, notes: [] }}
      onFixPart={mockFixPart}
    />
  );
}

test("active Terms hold stays Terms when a refetch removes preceding Services", async () => {
  const user = userEvent.setup();
  render(<SheetWithPartRefetch />);
  await user.click(screen.getByRole("button", { name: "Send the agreement" }));
  await waitFor(() => expect(screen.getByRole("group", { name: "What needs attention" })).toHaveTextContent("Write Services."));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(screen.getByRole("group", { name: "What needs attention" })).toHaveTextContent("Write Terms."));
  act(() => mockRemoveServices?.());
  await waitFor(() => expect(windows()).toHaveLength(2));
  expect(screen.getByRole("group", { name: "What needs attention" })).toHaveTextContent("Write Terms.");
  await user.click(screen.getByRole("button", { name: "Fix Terms" }));
  expect(mockFixPart).toHaveBeenCalledWith("terms-1");
});

test("non-owner gets an Ask note and Copy a note, with generic owner fallback", async () => {
  const user = userEvent.setup();
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const props = {
    open: true, onClose: jest.fn(), document: agreement, terms: null, rates: [],
    recipientEmail: null,
    readinessOverride: { ready: false, blockers: [blockers[0]], notes: [] },
  };
  const view = render(<ServiceAgreementSendSheet {...props} ownerName="Leah Hart" />);
  expect(screen.getByText("Ask Leah Hart to link a client.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Link a client" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Send the agreement" }));
  expect(screen.getByRole("button", { name: "Copy a note" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Copy a note" }));
  expect(writeText).toHaveBeenCalledWith("Could you link a client to Design agreement? I'm preparing its agreement.");
  view.rerender(<ServiceAgreementSendSheet {...props} />);
  expect(screen.getByText("Ask the proposal's owner to link a client.")).toBeInTheDocument();
});

function SheetWithClientRepair() {
  const [remaining, setRemaining] = useState(blockers);
  return (
    <ServiceAgreementSendSheet
      open onClose={jest.fn()} document={agreement} terms={null} rates={[]}
      recipientEmail={null}
      readinessOverride={{ ready: false, blockers: remaining, notes: [] }}
      onFixPart={mockFixPart}
      onFixClient={() => setRemaining((rows) => rows.filter((row) => row !== blockers[0]))}
    />
  );
}

const windows = () => document.querySelectorAll("[data-hold-spotlight-window]");

test("held Send windows every blocker row; resolving the client leaves N-1 without inventing fixes", async () => {
  const user = userEvent.setup();
  render(<SheetWithClientRepair />);
  await user.click(screen.getByRole("button", { name: "Send the agreement" }));
  await waitFor(() => expect(windows()).toHaveLength(4));
  expect(screen.getByRole("button", { name: "Fix Services" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Fix Services" }));
  expect(mockFixPart).toHaveBeenCalledWith("services-1");
  expect(screen.getByRole("button", { name: "Fix Terms" })).toBeVisible();
  const immutable = screen.getByText("Only a draft agreement can be sent.").closest("li")!;
  expect(within(immutable).queryByRole("button")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Link a client" }));
  await waitFor(() => expect(windows()).toHaveLength(3));
  expect(screen.queryByText("Link a client with an email address.")).not.toBeInTheDocument();
  expect(screen.getAllByText("Write Services.")[0]).toBeVisible();
});

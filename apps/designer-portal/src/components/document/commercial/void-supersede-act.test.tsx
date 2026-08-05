import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const voidAuthorization = jest.fn();

jest.mock("@/hooks/use-commercial-documents", () => ({
  useVoidAuthorization: () => ({
    mutateAsync: voidAuthorization,
    isPending: false,
  }),
}));

import { START_RELEASE_EVENT, VoidAct } from "./void-supersede-act";
import type { ProjectInstrumentView } from "@/lib/document/project-commerce";

const instrument: ProjectInstrumentView = {
  documentId: "doc-1",
  proposalId: "proposal-1",
  number: 3,
  name: "Living Room Essentials",
  kind: "furnishings_authorization",
  state: "sent",
  totalAmountCents: 200_000,
  depositPercent: 50,
  depositRequiredCents: 100_000,
  depositInvoiceId: null,
  depositPaid: false,
  checkpointId: "checkpoint-1",
  coveredRoomIds: [],
  executedAt: null,
  sentAt: null,
  proposalSendDispatchId: null,
  supersededByNumber: null,
  itemCount: 1,
  items: [
    {
      id: "item-1",
      sourceFfeItemId: "ffe-1",
      projectRoomId: "room-1",
      roomName: "Living room",
      name: "Sofa",
      quantity: 1,
      clientUnitPriceCents: 200_000,
      clientLineTotalCents: 200_000,
      itemType: "furniture",
      sortOrder: 0,
    },
  ],
};

describe("VoidAct", () => {
  beforeEach(() => {
    voidAuthorization.mockReset();
  });

  it("keeps the void button disabled until both the reason and the exact typed confirmation are present", () => {
    render(<VoidAct projectId="project-1" instrument={instrument} />);
    fireEvent.click(screen.getByRole("button", { name: "Void this authorization" }));

    const voidButton = screen.getByRole("button", { name: "Void № 3" });
    expect(voidButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/reason for the void/i), {
      target: { value: "Client requested fewer pieces." },
    });
    expect(voidButton).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText(/type void № 3 to confirm the void/i),
      { target: { value: "wrong text" } },
    );
    expect(voidButton).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText(/type void № 3 to confirm the void/i),
      { target: { value: "VOID № 3" } },
    );
    expect(voidButton).toBeEnabled();
  });

  it("voids with the exact proposalId and reason once confirmed, and does not call the rpc before that", async () => {
    voidAuthorization.mockResolvedValue({ voided: true });
    render(<VoidAct projectId="project-1" instrument={instrument} />);
    fireEvent.click(screen.getByRole("button", { name: "Void this authorization" }));

    fireEvent.change(screen.getByLabelText(/reason for the void/i), {
      target: { value: "Client requested fewer pieces." },
    });
    fireEvent.change(
      screen.getByLabelText(/type void № 3 to confirm the void/i),
      { target: { value: "VOID № 3" } },
    );
    expect(voidAuthorization).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Void № 3" }));

    await waitFor(() =>
      expect(voidAuthorization).toHaveBeenCalledWith({
        proposalId: "proposal-1",
        reason: "Client requested fewer pieces.",
      }),
    );
    expect(
      await screen.findByText(/is void and superseded/i),
    ).toBeVisible();
  });

  it("emits document:start-release with the voided instrument's FF&E item ids when offered", async () => {
    voidAuthorization.mockResolvedValue({ voided: true });
    const onEvent = jest.fn();
    window.addEventListener(START_RELEASE_EVENT, onEvent);
    render(<VoidAct projectId="project-1" instrument={instrument} />);
    fireEvent.click(screen.getByRole("button", { name: "Void this authorization" }));
    fireEvent.change(screen.getByLabelText(/reason for the void/i), {
      target: { value: "Client requested fewer pieces." },
    });
    fireEvent.change(
      screen.getByLabelText(/type void № 3 to confirm the void/i),
      { target: { value: "VOID № 3" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Void № 3" }));
    await screen.findByRole("button", { name: "Start the superseding release" });

    fireEvent.click(
      screen.getByRole("button", { name: "Start the superseding release" }),
    );

    expect(onEvent).toHaveBeenCalledTimes(1);
    const event = onEvent.mock.calls[0][0] as CustomEvent<{ preTickIds: string[] }>;
    expect(event.detail).toEqual({ preTickIds: ["ffe-1"] });
    window.removeEventListener(START_RELEASE_EVENT, onEvent);
  });
});

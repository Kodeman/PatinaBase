import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CustomCommissionFulfillment } from "./custom-commission-fulfillment";

jest.mock("../../document-action", () => ({
  DocumentAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe("CustomCommissionFulfillment", () => {
  it("gates receiving and installation behind the prior accepted truth", () => {
    render(
      <CustomCommissionFulfillment milestones={[]} onRecord={jest.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: "Approve submittal" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Record received" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm installed" }),
    ).not.toBeInTheDocument();
  });

  it("waits for a purchase order before exposing fulfillment controls", () => {
    render(
      <CustomCommissionFulfillment
        milestones={[]}
        isReady={false}
        onRecord={jest.fn()}
      />,
    );

    expect(screen.getByText(/link the issued commission/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("records evidence without overwriting earlier milestone history", async () => {
    const onRecord = jest.fn().mockResolvedValue(undefined);
    render(
      <CustomCommissionFulfillment
        milestones={[
          {
            id: "milestone-submittal",
            milestoneType: "submittal",
            status: "approved",
            evidence: {},
            artifacts: [],
            eventCount: 2,
            updatedAt: "2026-08-03T12:00:00Z",
          },
        ]}
        onRecord={onRecord}
      />,
    );

    const notes = screen.getAllByPlaceholderText(
      "What was reviewed, received, or verified?",
    );
    expect(
      screen.queryByRole("button", { name: "Approve submittal" }),
    ).not.toBeInTheDocument();
    fireEvent.change(notes[0], {
      target: { value: "Two crates received; finish and quantity verified." },
    });
    const references = screen.getAllByPlaceholderText(
      "A-602 rev 4 · receiving-photo-01.jpg",
    );
    fireEvent.change(references[0], {
      target: { value: "receiving-photo-01.jpg\npacking-slip.pdf" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record received" }));

    await waitFor(() =>
      expect(onRecord).toHaveBeenCalledWith({
        milestoneType: "receiving",
        status: "received",
        note: "Two crates received; finish and quantity verified.",
        references: ["receiving-photo-01.jpg", "packing-slip.pdf"],
      }),
    );
    expect(screen.getByText("2 immutable ledger entries")).toBeInTheDocument();
  });
});

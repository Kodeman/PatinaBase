/**
 * Close this seat, on the person card (direction §1 line 8, §3.2 R4).
 *
 * The word "Remove" appears nowhere, and the hard delete is not on this
 * surface at all — a mistaken add is caught on the Call Sheet row, minutes
 * after it is made, behind `seatDeleteRefusal`.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CloseSeatAct, closeSeatConfirmSentence } from "../close-seat-act";

const closeMutate = jest.fn();
jest.mock("@patina/supabase", () => ({
  useCloseProjectPartySeat: () => ({
    mutateAsync: closeMutate,
    isPending: false,
  }),
}));

const props = {
  seatId: "seat-dana",
  projectId: "proj-okonkwo",
  name: "Dana Kowalski",
  stage: "active",
};

beforeEach(() => {
  closeMutate.mockReset().mockResolvedValue({});
});

describe("closeSeatConfirmSentence", () => {
  it("says what closing keeps", () => {
    expect(closeSeatConfirmSentence("Dana Kowalski")).toBe(
      "– Close Dana Kowalski’s seat? The seat stays on the job with the day it closed, and everything it carries stays with it.",
    );
  });
});

describe("CloseSeatAct", () => {
  it("offers one act, and never the word Remove", () => {
    render(<CloseSeatAct {...props} />);
    expect(
      screen.getByRole("button", { name: "Close this seat" }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Remove/);
  });

  it("closes in two steps, with a reason", async () => {
    render(<CloseSeatAct {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Close this seat" }));
    expect(closeMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Why it closed"), {
      target: { value: "The electrical scope finished early." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close the seat" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalled());
    expect(closeMutate).toHaveBeenCalledWith({
      id: "seat-dana",
      projectId: "proj-okonkwo",
      reason: "The electrical scope finished early.",
    });
  });

  it("lets the studio back out without writing anything", () => {
    render(<CloseSeatAct {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Close this seat" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it open" }));
    expect(closeMutate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Close this seat" }),
    ).toBeInTheDocument();
  });

  it("tells the room when the seat closes", async () => {
    const onClosed = jest.fn();
    render(<CloseSeatAct {...props} onClosed={onClosed} />);
    fireEvent.click(screen.getByRole("button", { name: "Close this seat" }));
    fireEvent.click(screen.getByRole("button", { name: "Close the seat" }));
    await waitFor(() =>
      expect(onClosed).toHaveBeenCalledWith("Dana Kowalski’s seat is closed."),
    );
  });

  it("prints a refusal as an alert rather than swallowing it", async () => {
    closeMutate.mockRejectedValue(
      new Error("That seat is not yours to close."),
    );
    render(<CloseSeatAct {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Close this seat" }));
    fireEvent.click(screen.getByRole("button", { name: "Close the seat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That seat is not yours to close.",
    );
  });
});

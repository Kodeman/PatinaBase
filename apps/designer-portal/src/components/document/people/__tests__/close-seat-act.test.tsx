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
/** The seat's own grants, and the caller's standing in the studio (r21). */
let seatAuthority: unknown[] = [];
let studioOrgs: unknown[] = [];
jest.mock("@patina/supabase", () => ({
  usePartyAuthority: () => ({ data: seatAuthority }),
  useOrganizations: () => ({ data: studioOrgs }),
  // r21 MAJOR-1 / major-2 (R-BS) — PR-n standing, read before the press.
  // 00634 refuses the close of a seat carrying an OPEN money or
  // draw-certify grant to anyone who is not an owner or an admin.
  seatCloseIsHeldForMoney: (
    authority: ReadonlyArray<{ scope: string; effective_to: string | null }> | null | undefined,
    isPrincipal: boolean,
  ) =>
    !isPrincipal &&
    (authority ?? []).some(
      (g) => g.effective_to == null && ['money', 'draw_certify'].includes(g.scope),
    ),
  SEAT_CLOSE_MONEY_HELD_REASON:
    "This seat signs for money. Closing it ends that, and ending it is the principal’s. An owner or an admin of the studio can close this seat.",
  useCloseProjectPartySeat: () => ({
    mutateAsync: closeMutate,
    isPending: false,
  }),
}));

const props = {
  seatId: "seat-dana",
  projectId: "proj-okonkwo",
  organizationId: "studio-1",
  name: "Dana Kowalski",
  stage: "active",
};

beforeEach(() => {
  closeMutate.mockReset().mockResolvedValue({});
  seatAuthority = [];
  studioOrgs = [{ id: "studio-1", membership: { role: "owner" } }];
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

  /**
   * r21 MAJOR-1 / major-2 (R-BS) — 00634 made this a GATED act, and the act
   * knew nothing about it: it was offered live to the caller the database
   * would refuse, and the refusal printed the bare token in this alert.
   */
  it("holds the act, with its reason, for a caller who is not the principal", () => {
    seatAuthority = [{ scope: "money", effective_to: null }];
    studioOrgs = [{ id: "studio-1", membership: { role: "member" } }];
    render(<CloseSeatAct {...props} />);
    const act = screen.getByRole("button", { name: "Close this seat" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(document.body.textContent).toContain(
      "An owner or an admin of the studio can close this seat.",
    );
    fireEvent.click(act);
    expect(
      screen.queryByRole("button", { name: "Close the seat" }),
    ).not.toBeInTheDocument();
  });

  it("offers the act to the principal on the same seat", () => {
    seatAuthority = [{ scope: "money", effective_to: null }];
    studioOrgs = [{ id: "studio-1", membership: { role: "admin" } }];
    render(<CloseSeatAct {...props} />);
    const act = screen.getByRole("button", { name: "Close this seat" });
    expect(act).not.toHaveAttribute("aria-disabled", "true");
  });

  it("says 00634's money refusal in words, never as a schema token", async () => {
    closeMutate.mockRejectedValue(
      new Error("seat_close_money_authority_forbidden"),
    );
    render(<CloseSeatAct {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Close this seat" }));
    fireEvent.click(screen.getByRole("button", { name: "Close the seat" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("owner or an admin");
    expect(alert.textContent).not.toContain("seat_close");
  });
});

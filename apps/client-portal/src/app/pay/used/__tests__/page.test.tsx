/**
 * R-BT: a spent return nonce lands on a readable page, never the dead sheet.
 */

import { render, screen } from "@testing-library/react";

import PayReturnUsedPage from "../page";

describe("/pay/used", () => {
  it("says what happened, and does not borrow the dead sheet's silence", () => {
    render(<PayReturnUsedPage />);

    expect(screen.getByTestId("pay-return-used")).toBeInTheDocument();
    expect(
      screen.getByText(
        /already come back from this payment, and this return address only works once/i,
      ),
    ).toBeInTheDocument();
    // The dead sheet's sentence would be a lie here: nothing died.
    expect(
      screen.queryByText(/this link is no longer good/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("pay-dead-link")).not.toBeInTheDocument();
  });
});

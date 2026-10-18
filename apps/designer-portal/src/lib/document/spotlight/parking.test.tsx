import { act, fireEvent, render, screen } from "@testing-library/react";
import { BackToParkedSheet } from "./back-to-parked-sheet";
import { clearParked, invoiceParkingKey, park, parkedState, unpark } from "./parking";

afterEach(() => clearParked());

it("names only the parked sheet for its own key and hides the return act after discard", () => {
  const onReturn = jest.fn();
  const invoice = invoiceParkingKey("house-1");
  const other = invoiceParkingKey("house-2");
  const { rerender } = render(
    <BackToParkedSheet parkingKey={invoice} sheet="the invoice" onReturn={onReturn} />,
  );
  expect(screen.queryByRole("button", { name: "Back to the invoice" })).not.toBeInTheDocument();

  act(() => park(other, { memo: "Other house" }));
  expect(parkedState(invoice)).toBeNull();
  expect(screen.queryByRole("button", { name: "Back to the invoice" })).not.toBeInTheDocument();

  act(() => park(invoice, { memo: "This house" }));
  expect(screen.getByRole("button", { name: "Back to the invoice" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back to the invoice" }));
  expect(onReturn).toHaveBeenCalledTimes(1);
  rerender(<BackToParkedSheet parkingKey={other} sheet="the order paper" onReturn={onReturn} />);
  expect(screen.getByRole("button", { name: "Back to the order paper" })).toBeInTheDocument();
  act(() => unpark(other));
  expect(screen.queryByRole("button", { name: "Back to the order paper" })).not.toBeInTheDocument();
  expect(parkedState(invoice)).toEqual({ memo: "This house" });
});

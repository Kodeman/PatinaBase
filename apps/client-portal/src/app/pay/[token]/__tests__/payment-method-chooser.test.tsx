/**
 * The standing invoice's copy of the ACH / Card / Check chooser (migration
 * 00428). The arithmetic is the letterbox's; what is new is that every row
 * carries its ARRIVED-AT TOTAL, so the comparison is made before the decision
 * rather than after it.
 */

import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

import {
  PaymentMethodChooser,
  type InvoicePaymentUIMethod,
} from "../payment-method-chooser";

type HarnessProps = {
  method?: InvoicePaymentUIMethod;
  balanceCents?: number;
  cardSurchargeBps?: number;
  disabled?: boolean;
  payeeName?: string;
  invoiceLabel?: string;
  checkRemitTo?: string | null;
};

function Harness({
  method,
  balanceCents = 912_500,
  cardSurchargeBps = 300,
  disabled = false,
  payeeName = "Quist Interiors",
  invoiceLabel = "Invoice No. 4",
  checkRemitTo = null,
}: HarnessProps) {
  const [current, setCurrent] = useState<InvoicePaymentUIMethod>(
    method ?? "us_bank_account",
  );
  return (
    <PaymentMethodChooser
      method={current}
      onMethodChange={setCurrent}
      balanceCents={balanceCents}
      currency="USD"
      cardSurchargeBps={cardSurchargeBps}
      disabled={disabled}
      payeeName={payeeName}
      invoiceLabel={invoiceLabel}
      checkRemitTo={checkRemitTo}
    />
  );
}

function rowFor(name: RegExp): HTMLElement {
  return screen.getByRole("radio", { name }).closest("label") as HTMLElement;
}

describe("PaymentMethodChooser — on the standing invoice", () => {
  it("shows all three arrived-at totals at once, with bank transfer pre-selected", () => {
    render(<Harness />);

    expect(screen.getByRole("radiogroup")).toHaveAccessibleName(
      "How would you like to pay?",
    );
    expect(screen.getByRole("radio", { name: /bank transfer/i })).toBeChecked();

    expect(
      within(rowFor(/bank transfer/i)).getByText("$9,130.00"),
    ).toBeInTheDocument();
    expect(within(rowFor(/^card/i)).getByText("$9,398.75")).toBeInTheDocument();
    expect(
      within(rowFor(/mail a check/i)).getByText("$9,125.00"),
    ).toBeInTheDocument();
  });

  it("says what each rail costs, and never calls check the lowest fee", () => {
    render(<Harness />);
    expect(
      screen.getByText("+ $5.00 · Bank transfer costs the least to process."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("+ $273.75 · This covers what card processing costs."),
    ).toBeInTheDocument();
    expect(screen.getByText("No fee.")).toBeInTheDocument();
    expect(
      screen.queryByText(/preferred · lowest fee/i),
    ).not.toBeInTheDocument();
  });

  it("holds the ACH cap on a large balance and computes the formula on a small one", () => {
    const { unmount } = render(<Harness balanceCents={912_500} />);
    expect(
      within(rowFor(/bank transfer/i)).getByText("$9,130.00"),
    ).toBeInTheDocument();
    unmount();

    render(<Harness balanceCents={67_500} />);
    expect(
      within(rowFor(/bank transfer/i)).getByText("$680.00"),
    ).toBeInTheDocument();
    expect(within(rowFor(/^card/i)).getByText("$695.25")).toBeInTheDocument();
    expect(
      within(rowFor(/mail a check/i)).getByText("$675.00"),
    ).toBeInTheDocument();
  });

  it("honours a studio card rate that is not the platform default", () => {
    render(<Harness balanceCents={100_000} cardSurchargeBps={250} />);
    expect(within(rowFor(/^card/i)).getByText("$1,025.00")).toBeInTheDocument();
  });

  it("reads each row as one accessible name — label, total, and what it costs", () => {
    render(<Harness />);
    expect(
      screen.getByRole("radio", { name: /bank transfer/i }),
    ).toHaveAccessibleName(
      "Bank transfer $9,130.00 + $5.00 · Bank transfer costs the least to process.",
    );
  });

  it("opens the mailing details on the check row, addressed to the STUDIO", () => {
    render(<Harness />);
    expect(screen.queryByTestId("pay-check-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /mail a check/i }));
    const panel = screen.getByTestId("pay-check-panel");
    expect(within(panel).getByText("Quist Interiors")).toBeInTheDocument();
    expect(
      within(panel).getByText("Contact your designer for mailing details"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Write Invoice No. 4 on the memo line."),
    ).toBeInTheDocument();
  });

  it("shows the studio-configured remit-to when there is one", () => {
    render(
      <Harness
        method="check"
        checkRemitTo={
          "Quist Interiors\n412 Walnut Street, Suite 3\nDes Moines, IA 50309"
        }
      />,
    );
    expect(
      screen.getByText(
        "Quist Interiors 412 Walnut Street, Suite 3 Des Moines, IA 50309",
      ),
    ).toBeInTheDocument();
  });

  it("locks every option while a pay-path call is in flight", () => {
    render(<Harness disabled />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio).toBeDisabled();
  });
});

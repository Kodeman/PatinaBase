import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./button";

/**
 * §A5 "held" — the same opt-in the document acts carry, on the portal button
 * the send sheet spends. Everything below the `held` prop is the button as it
 * was: this suite exists to hold that boundary.
 */
describe("Button · held", () => {
  it("keeps the control focusable, says it is disabled, and takes no act", () => {
    const act = jest.fn();
    const reason = jest.fn();
    render(
      <>
        <p id="why">Link a client with an email address.</p>
        <Button
          disabled
          held
          aria-describedby="why"
          onClick={act}
          onHeldActivate={reason}
        >
          Send the agreement
        </Button>
      </>,
    );

    const button = screen.getByRole("button", { name: "Send the agreement" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-describedby", "why");
    button.focus();
    expect(button).toHaveFocus();

    fireEvent.click(button);
    expect(act).not.toHaveBeenCalled();
    expect(reason).toHaveBeenCalledTimes(1);
  });

  it("dims a held act with faint ink on the rail, never with opacity", () => {
    render(
      <Button disabled held>
        Send
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Send" });
    expect(button.className).toContain("text-[var(--ink-faint)]");
    expect(button.className).toContain("bg-[var(--rail)]");
    expect(button.className).toContain("opacity-100");
  });

  it("changes nothing for a disabled button that is not held", () => {
    const act = jest.fn();
    render(
      <Button disabled onClick={act}>
        Send
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Send" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).not.toHaveAttribute("data-held");
    fireEvent.click(button);
    expect(act).not.toHaveBeenCalled();
  });
});

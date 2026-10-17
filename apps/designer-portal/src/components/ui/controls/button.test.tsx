import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./button";
import type { SpotlightHold } from "@/lib/document/spotlight/use-hold-spotlight";

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

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

/**
 * US-36 K4 — pressing a held Button lights up what holds it, inside the
 * nearest `data-spotlight-frame`. A site's own onHeldActivate still answers
 * alone; with no frame, the press is swallowed as before.
 */
describe("Button · held spotlight", () => {
  const REASON = "Link a client with an email address.";
  const layer = () => document.querySelector("[data-hold-spotlight]");
  const windows = () =>
    Array.from(document.querySelectorAll("[data-hold-spotlight-window]")).map(
      (el) => el.getAttribute("data-hold-spotlight-window"),
    );
  const send = () =>
    screen.getByRole("button", { name: "Send the agreement", hidden: true });

  function Sheet({
    framed = true,
    onHeldActivate,
    holds,
  }: {
    framed?: boolean;
    onHeldActivate?: () => void;
    holds?: SpotlightHold[];
  }) {
    return (
      <div data-spotlight-frame={framed ? "" : undefined}>
        {holds?.map((hold) => (
          <input key={hold.id} id={hold.id} aria-label={hold.label} />
        ))}
        <p id="why">
          {REASON}
          <button type="button">Link a client</button>
        </p>
        <Button
          disabled
          held
          aria-describedby="why"
          onHeldActivate={onHeldActivate}
          holds={holds}
        >
          Send the agreement
        </Button>
      </div>
    );
  }

  it("opens one window on the aria-describedby reason, its fixer focused", () => {
    render(<Sheet />);
    fireEvent.click(send());
    expect(windows()).toEqual(["why"]);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Link a client" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      `1 thing needs attention: ${REASON}`,
    );
  });

  it("keeps today's behaviour when no frame holds it", () => {
    render(<Sheet framed={false} />);
    fireEvent.click(send());
    expect(layer()).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("opens one window per hold when given holds", () => {
    const holds: SpotlightHold[] = ["client", "price"].map((id) => ({
      id,
      target: () => document.getElementById(id),
      label: `No ${id}`,
      reason: `Set the ${id}.`,
    }));
    render(<Sheet holds={holds} />);
    fireEvent.click(send());
    expect(windows()).toEqual(["client", "price"]);
  });

  it("leaves an onHeldActivate site exactly as it was", () => {
    const reason = jest.fn();
    render(<Sheet onHeldActivate={reason} />);
    fireEvent.click(send());
    expect(reason).toHaveBeenCalledTimes(1);
    expect(layer()).toBeNull();
  });

  it("opens the same window for a held asChild link", () => {
    render(
      <div data-spotlight-frame>
        <p id="why">{REASON}</p>
        <Button asChild disabled held aria-describedby="why">
          <a href="#paper">Open the paper</a>
        </Button>
      </div>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Open the paper" }));
    expect(windows()).toEqual(["why"]);
  });
});

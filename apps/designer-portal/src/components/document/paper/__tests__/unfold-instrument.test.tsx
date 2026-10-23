import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  openUnfold,
  UNFOLD_SAVING_MESSAGE,
  UNFOLD_UNSAVED_MESSAGE,
  UnfoldInstrument,
} from "@/components/document/paper/unfold-instrument";
import { RETURN_FALLBACK_MESSAGES } from "@/lib/document/paper/return-context";
import {
  registerBoardOwnerAutosave,
  resetProposalAutosaveRegistryForTests,
} from "@/lib/proposal-autosave-registry";

const DOC = "d1";
const ROOM = "6f1c2b3a-1111-4222-8333-444455556666";
const LINE = "0a9b8c7d-aaaa-4bbb-8ccc-ddddeeeeffff";
const OWNER = { kind: "project" as const, id: "p1" };

const save = jest.fn();

function Paper({ withOpener = true }: { withOpener?: boolean }) {
  return (
    <div data-document-shell>
      <section data-paper-chapter="ffe">
        <h2 data-chapter-heading>FF&amp;E</h2>
        <section id={`pieces-room-${ROOM}`}>
          <h3 data-room-heading={ROOM} tabIndex={-1}>
            Living room
          </h3>
          {withOpener ? (
            <button
              type="button"
              onClick={(event) =>
                openUnfold(
                  { kind: "pieces", lens: "spec", room: ROOM, line: LINE },
                  { documentId: DOC, chapter: "ffe", room: ROOM, line: LINE },
                  event.currentTarget,
                )
              }
            >
              Open sofa
            </button>
          ) : null}
        </section>
      </section>
      <UnfoldInstrument label="FF&E schedule" canSeeMoney autosaveOwner={OWNER}>
        {({ address, close, navigate }) => (
          <div data-testid="sheet">
            <p data-testid="address">
              {address.lens}|{address.room}|{address.line}
            </p>
            <input aria-label="Maker" />
            <button type="button" onClick={() => save()}>
              Save
            </button>
            <button type="button" onClick={() => navigate({ lens: "price" })}>
              Price lens
            </button>
            <button type="button" onClick={close}>
              Sheet back
            </button>
          </div>
        )}
      </UnfoldInstrument>
    </div>
  );
}

function popstate() {
  return new Promise<void>((resolve) =>
    window.addEventListener("popstate", () => resolve(), { once: true }),
  );
}

async function back() {
  const landed = popstate();
  act(() => window.history.back());
  await act(async () => landed);
}

async function forward() {
  const landed = popstate();
  act(() => window.history.forward());
  await act(async () => landed);
}

async function settle() {
  await act(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

describe("UnfoldInstrument", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", `/doc/${DOC}?sheet=call`);
    resetProposalAutosaveRegistryForTests();
    save.mockReset();
    window.scrollTo = jest.fn();
    window.scrollBy = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens in place with pushState, keeping the same paper node", () => {
    const push = jest.spyOn(window.history, "pushState");
    const { container } = render(<Paper />);
    const shell = container.querySelector("[data-document-shell]");
    expect(screen.queryByTestId("sheet")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));

    expect(push).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(window.location.search);
    expect(window.location.pathname).toBe(`/doc/${DOC}`);
    expect(params.get("unfold")).toBe("pieces");
    expect(params.get("lens")).toBe("spec");
    expect(params.get("room")).toBe(ROOM);
    expect(params.get("line")).toBe(LINE);
    expect(params.get("sheet")).toBe("call");
    expect(screen.getByTestId("address")).toHaveTextContent(
      `spec|${ROOM}|${LINE}`,
    );
    const region = screen.getByRole("region", { name: "FF&E schedule" });
    expect(region).not.toHaveAttribute("role", "dialog");
    expect(region).not.toHaveAttribute("aria-modal");
    expect(container.querySelector("[data-document-shell]")).toBe(shell);
  });

  it("Esc folds away with history.back and returns focus to the opener", async () => {
    const backSpy = jest.spyOn(window.history, "back");
    render(<Paper />);
    const opener = screen.getByRole("button", { name: "Open sofa" });
    fireEvent.click(opener);
    const landed = popstate();
    fireEvent.keyDown(screen.getByRole("button", { name: "Save" }), {
      key: "Escape",
    });
    await act(async () => landed);
    await settle();

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("sheet")).toBeNull();
    expect(window.location.search).toBe("?sheet=call");
    expect(document.activeElement).toBe(opener);
  });

  it("Esc yields to an open dialog, a popover, a menu and a field with text", () => {
    const backSpy = jest.spyOn(window.history, "back");
    render(<Paper />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    const save = screen.getByRole("button", { name: "Save" });

    for (const markup of [
      '<div role="dialog" aria-modal="true">Confirm</div>',
      "<div data-dismissible-popover>Dates</div>",
      '<div role="menu">Row menu</div>',
    ]) {
      const holder = document.createElement("div");
      holder.innerHTML = markup;
      document.body.appendChild(holder);
      fireEvent.keyDown(save, { key: "Escape" });
      holder.remove();
    }
    const field = screen.getByLabelText("Maker");
    fireEvent.change(field, { target: { value: "Holly Hunt" } });
    fireEvent.keyDown(field, { key: "Escape" });

    expect(backSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
  });

  it("Back closes and Forward reopens, restoring from the entry", async () => {
    render(<Paper />);
    const opener = screen.getByRole("button", { name: "Open sofa" });
    fireEvent.click(opener);

    await back();
    await settle();
    expect(screen.queryByTestId("sheet")).toBeNull();
    expect(document.activeElement).toBe(opener);

    await forward();
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("line")).toBe(LINE);

    // The reopened entry still carries its return context.
    fireEvent.click(screen.getByRole("button", { name: "Return to the room" }));
    await act(async () => popstate());
    await settle();
    expect(document.activeElement).toBe(opener);
    expect(save).not.toHaveBeenCalled();
  });

  it("a reload on ?unfold= reopens without replaying a write and closes by replace", () => {
    window.history.replaceState(
      null,
      "",
      `/doc/${DOC}?sheet=call&unfold=pieces&lens=release&room=${ROOM}`,
    );
    const backSpy = jest.spyOn(window.history, "back");
    const replace = jest.spyOn(window.history, "replaceState");
    render(<Paper />);

    expect(screen.getByTestId("address")).toHaveTextContent(`release|${ROOM}|`);
    expect(save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Return to the room" }));
    expect(backSpy).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
    expect(window.location.search).toBe("?sheet=call");
    expect(screen.queryByTestId("sheet")).toBeNull();
  });

  it("re-addresses in place without a new entry, so one Back still closes", async () => {
    const push = jest.spyOn(window.history, "pushState");
    render(<Paper />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    fireEvent.click(screen.getByRole("button", { name: "Price lens" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("address")).toHaveTextContent(
      `price|${ROOM}|${LINE}`,
    );
    await back();
    expect(screen.queryByTestId("sheet")).toBeNull();
    expect(window.location.search).toBe("?sheet=call");
  });

  it("holds the close with a visible saving state until buffered edits land", async () => {
    let dirty = true;
    let finish!: () => void;
    const registration = registerBoardOwnerAutosave(OWNER, {
      getSnapshot: () => ({ dirty, flushing: false, error: null }),
      flush: () =>
        new Promise<void>((resolve) => {
          finish = () => {
            dirty = false;
            resolve();
          };
        }),
    });
    const backSpy = jest.spyOn(window.history, "back");
    render(<Paper />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to the room" }));

    expect(await screen.findByText(UNFOLD_SAVING_MESSAGE)).toBeInTheDocument();
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
    expect(backSpy).not.toHaveBeenCalled();

    const landed = popstate();
    await act(async () => finish());
    await act(async () => landed);
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("sheet")).toBeNull();
    act(() => registration.unregister());
  });

  it("keeps the sheet open, with an alert, when the buffered save fails", async () => {
    registerBoardOwnerAutosave(OWNER, {
      getSnapshot: () => ({ dirty: true, flushing: false, error: "offline" }),
      flush: async () => {},
    });
    const backSpy = jest.spyOn(window.history, "back");
    render(<Paper />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Save" }), {
      key: "Escape",
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      UNFOLD_UNSAVED_MESSAGE,
    );
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("falls back to the room heading, and says so, when the opener is gone", async () => {
    const { rerender } = render(<Paper />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    rerender(<Paper withOpener={false} />);

    await back();
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Living room" }),
    );
    await waitFor(() =>
      expect(document.querySelector("[data-unfold-return]")).toHaveTextContent(
        RETURN_FALLBACK_MESSAGES.room,
      ),
    );
  });
});

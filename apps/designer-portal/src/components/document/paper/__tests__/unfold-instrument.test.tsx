import { useEffect, useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useUpdateProjectFfeSpec } from "@patina/supabase";
import {
  openUnfold,
  UNFOLD_SAVING_MESSAGE,
  UNFOLD_UNSAVED_MESSAGE,
  UnfoldInstrument,
} from "@/components/document/paper/unfold-instrument";
import { BuildRoomShell } from "@/components/document/pieces/build-room-shell";
import {
  RETURN_FALLBACK_MESSAGES,
  RETURN_PLACE_MESSAGES,
} from "@/lib/document/paper/return-context";
import {
  registerBoardOwnerAutosave,
  resetProposalAutosaveRegistryForTests,
} from "@/lib/proposal-autosave-registry";

// The real write path of the FF&E sheet (SpecFieldsPane → this hook).
const mockMutateAsync = jest.fn();
jest.mock("@patina/supabase", () => {
  const mutation = {
    mutateAsync: (input: unknown) => mockMutateAsync(input),
    isPending: false,
  };
  return { useUpdateProjectFfeSpec: () => mutation };
});

const DOC = "d1";
const ROOM = "6f1c2b3a-1111-4222-8333-444455556666";
const LINE = "0a9b8c7d-aaaa-4bbb-8ccc-ddddeeeeffff";
const OWNER = { kind: "project" as const, id: "p1" };
const DEEP_LINK = `/doc/${DOC}?sheet=call&unfold=pieces&lens=spec`;

/**
 * A buffered Maker field wired like the sheet's spec fields: it registers
 * with the owner's autosave barrier and writes through the save hook.
 */
function SpecEditor() {
  const updateSpec = useUpdateProjectFfeSpec();
  const [value, setValue] = useState("");
  const live = useRef({ value: "", saved: "", error: null as string | null });
  const registration = useRef<{ notify: () => void } | null>(null);

  useEffect(() => {
    const handle = registerBoardOwnerAutosave(OWNER, {
      getSnapshot: () => ({
        dirty: live.current.value !== live.current.saved,
        flushing: false,
        error: live.current.error,
      }),
      flush: async () => {
        const next = live.current.value;
        if (next === live.current.saved) return;
        try {
          await updateSpec.mutateAsync({
            specId: "s1",
            expectedRowVersion: 1,
            changes: { maker: next },
          });
          live.current.saved = next;
          live.current.error = null;
        } catch (error) {
          live.current.error = "The save did not reach the server.";
          throw error;
        }
      },
    });
    registration.current = handle;
    return () => handle.unregister();
  }, [updateSpec]);

  return (
    <input
      aria-label="Maker"
      value={value}
      onChange={(event) => {
        live.current.value = event.target.value;
        setValue(event.target.value);
        registration.current?.notify();
      }}
    />
  );
}

type Sheet = "editor" | "embedded";

function Paper({
  withOpener = true,
  sheet = "editor",
  inChapter = false,
}: {
  withOpener?: boolean;
  sheet?: Sheet;
  inChapter?: boolean;
}) {
  const instrument = (
    <UnfoldInstrument label="FF&E schedule" canSeeMoney autosaveOwner={OWNER}>
      {({ address, close, navigate }) =>
        sheet === "embedded" ? (
          <BuildRoomShell
            embedded
            onRequestClose={close}
            onReturn={close}
            onNavigate={() => {}}
            docId={DOC}
            jobName="Job"
            lens="spec"
            room={null}
            rooms={[]}
            counts={{
              job: { lines: 0, placeholders: 0, ready: 0 },
              rooms: {},
              throughout: { lines: 0, placeholders: 0, ready: 0 },
              unassigned: { lines: 0, placeholders: 0, ready: 0 },
            }}
            removedCount={0}
            canSeeMoney
          >
            <button type="button">Sheet action</button>
          </BuildRoomShell>
        ) : (
          <div data-testid="sheet">
            <p data-testid="address">
              {address.lens}|{address.room}|{address.line}
            </p>
            <SpecEditor />
            <button type="button">Save</button>
            <button type="button" onClick={() => navigate({ lens: "price" })}>
              Price lens
            </button>
            <button type="button" onClick={close}>
              Sheet back
            </button>
          </div>
        )
      }
    </UnfoldInstrument>
  );
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
        {inChapter ? instrument : null}
      </section>
      {inChapter ? null : instrument}
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

/** A dirty buffer whose flush waits until the test lets it finish or fail. */
function pendingBuffer() {
  let dirty = true;
  let error: string | null = null;
  let finish!: () => void;
  let fail!: () => void;
  const registration = registerBoardOwnerAutosave(OWNER, {
    getSnapshot: () => ({ dirty, flushing: false, error }),
    flush: () =>
      new Promise<void>((resolve, reject) => {
        finish = () => {
          dirty = false;
          resolve();
        };
        fail = () => {
          error = "The save did not reach the server.";
          reject(new Error(error));
        };
      }),
  });
  return { registration, finish: () => finish(), fail: () => fail() };
}

/**
 * A Back the open sheet holds: the event never reaches later listeners, so
 * wait for the entry to be put back instead.
 */
async function heldBack(push: jest.SpyInstance, times: number) {
  act(() => window.history.back());
  await waitFor(() => expect(push).toHaveBeenCalledTimes(times));
}

/** The instrument's host (an embedded sheet names its own section too). */
function region() {
  return document.querySelector("[data-unfold-instrument]");
}

describe("UnfoldInstrument", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", `/doc/${DOC}?sheet=call`);
    resetProposalAutosaveRegistryForTests();
    mockMutateAsync.mockReset();
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
    const host = screen.getByRole("region", { name: "FF&E schedule" });
    expect(host).not.toHaveAttribute("role", "dialog");
    expect(host).not.toHaveAttribute("aria-modal");
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

  it("Esc leaves the instrument open while the embedded sheet's phone picker holds it", () => {
    const backSpy = jest.spyOn(window.history, "back");
    render(<Paper sheet="embedded" />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    fireEvent.click(
      screen.getByRole("button", { name: /All project selections/ }),
    );
    const elsewhere = screen.getByRole("button", { name: "Sheet action" });
    elsewhere.focus();

    fireEvent.keyDown(elsewhere, { key: "Escape" });

    expect(backSpy).not.toHaveBeenCalled();
    expect(region()).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("unfold")).toBe(
      "pieces",
    );
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
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("a reload on ?unfold= reopens without a call to the write path and closes by replace", () => {
    window.history.replaceState(
      null,
      "",
      `/doc/${DOC}?sheet=call&unfold=pieces&lens=release&room=${ROOM}`,
    );
    const backSpy = jest.spyOn(window.history, "back");
    const replace = jest.spyOn(window.history, "replaceState");
    render(<Paper />);

    expect(screen.getByTestId("address")).toHaveTextContent(`release|${ROOM}|`);
    expect(screen.getByLabelText("Maker")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Return to the room" }));
    expect(backSpy).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
    expect(window.location.search).toBe("?sheet=call");
    expect(screen.queryByTestId("sheet")).toBeNull();
    expect(mockMutateAsync).not.toHaveBeenCalled();
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

  it("re-addresses a deep-linked unfold by replace, so one Back closes", async () => {
    window.history.pushState(null, "", DEEP_LINK);
    const push = jest.spyOn(window.history, "pushState");
    render(<Paper />);
    expect(region()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));

    expect(push).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("line")).toBe(LINE);
    await back();
    expect(region()).toBeNull();
    expect(window.location.search).toBe("?sheet=call");
  });

  it("closes a deep link to the room heading its address names, and says so", async () => {
    window.history.replaceState(
      null,
      "",
      `/doc/${DOC}?unfold=pieces&lens=spec&room=${ROOM}`,
    );
    render(<Paper />);
    const returnButton = screen.getByRole("button", {
      name: "Return to the room",
    });
    returnButton.focus();
    fireEvent.click(returnButton);
    await settle();

    expect(region()).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Living room" }),
    );
    expect(document.querySelector("[data-unfold-return]")).toHaveTextContent(
      RETURN_PLACE_MESSAGES.room,
    );
  });

  it("closes a deep link with no room to its chapter heading", async () => {
    window.history.replaceState(null, "", DEEP_LINK);
    render(<Paper inChapter />);
    const returnButton = screen.getByRole("button", {
      name: "Return to the room",
    });
    returnButton.focus();
    fireEvent.click(returnButton);
    await settle();

    expect(region()).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "FF&E" }),
    );
    expect(document.querySelector("[data-unfold-return]")).toHaveTextContent(
      RETURN_PLACE_MESSAGES.chapter,
    );
  });

  it("closes a deep link outside any chapter to its kind's home chapter", async () => {
    window.history.replaceState(null, "", DEEP_LINK);
    render(<Paper />);
    const returnButton = screen.getByRole("button", {
      name: "Return to the room",
    });
    returnButton.focus();
    fireEvent.click(returnButton);
    await settle();

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "FF&E" }),
    );
    expect(document.querySelector("[data-unfold-return]")).toHaveTextContent(
      RETURN_PLACE_MESSAGES.chapter,
    );
  });

  it("holds the close with a visible saving state until buffered edits land", async () => {
    const { registration, finish } = pendingBuffer();
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

  // Story #40 rescinds "Back is never blocked by the pending save": Back is
  // never lost. It holds like Return and completes once the save lands.
  it("Back is never lost: a held Back completes once its save lands, in one step", async () => {
    const { finish } = pendingBuffer();
    render(<Paper />);
    const opener = screen.getByRole("button", { name: "Open sofa" });
    fireEvent.click(opener);
    const unfolded = window.location.href;
    const length = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: "Return to the room" }));
    expect(await screen.findByText(UNFOLD_SAVING_MESSAGE)).toBeInTheDocument();
    const push = jest.spyOn(window.history, "pushState");

    // Held twice: the entry is put back, and history never grows.
    await heldBack(push, 1);
    expect(window.location.href).toBe(unfolded);
    expect(window.history.length).toBe(length);
    expect(region()).toBeInTheDocument();
    await heldBack(push, 2);
    expect(window.location.href).toBe(unfolded);
    expect(window.history.length).toBe(length);
    expect(screen.getByText(UNFOLD_SAVING_MESSAGE)).toBeInTheDocument();

    const backSpy = jest.spyOn(window.history, "back");
    const landed = popstate();
    await act(async () => finish());
    await act(async () => landed);
    await settle();

    // One Back completes it; the earlier Return's answer adds none, and the
    // completing pop is not held again.
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe("?sheet=call");
    expect(region()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("a held Back whose save fails stays open, says so, and holds again", async () => {
    const { fail } = pendingBuffer();
    render(<Paper />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    const unfolded = window.location.href;
    const push = jest.spyOn(window.history, "pushState");
    const backSpy = jest.spyOn(window.history, "back");

    await heldBack(push, 1);
    expect(screen.getByText(UNFOLD_SAVING_MESSAGE)).toBeInTheDocument();
    await act(async () => fail());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      UNFOLD_UNSAVED_MESSAGE,
    );
    expect(window.location.href).toBe(unfolded);
    expect(region()).toBeInTheDocument();
    // `back` was called once, by the test; the sheet never completes it.
    expect(backSpy).toHaveBeenCalledTimes(1);

    // Still failed: the next Back holds too.
    await heldBack(push, 2);
    expect(window.location.href).toBe(unfolded);
    expect(region()).toBeInTheDocument();
  });

  it("a held Back to another document completes there once the save lands, without looping", async () => {
    // Opened straight on the unfold (no earlier in-document entry), over /desk.
    window.history.replaceState(null, "", "/desk");
    window.history.pushState(null, "", DEEP_LINK);
    const { finish } = pendingBuffer();
    render(<Paper />);
    expect(region()).toBeInTheDocument();
    const length = window.history.length;
    const push = jest.spyOn(window.history, "pushState");

    await heldBack(push, 1);
    expect(window.location.pathname).toBe(`/doc/${DOC}`);
    expect(window.history.length).toBe(length);
    expect(region()).toBeInTheDocument();

    const landed = popstate();
    await act(async () => finish());
    await act(async () => landed);
    await settle();
    expect(window.location.pathname).toBe("/desk");
    expect(push).toHaveBeenCalledTimes(1);
    expect(region()).toBeNull();
  });

  it("a held Back whose save finishes after the instrument unmounts navigates nowhere", async () => {
    const { finish } = pendingBuffer();
    const { unmount } = render(<Paper />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    const push = jest.spyOn(window.history, "pushState");
    await heldBack(push, 1);
    const before = window.location.href;
    unmount();
    const backSpy = jest.spyOn(window.history, "back");

    await act(async () => finish());
    await settle();
    expect(backSpy).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
  });

  it("asks the browser to confirm leaving only while a write is pending or marked", () => {
    let snapshot: { dirty: boolean; flushing: boolean; error: string | null } = {
      dirty: false,
      flushing: false,
      error: null,
    };
    const registration = registerBoardOwnerAutosave(OWNER, {
      getSnapshot: () => snapshot,
      flush: () => Promise.resolve(),
    });
    const set = (next: typeof snapshot) =>
      act(() => {
        snapshot = next;
        registration.notify();
      });
    /** A reload, a tab close or a Back to another browser document. */
    const leaveCancelled = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const { unmount } = render(<Paper />);
    expect(leaveCancelled()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    expect({ "clean": leaveCancelled() }).toEqual({ "clean": false });

    set({ dirty: true, flushing: false, error: null });
    expect({ "a buffered edit": leaveCancelled() }).toEqual({ "a buffered edit": true });
    set({ dirty: true, flushing: true, error: null });
    expect({ "a write in flight": leaveCancelled() }).toEqual({ "a write in flight": true });
    set({ dirty: false, flushing: false, error: null });
    expect({ "saved": leaveCancelled() }).toEqual({ "saved": false });
    set({ dirty: true, flushing: false, error: "The save did not reach the server." });
    expect({ "a marked failure": leaveCancelled() }).toEqual({ "a marked failure": true });

    unmount();
    expect({ "unmounted": leaveCancelled() }).toEqual({ "unmounted": false });
  });

  it("a save that finishes after the instrument unmounts navigates nowhere", async () => {
    const { finish } = pendingBuffer();
    const { unmount } = render(<Paper />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to the room" }));
    expect(await screen.findByText(UNFOLD_SAVING_MESSAGE)).toBeInTheDocument();
    const before = window.location.href;
    unmount();
    const backSpy = jest.spyOn(window.history, "back");
    const replace = jest.spyOn(window.history, "replaceState");

    await act(async () => finish());

    expect(backSpy).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
  });

  it("keeps the sheet open, with the typed value and focus, when the write fails", async () => {
    mockMutateAsync.mockRejectedValue(new Error("offline"));
    const backSpy = jest.spyOn(window.history, "back");
    render(<Paper />);
    fireEvent.click(screen.getByRole("button", { name: "Open sofa" }));
    const field = screen.getByLabelText("Maker");
    fireEvent.change(field, { target: { value: "Holly Hunt" } });
    const returnButton = screen.getByRole("button", {
      name: "Return to the room",
    });
    returnButton.focus();
    fireEvent.click(returnButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      UNFOLD_UNSAVED_MESSAGE,
    );
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { maker: "Holly Hunt" } }),
    );
    expect(screen.getByLabelText("Maker")).toHaveValue("Holly Hunt");
    expect(document.activeElement).toBe(returnButton);
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

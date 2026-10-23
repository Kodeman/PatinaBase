import {
  captureReturnContext,
  isReturnContext,
  restoreReturnContext,
  RETURN_CONTROL_ATTR,
  RETURN_FALLBACK_MESSAGES,
} from "@/lib/document/paper/return-context";

const ROOM = "6f1c2b3a-1111-4222-8333-444455556666";
const LINE = "0a9b8c7d-aaaa-4bbb-8ccc-ddddeeeeffff";

function paper() {
  document.body.innerHTML = `
    <section data-paper-chapter="ffe">
      <h2 data-chapter-heading>FF&amp;E</h2>
      <section id="pieces-room-${ROOM}">
        <h3 data-room-heading="${ROOM}" tabindex="-1">Living room</h3>
        <div data-line-id="${LINE}">
          <button type="button">Open sofa</button>
        </div>
      </section>
    </section>`;
  return document.querySelector<HTMLButtonElement>("[data-line-id] button")!;
}

describe("return-context", () => {
  beforeEach(() => {
    window.scrollTo = jest.fn();
    window.scrollBy = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();
  });

  it("captures the place, the anchor and the opening control", () => {
    const opener = paper();
    window.scrollY = 900;
    const ctx = captureReturnContext(
      {
        documentId: "d1",
        chapter: "ffe",
        room: ROOM,
        line: LINE,
        lens: "spec",
        filters: { stage: "spec" },
        selection: [LINE],
      },
      opener,
    );
    expect(ctx).toMatchObject({
      documentId: "d1",
      chapter: "ffe",
      room: ROOM,
      line: LINE,
      packageId: null,
      lens: "spec",
      filters: { stage: "spec" },
      selection: [LINE],
      scrollY: 900,
      scrollAnchor: { id: `pieces-room-${ROOM}`, top: 0 },
    });
    expect(ctx.initiatingControlId).toBeTruthy();
    expect(opener.getAttribute(RETURN_CONTROL_ATTR)).toBe(ctx.initiatingControlId);
    expect(isReturnContext(JSON.parse(JSON.stringify(ctx)))).toBe(true);
  });

  it("reuses the control's own id", () => {
    const opener = paper();
    opener.id = "open-sofa";
    expect(captureReturnContext({ documentId: "d1" }, opener).initiatingControlId).toBe(
      "open-sofa",
    );
  });

  it("returns focus to the opening control and puts the anchor back", () => {
    const opener = paper();
    const ctx = captureReturnContext({ documentId: "d1", room: ROOM }, opener);
    const anchor = document.getElementById(`pieces-room-${ROOM}`)!;
    jest
      .spyOn(anchor, "getBoundingClientRect")
      .mockReturnValue({ top: 120 } as DOMRect);
    const announce = jest.fn();
    expect(restoreReturnContext(ctx, { announce })).toBe("control");
    expect(document.activeElement).toBe(opener);
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 120, behavior: "auto" });
    expect(announce).not.toHaveBeenCalled();
  });

  it("finds a control by id after a reload dropped the marker", () => {
    const opener = paper();
    opener.id = "open-sofa";
    const ctx = captureReturnContext({ documentId: "d1" }, opener);
    opener.removeAttribute(RETURN_CONTROL_ATTR);
    expect(restoreReturnContext(ctx)).toBe("control");
    expect(document.activeElement).toBe(opener);
  });

  it("falls back to the room heading, saying why, when the line was removed or is unreadable", () => {
    const opener = paper();
    const ctx = captureReturnContext(
      { documentId: "d1", chapter: "ffe", room: ROOM, line: LINE },
      opener,
    );
    document.querySelector("[data-line-id]")!.remove();
    const announce = jest.fn();
    expect(restoreReturnContext(ctx, { announce })).toBe("room");
    expect(document.activeElement).toBe(
      document.querySelector(`[data-room-heading="${ROOM}"]`),
    );
    expect(announce).toHaveBeenCalledWith(RETURN_FALLBACK_MESSAGES.room);
    expect(RETURN_FALLBACK_MESSAGES.room).not.toMatch(/not found/i);
  });

  it("falls back to the chapter heading when the room is gone too", () => {
    const opener = paper();
    const ctx = captureReturnContext(
      { documentId: "d1", chapter: "ffe", room: ROOM },
      opener,
    );
    document.getElementById(`pieces-room-${ROOM}`)!.remove();
    const announce = jest.fn();
    expect(restoreReturnContext(ctx, { announce })).toBe("chapter");
    const heading = document.querySelector<HTMLElement>("[data-chapter-heading]")!;
    expect(document.activeElement).toBe(heading);
    expect(heading.tabIndex).toBe(-1);
    expect(announce).toHaveBeenCalledWith(RETURN_FALLBACK_MESSAGES.chapter);
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it("skips a control that is still present but disabled or hidden", () => {
    const opener = paper();
    const ctx = captureReturnContext(
      { documentId: "d1", chapter: "ffe", room: ROOM },
      opener,
    );
    opener.disabled = true;
    expect(restoreReturnContext(ctx)).toBe("room");
    opener.disabled = false;
    opener.closest("section")!.setAttribute("hidden", "");
    expect(restoreReturnContext(ctx)).toBe("chapter");
  });

  it("says nothing when no control was recorded (a deep link)", () => {
    paper();
    const ctx = captureReturnContext({ documentId: "d1", room: ROOM }, null);
    const announce = jest.fn();
    expect(restoreReturnContext(ctx, { announce })).toBe("room");
    expect(announce).not.toHaveBeenCalled();
  });

  it("reports none when nothing is left to hold focus", () => {
    document.body.innerHTML = "";
    const ctx = captureReturnContext({ documentId: "d1", chapter: "ffe" }, null);
    expect(restoreReturnContext(ctx)).toBe("none");
  });

  it("rejects malformed history state", () => {
    expect(isReturnContext(null)).toBe(false);
    expect(isReturnContext({ documentId: "d1" })).toBe(false);
  });
});

import {
  clearPaperOrigin,
  paperOriginHref,
  paperOriginKind,
  paperOriginLabel,
  readPaperOrigin,
  rememberPaperOrigin,
  markDeskReturn,
  takeDeskReturn,
} from "@/lib/document/paper/paper-origin";
import {
  readRoomOrigin,
  rememberRoomOrigin,
} from "@/lib/document/room-origin";

const DOC = "d1";

describe("paper-origin", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.scrollY = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("remembers the desk card it was opened from, leaving the offset to the Desk", () => {
    window.scrollY = 640;
    rememberPaperOrigin(DOC, { path: "/desk", anchorId: "desk-row-d1" });
    expect(readPaperOrigin(DOC)).toEqual({
      docId: DOC,
      kind: "desk",
      path: "/desk",
      search: "",
      anchorId: "desk-row-d1",
      scrollY: null,
      focusId: null,
    });
    expect(paperOriginLabel(readPaperOrigin(DOC))).toBe("Studio");
  });

  it("remembers a resource origin with its offset and search", () => {
    window.scrollY = 320;
    rememberPaperOrigin(DOC, {
      path: "/library",
      search: "?q=oak",
      focusId: "piece-7",
    });
    const origin = readPaperOrigin(DOC);
    expect(origin).toMatchObject({
      kind: "library",
      scrollY: 320,
      focusId: "piece-7",
    });
    expect(paperOriginHref(origin)).toBe("/library?q=oak");
    expect(paperOriginLabel(origin)).toBe("Resource library");
  });

  it("names each origin kind", () => {
    expect(paperOriginKind("/people")).toBe("people");
    expect(paperOriginKind("/people/abc")).toBe("people");
    expect(paperOriginKind("/rooms")).toBe("room");
    expect(paperOriginKind("/room/r1")).toBe("room");
    expect(paperOriginKind("/doc/other")).toBe("document");
    expect(paperOriginKind("/somewhere")).toBe("deep-link");
  });

  it("answers a deep link (the Studio) for a job with no origin, or another job's", () => {
    expect(readPaperOrigin(DOC)).toMatchObject({ kind: "deep-link", path: "/desk" });
    rememberPaperOrigin("d2", { path: "/library" });
    expect(readPaperOrigin(DOC)).toMatchObject({ kind: "deep-link", path: "/desk" });
    expect(readPaperOrigin("d2").kind).toBe("library");
  });

  it("never lets the job itself overwrite its origin", () => {
    rememberPaperOrigin(DOC, { path: "/people" });
    rememberPaperOrigin(DOC, { path: `/doc/${DOC}` });
    rememberPaperOrigin(DOC, { path: `/doc/${DOC}/pieces`, search: "?lens=spec" });
    expect(readPaperOrigin(DOC).kind).toBe("people");
    rememberPaperOrigin(DOC, { path: `/doc/${DOC}x` });
    expect(readPaperOrigin(DOC).kind).toBe("document");
  });

  it("keeps room-origin's destination: Library → People from the job still returns to the job", () => {
    rememberPaperOrigin(DOC, { path: "/desk" });
    // The job opens the Library; the Library then walks to People.
    rememberRoomOrigin(`/doc/${DOC}`);
    rememberRoomOrigin("/library");
    expect(readRoomOrigin()).toBe(`/doc/${DOC}`);
    // Opening a job from a Room never writes the Room's own way back.
    rememberPaperOrigin("d2", { path: "/library" });
    expect(readRoomOrigin()).toBe(`/doc/${DOC}`);
    expect(readPaperOrigin(DOC).kind).toBe("desk");
  });

  it("falls back to the Studio when storage throws", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => rememberPaperOrigin(DOC, { path: "/library" })).not.toThrow();
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readPaperOrigin(DOC).kind).toBe("deep-link");
  });

  it("ignores a malformed stored value", () => {
    window.sessionStorage.setItem("patina:paper-origin:v1", "{not json");
    expect(readPaperOrigin(DOC).kind).toBe("deep-link");
    window.sessionStorage.setItem(
      "patina:paper-origin:v1",
      JSON.stringify({ docId: DOC, path: 7 }),
    );
    expect(readPaperOrigin(DOC).kind).toBe("deep-link");
  });

  it("round-trips the Desk return focus hint exactly once without copying scroll", () => {
    rememberPaperOrigin(DOC, { path: "/desk", focusId: "pressed-control", anchorId: "desk-row" });
    markDeskReturn(readPaperOrigin(DOC));
    expect(takeDeskReturn()).toEqual({ docId: DOC, anchor: "pressed-control", at: expect.any(Number) });
    expect(takeDeskReturn()).toBeNull();
  });

  it("makes Desk return a no-op with storage disabled", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => markDeskReturn({ docId: DOC, focusId: "control", anchorId: null })).not.toThrow();
    expect(takeDeskReturn()).toBeNull();
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(takeDeskReturn()).toBeNull();
  });

  it("consumes malformed Desk return data without throwing", () => {
    window.sessionStorage.setItem("patina:desk-return:v1", "{not json");
    expect(takeDeskReturn()).toBeNull();
    expect(window.sessionStorage.getItem("patina:desk-return:v1")).toBeNull();
  });

  it.each(['books', 'post', 'search'] as const)('remembers %s overlay state without borrowing window scroll', (overlay) => {
    window.scrollY = 920;
    const state = { overlay, subject: 'invoice-7', filter: 'receivables', query: 'oak', scrollTop: 180, focusKey: 'row-7' };
    rememberPaperOrigin(DOC, { path: `/doc/${DOC}`, studioOverlay: state });
    expect(readPaperOrigin(DOC)).toMatchObject({
      kind: 'studio-overlay', path: '/desk', search: '', scrollY: null, ...state,
    });
    expect(paperOriginHref(readPaperOrigin(DOC))).toBe('/desk');
    expect(paperOriginLabel(readPaperOrigin(DOC))).toBe('Studio');
  });

  it.each([
    { overlay: 'unknown' },
    { overlay: 'books', scrollTop: -1 },
    { overlay: 'post', scrollTop: '100' },
    { overlay: 'search', query: {} },
    { overlay: 'books', focusKey: [] },
  ])('falls back to Desk for malformed overlay data %j', (state) => {
    window.sessionStorage.setItem('patina:paper-origin:v1', JSON.stringify([
      { docId: DOC, path: '/people', kind: 'studio-overlay', ...state },
    ]));
    expect(readPaperOrigin(DOC)).toMatchObject({ kind: 'deep-link', path: '/desk' });
  });

  it('clears only the consumed job origin, leaving other jobs intact', () => {
    rememberPaperOrigin(DOC, { path: '/desk', studioOverlay: { overlay: 'post' } });
    rememberPaperOrigin('other', { path: '/library' });
    clearPaperOrigin(DOC);
    expect(readPaperOrigin(DOC).kind).toBe('deep-link');
    expect(readPaperOrigin('other').kind).toBe('library');
  });

  it("clears", () => {
    rememberPaperOrigin(DOC, { path: "/library" });
    clearPaperOrigin();
    expect(readPaperOrigin(DOC).kind).toBe("deep-link");
  });
});

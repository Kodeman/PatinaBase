import { captureReturnContext } from "../paper/return-context";
import { libraryHref, parseLibraryAddress, rememberLibraryReturn, restoreLibraryReturn, takeLibraryReturn } from "../library-return";

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/library");
  window.sessionStorage.clear();
  jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  jest.spyOn(window, "scrollBy").mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it("parses all shelf/capability combinations and preserves the exact query", () => {
  for (const shelf of ["all", "personal", "studio", "catalog"]) {
    for (const capability of ["all", "standard", "variant", "configured", "modular", "custom"]) {
      const params = new URLSearchParams({ shelf, capability, q: " oak & linen + " });
      expect(parseLibraryAddress(params)).toEqual({ shelf, capability, q: " oak & linen + " });
      expect(parseLibraryAddress(new URL(libraryHref(params), location.origin).searchParams)).toEqual(parseLibraryAddress(params));
    }
  }
});
it("defaults absent or invalid filters without dropping placement origin", () => {
  expect(parseLibraryAddress(new URLSearchParams("shelf=other&capability=other"))).toEqual({ shelf: "all", capability: "all", q: "" });
  expect(libraryHref(new URLSearchParams())).toBe("/library");
  expect(libraryHref(new URLSearchParams("projectId=job&returnTo=%2Fdoc%2Fjob&q=oak"), { shelf: "studio", capability: "modular", q: "" })).toBe("/library?projectId=job&returnTo=%2Fdoc%2Fjob&shelf=studio&capability=modular");
});
function opener() {
  const link = document.createElement("a");
  link.id = "library-piece-1-reference";
  link.href = "/library/1";
  document.body.append(link);
  return link;
}
it("retains a matching session return across repeated traversals and mismatched visits", () => {
  const link = opener();
  rememberLibraryReturn(link);
  expect(takeLibraryReturn()?.initiatingControlId).toBe(link.id);
  expect(takeLibraryReturn()?.initiatingControlId).toBe(link.id);
  rememberLibraryReturn(link);
  window.history.replaceState({}, "", "/library?shelf=studio");
  expect(takeLibraryReturn()).toBeNull();
  window.history.replaceState({}, "", "/library");
  expect(takeLibraryReturn()?.initiatingControlId).toBe(link.id);
});
it("retains a normal inspection for thirty minutes then expires", () => {
  const link = opener();
  rememberLibraryReturn(link);
  jest.advanceTimersByTime(120001);
  expect(takeLibraryReturn()?.initiatingControlId).toBe(link.id);
  jest.advanceTimersByTime(30 * 60_000 - 120001 + 1);
  expect(takeLibraryReturn()).toBeNull();
});
it("restores a late opener with native focus and scroll only once", () => {
  const link = opener();
  const context = captureReturnContext({ documentId: "library" }, link);
  link.remove();
  const cancel = restoreLibraryReturn(context);
  jest.advanceTimersByTime(32);
  document.body.append(link);
  jest.spyOn(link, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  jest.advanceTimersByTime(32);
  expect(link).toHaveFocus();
  expect(window.scrollBy).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1000);
  expect(link).toHaveFocus();
  cancel();
});
it.each(["pointerdown", "touchmove", "wheel", "keydown"])("cancels a late opener restore on reader %s", (event) => {
  const link = opener();
  const context = captureReturnContext({ documentId: "library" }, link);
  link.remove();
  restoreLibraryReturn(context);
  window.dispatchEvent(new Event(event));
  document.body.append(link);
  jest.spyOn(link, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  jest.advanceTimersByTime(4000);
  expect(link).not.toHaveFocus();
  expect(window.scrollTo).not.toHaveBeenCalled();
});
it("ignores router scroll and focus before a late opener commits", () => {
  const link = opener();
  const context = captureReturnContext({ documentId: "library" }, link);
  link.remove();
  restoreLibraryReturn(context);
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("focusin"));
  document.body.append(link);
  jest.spyOn(link, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  jest.advanceTimersByTime(32);
  expect(link).toHaveFocus();
});
it("follows a late layout shift until reader input cancels the anchor", () => {
  const link = opener();
  let top = 100;
  jest.spyOn(link, "getBoundingClientRect").mockImplementation(() => ({ top }) as DOMRect);
  jest.spyOn(link, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  const context = captureReturnContext({ documentId: "library" }, link);
  restoreLibraryReturn(context);
  jest.advanceTimersByTime(16);
  top = 900;
  jest.advanceTimersByTime(16);
  expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 800, behavior: "auto" });
  jest.mocked(window.scrollBy).mockClear();
  window.dispatchEvent(new Event("wheel"));
  top = 1000;
  jest.advanceTimersByTime(4000);
  expect(window.scrollBy).not.toHaveBeenCalled();
});
it("stops waiting at the deadline without moving the reader", () => {
  const link = opener();
  const context = captureReturnContext({ documentId: "library" }, link);
  link.remove();
  restoreLibraryReturn(context, 50);
  jest.advanceTimersByTime(80);
  document.body.append(link);
  jest.spyOn(link, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  jest.advanceTimersByTime(1000);
  expect(link).not.toHaveFocus();
});

it("starts the restore deadline only after native reads settle", () => {
  const link = opener();
  const context = captureReturnContext({ documentId: "library" }, link);
  link.remove();
  let settled = false;
  const cancel = restoreLibraryReturn(context, 50, () => settled);
  jest.advanceTimersByTime(4000);
  settled = true;
  document.body.append(link);
  jest.spyOn(link, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  jest.advanceTimersByTime(32);
  expect(link).toHaveFocus();
  cancel();
});
it.each(["removed", "inaccessible"])("uses the shared heading fallback for a %s opener", (state) => {
  const link = opener();
  const context = captureReturnContext({ documentId: "library", chapter: "library" }, link);
  if (state === "removed") link.remove();
  else link.setAttribute("aria-disabled", "true");
  const section = document.createElement("section");
  section.setAttribute("data-paper-chapter", "library");
  const heading = document.createElement("h2");
  heading.textContent = "Personal library";
  section.append(heading);
  document.body.append(section);
  restoreLibraryReturn(context, 50);
  jest.advanceTimersByTime(80);
  expect(heading).toHaveFocus();
});
it("new captures replace the retained opener and expansion", () => {
  const first = opener();
  rememberLibraryReturn(first);
  const next = opener();
  next.id = "library-piece-2-reference";
  const fold = document.createElement("button");
  fold.setAttribute("aria-controls", "library-shelf-panel-plates");
  fold.setAttribute("aria-expanded", "true");
  document.body.append(fold);
  rememberLibraryReturn(next);
  expect(takeLibraryReturn()).toMatchObject({ initiatingControlId: next.id, filters: { expanded: "true" } });
  expect(takeLibraryReturn()?.initiatingControlId).toBe(next.id);
});

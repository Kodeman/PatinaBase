import { landingLift, landSection } from "../land-section";

// SQ-544 / walk D6 — 390×844, the dock's top at 751 (a 93px bar published as
// `scroll-padding-bottom`), the band's clearance 72px.
const WALK = {
  scrollY: 0,
  viewportHeight: 844,
  sectionClearTop: 72,
  targetClearTop: 72,
  clearBottom: 93,
};

describe("landingLift", () => {
  it("lifts the Brief landing so Accept · begin rests clear of the dock", () => {
    // Section start would put the control at 740–784, under the dock's 751.
    const top = landingLift({
      ...WALK,
      sectionTop: 300,
      targetTop: 968,
      targetBottom: 1012,
    });
    expect(top).toBe(261);
    const shift = 300 - 72;
    const restedBottom = 1012 - (top! - shift) - shift;
    expect(restedBottom).toBeLessThanOrEqual(844 - 93);
  });

  it("keeps the plain section start when the control already clears the dock", () => {
    // Halloran's PO at y 523 once the section rests.
    expect(
      landingLift({
        ...WALK,
        sectionTop: 300,
        targetTop: 751,
        targetBottom: 795,
      }),
    ).toBeNull();
  });

  it("never carries the control under the band", () => {
    // A control taller than the room between band and dock keeps its top clear.
    const top = landingLift({
      ...WALK,
      sectionTop: 72,
      targetTop: 600,
      targetBottom: 1500,
    });
    expect(top).toBe(600 - 72);
  });
});

describe("landSection", () => {
  const realGetComputedStyle = window.getComputedStyle;
  let scrollTo: jest.Mock;

  function rect(top: number, bottom: number): DOMRect {
    return {
      top,
      bottom,
      left: 0,
      right: 390,
      width: 390,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  function mount(targetTop: number, targetBottom: number) {
    const section = document.createElement("section");
    const target = document.createElement("button");
    section.appendChild(target);
    document.body.appendChild(section);
    section.getBoundingClientRect = () => rect(300, 1400);
    target.getBoundingClientRect = () => rect(targetTop, targetBottom);
    section.scrollIntoView = jest.fn();
    return { section, target };
  }

  beforeEach(() => {
    scrollTo = jest.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    // jsdom does not compute scroll-padding or scroll-margin; stand in the
    // values globals.css declares at 390.
    jest.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      const style = realGetComputedStyle(el);
      const values: Record<string, string> =
        el === document.documentElement
          ? { scrollPaddingBottom: "93px", scrollPaddingTop: "auto" }
          : { scrollMarginTop: "72px" };
      return new Proxy(style, {
        get: (t, key) =>
          typeof key === "string" && key in values
            ? values[key]
            : Reflect.get(t, key),
      });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("scrolls the window past the section start when the focused control would rest under the dock", () => {
    const { section, target } = mount(968, 1012);
    landSection(section, target, "auto");
    expect(scrollTo).toHaveBeenCalledWith({ top: 261, behavior: "auto" });
    expect(section.scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps block: start when the control already clears the dock", () => {
    const { section, target } = mount(500, 544);
    landSection(section, target, "smooth");
    expect(section.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps block: start for a landing on the section itself", () => {
    const { section } = mount(968, 1012);
    landSection(section, section, "auto");
    expect(section.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

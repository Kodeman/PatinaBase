import { classifyRole, measurePixelSignals } from "../classify-role";
import {
  extractDimensions,
  extractFields,
  extractPriceCents,
  extractSku,
  parsePriceToCents,
  vendorFromUrl,
} from "../fields";
import {
  classifyLink,
  findBareUrls,
  isAttributionText,
  matchOverlay,
  normalizeUrl,
} from "../links";

describe("fields", () => {
  it("parses prices to cents", () => {
    expect(parsePriceToCents("$1,150.00")).toBe(115000);
    expect(parsePriceToCents(42)).toBe(4200);
    expect(parsePriceToCents("n/a")).toBeNull();
  });

  it("takes a price only when the caption names exactly one", () => {
    expect(extractPriceCents("Walnut Console $3,400")).toBe(340000);
    expect(extractPriceCents("was $500 now $400")).toBeNull();
  });

  it("reads labelled SKUs that contain a digit", () => {
    expect(extractSku("SKU: CC-1042")).toBe("CC-1042");
    expect(extractSku("Item #: ABCDEF")).toBeNull();
  });

  it("reads WxDxH dimensions", () => {
    expect(extractDimensions('84"W x 38"D x 30"H')).toMatchObject({
      width: 84,
      depth: 38,
      height: 30,
      unit: "in",
    });
  });

  it("maps retailer hosts and lets a maker label win", () => {
    expect(vendorFromUrl("https://www.cb2.com/x")).toBe("CB2");
    expect(vendorFromUrl("https://unknown-shop.example/x")).toBeNull();
    expect(
      extractFields("Harbor Sofa\nMaker: Lawson-Fenning", [
        "https://www.rh.com/a",
      ]).vendor,
    ).toBe("Lawson-Fenning");
  });
});

describe("links", () => {
  it("normalises bare and www URLs", () => {
    expect(normalizeUrl("www.chairish.com/item/99")).toBe(
      "https://www.chairish.com/item/99",
    );
    const found = findBareUrls("see bit.ly/3xSconce and https://a.com/b.");
    expect(found).toHaveLength(2);
    expect(found).toEqual(
      expect.arrayContaining(["https://a.com/b", "https://bit.ly/3xSconce"]),
    );
  });

  it("denies actions, non-http schemes and licence hosts", () => {
    expect(
      classifyLink({
        target: null,
        action: "ppaction://hlinkshowjump?jump=nextslide",
        external: false,
      }),
    ).toBeNull();
    expect(
      classifyLink({ target: "mailto:a@b.co", action: null, external: true }),
    ).toMatchObject({ ok: false, reason: "link_denied" });
    expect(
      classifyLink({
        target: "https://unsplash.com/photos/1",
        action: null,
        external: true,
      }),
    ).toMatchObject({ ok: false, reason: "link_denied" });
    expect(
      classifyLink({
        target: "https://www.cb2.com/x",
        action: null,
        external: true,
      }),
    ).toEqual({ ok: true, url: "https://www.cb2.com/x" });
    expect(
      isAttributionText(
        "This Photo by Unknown Author is licensed under CC BY-SA",
      ),
    ).toBe(true);
  });

  it("matches an overlay to one picture, abstaining when two overlap alike", () => {
    const pic = (key: string, x: number) => ({
      key,
      kind: "picture" as const,
      aabb: { x, y: 0, w: 100, h: 100 },
    });
    expect(
      matchOverlay({ aabb: { x: 10, y: 10, w: 50, h: 50 } }, [
        pic("a", 0),
        pic("b", 500),
      ]),
    ).toMatchObject({ picture: "a" });
    expect(
      matchOverlay({ aabb: { x: 75, y: 0, w: 50, h: 50 } }, [
        pic("a", 0),
        pic("b", 100),
      ]),
    ).toEqual({ picture: null, reason: "ambiguous" });
    expect(
      matchOverlay({ aabb: { x: 300, y: 300, w: 10, h: 10 } }, [pic("a", 0)]),
    ).toEqual({ picture: null, reason: "none" });
  });
});

describe("classifyRole", () => {
  const base = {
    kind: "picture" as const,
    hasLink: false,
    extracted: {},
    hasCaption: false,
  };
  it("ranks backgrounds, links and prices, then size bands", () => {
    expect(
      classifyRole({
        ...base,
        kind: "background",
        areaFraction: 1,
        hasLink: true,
      }),
    ).toBe("background");
    expect(classifyRole({ ...base, areaFraction: 0.001, hasLink: true })).toBe(
      "product",
    );
    expect(classifyRole({ ...base, areaFraction: 0.001 })).toBe("decoration");
    expect(classifyRole({ ...base, areaFraction: 0.005 })).toBe("logo");
    expect(classifyRole({ ...base, areaFraction: 0.013 })).toBe("reference");
    expect(
      classifyRole({ ...base, areaFraction: 0.2, extracted: { sku: "A1" } }),
    ).toBe("product");
  });

  it("treats a cut-out on a uniform border as a product", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    rgba[4 * 5 + 3] = 0;
    const pixels = measurePixelSignals(rgba, 4, 4);
    expect(pixels).toEqual({ hasAlpha: true, borderUniformity: 1 });
    expect(classifyRole({ ...base, areaFraction: 0.2, pixels })).toBe(
      "product",
    );
    expect(classifyRole({ ...base, areaFraction: 0.2 })).toBe("reference");
  });
});

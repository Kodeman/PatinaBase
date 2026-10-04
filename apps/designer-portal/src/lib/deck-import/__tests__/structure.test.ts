import { fixtureBytes, truth } from "../__fixtures__/load";
import type { DeckManifest, ManifestElement } from "../manifest";
import { manifestMediaParts } from "../manifest";
import { parseDeck } from "../parse-deck";

const T = truth.structure;
let manifest: DeckManifest;
const el = (name: keyof typeof T.elements): ManifestElement => {
  const found = manifest.elements.find(
    (e) => e.element_key === T.elements[name].key,
  );
  if (!found) throw new Error(`no element ${name} (${T.elements[name].key})`);
  return found;
};
const box = (e: ManifestElement) => [e.bbox.x, e.bbox.y, e.bbox.w, e.bbox.h];
const expectBox = (e: ManifestElement, expected: number[]) =>
  box(e).forEach((v, i) =>
    expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(1),
  );

beforeAll(async () => {
  ({ manifest } = await parseDeck(
    "structure.pptx",
    fixtureBytes("structure.pptx"),
  ));
});

describe("structure.pptx", () => {
  it("follows sldIdLst order, not part numbering", () => {
    expect(manifest.slides.map((s) => s.part)).toEqual(T.order);
    expect(manifest.slides.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect([manifest.slide_size.cx, manifest.slide_size.cy]).toEqual(
      T.slide_size,
    );
    for (const e of manifest.elements)
      expect(manifest.slides[e.slide_index].part).toBe(
        e.element_key.split("#")[0],
      );
  });

  it("composes nested group transforms (scale ⊃ rotation) within ±1 EMU", () => {
    const e = el("nested_rot");
    expectBox(e, [2250000, 1250000, 1000000, 500000]);
    expect(e.rot).toBe(90);
    expect(e.group_path).toEqual(T.elements.nested_rot.groups!.map(String));
  });

  it("folds a flipH group into the child rotation and flip", () => {
    const e = el("flipped_group");
    expectBox(e, [8500000, 1500000, 1000000, 1000000]);
    expect(e.rot).toBe(330);
    expect(e.flip_h).toBe(true);
    expect(e.flip_v).toBe(false);
  });

  it("keeps a picture flipV", () => {
    expect(el("flip_v").flip_v).toBe(true);
    expect(el("flip_v").flip_h).toBe(false);
  });

  it("reads srcRect crops, including negative padding", () => {
    const [l, t, r, b] = T.elements.neg_crop.src_rect!;
    expect(el("neg_crop").src_rect).toEqual({ l, t, r, b });
    const [pl, pt, pr, pb] = T.elements.pos_crop.src_rect!;
    expect(el("pos_crop").src_rect).toEqual({ l: pl, t: pt, r: pr, b: pb });
  });

  it("takes a picture fill on a shape with its shape hyperlink", () => {
    const e = el("picture_fill");
    expect(e.kind).toBe("picture_fill");
    expect(e.src_rect).toEqual({ l: 0.1, t: 0, r: 0.1, b: 0 });
    expect(e.links).toEqual([
      { url: "https://www.hay.dk/products/rounded-tray", source: "picture" },
    ]);
    expect(e.role).toBe("product");
  });

  it("pairs table image cells with the text and links of their row", () => {
    const r0 = el("table_r0");
    expect(r0.kind).toBe("table_cell");
    expect(r0.association).toBe("table_row");
    expect(r0.links).toEqual([
      { url: "https://www.hay.dk/stool", source: "table_row" },
    ]);
    expect(r0.extracted).toMatchObject({
      name: "Oak Stool",
      price_cents: 45000,
    });
    const r1 = el("table_r1");
    expect(r1.links.map((l) => l.url)).toEqual([
      "https://example-lamps.com/linen",
    ]);
    expect(r1.extracted).toMatchObject({
      name: "Linen Lamp",
      price_cents: 120000,
    });
  });

  it("walks only the AlternateContent Choice branch", () => {
    const slide3 = manifest.elements.filter((e) =>
      e.element_key.startsWith("ppt/slides/slide3.xml#"),
    );
    expect(
      slide3.filter((e) => e.element_key === T.elements.alternate_choice.key),
    ).toHaveLength(1);
    // Only Choice, SVG, wdp, remote and background survive; the Fallback picture never appears.
    expect(slide3.map((e) => e.element_key).sort()).toEqual(
      [
        T.elements.alternate_choice.key,
        T.elements.svg_fallback.key,
        T.elements.wdp_auto_alt.key,
        T.elements.remote_http.key,
        T.elements.background.key,
      ].sort(),
    );
  });

  it("uses the PNG embed for SVG pictures and ignores HD Photo layers", () => {
    expect(el("svg_fallback").media_type).toBe("image/png");
    const wdp = el("wdp_auto_alt");
    expect(wdp.media).not.toMatch(/\.wdp$/);
    expect(wdp.alt_auto).toBe(true);
    expect(
      manifestMediaParts(manifest).every(
        (p) => !/\.(svg|wdp|emf|wmf|tiff?)$/i.test(p),
      ),
    ).toBe(true);
  });

  it("keeps http r:link pictures as remote_url and skips file: links and unsupported formats", () => {
    const remote = el("remote_http");
    expect(remote.media).toBeNull();
    expect(remote.remote_url).toBe(T.elements.remote_http.remote_url);
    const reasons = Object.fromEntries(
      manifest.skipped.map((s) => [s.element_key, s.reason]),
    );
    expect(reasons[T.skipped.remote_file]).toBe("linked_image_unsupported");
    expect(reasons[T.skipped.emf]).toBe("unsupported_format");
    expect(reasons[T.skipped.wmf]).toBe("unsupported_format");
    expect(reasons[T.skipped.tiff]).toBe("unsupported_format");
  });

  it("marks the slide background picture as a background", () => {
    const bg = el("background");
    expect(bg.kind).toBe("background");
    expect(bg.role).toBe("background");
    expectBox(bg, [0, 0, ...T.slide_size]);
  });

  it("inherits placeholder geometry from the layout, then the master", () => {
    const layout = el("layout_placeholder");
    expectBox(layout, T.elements.layout_placeholder.bbox!);
    const [l, t, r, b] = T.elements.layout_placeholder.src_rect!;
    expect(layout.src_rect).toEqual({ l, t, r, b });
    expectBox(el("master_placeholder"), T.elements.master_placeholder.bbox!);
    expect(manifest.slides[4].title).toBe(T.slide4_title);
    expect(manifest.slides[4].section_name).toBe(T.slide4_title);
  });

  it("names untitled slides by number and keeps a 10%-wide thumbnail off the logo band", () => {
    expect(manifest.slides[0].section_name).toBe("Slide 1");
    expect(el("alternate_choice").role).toBe("reference");
  });
});

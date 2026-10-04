import { fixtureBytes, truth } from "../__fixtures__/load";
import {
  DECK_CROP_MAX_EDGE,
  MAX_DECODED_PIXELS,
  cropDeckElements,
  planCrop,
  readImageSize,
  type CropPlan,
  type DeckImageCodec,
} from "../crop";
import { DECK_BOARD_WIDTH, DECK_SLIDE_GUTTER, layoutDeck } from "../layout";
import type { DeckManifest, ManifestElement } from "../manifest";
import { parseDeck } from "../parse-deck";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48,
    0x44, 0x52,
  ]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe("planCrop", () => {
  it("crops a positive srcRect to the visible region at its pixel density", () => {
    const plan = planCrop(1000, 800, { l: 0.25, t: 0.1, r: 0, b: 0.2 })!;
    expect([plan.sx, plan.sy, plan.sw, plan.sh]).toEqual([250, 80, 750, 560]);
    expect([plan.canvasWidth, plan.canvasHeight]).toEqual([750, 560]);
    expect([plan.dx, plan.dy, plan.dw, plan.dh]).toEqual([0, 0, 750, 560]);
  });

  it("turns a negative srcRect into transparent padding around the whole image", () => {
    const plan = planCrop(1000, 500, { l: -0.1, t: 0, r: -0.1, b: 0 })!;
    expect([plan.sx, plan.sy, plan.sw, plan.sh]).toEqual([0, 0, 1000, 500]);
    expect([plan.canvasWidth, plan.canvasHeight]).toEqual([1200, 500]);
    expect(plan.dx).toBeCloseTo(100);
    expect(plan.dw).toBeCloseTo(1000);
  });

  it("stretches to the frame aspect and caps the long edge at 2048 px", () => {
    const plan = planCrop(6000, 3000, null, { w: 2, h: 2 })!;
    expect(DECK_CROP_MAX_EDGE).toBe(2048);
    expect([plan.canvasWidth, plan.canvasHeight]).toEqual([2048, 2048]);
    expect(plan.dw).toBeCloseTo(2048);
    expect(plan.dh).toBeCloseTo(2048);
  });

  it("returns null for an empty or fully off-image region", () => {
    expect(planCrop(100, 100, { l: 0.6, t: 0, r: 0.6, b: 0 })).toBeNull();
    expect(planCrop(100, 100, { l: 1.2, t: 0, r: -1.4, b: 0 })).toBeNull();
  });

  it("carries flips into the plan", () => {
    expect(planCrop(10, 10, null, null, { flipH: true })).toMatchObject({
      flipH: true,
      flipV: false,
    });
  });
});

describe("readImageSize", () => {
  it("reads PNG headers, including the fixture media", async () => {
    expect(readImageSize(png(640, 480))).toEqual({ width: 640, height: 480 });
    const { manifest, reader } = await parseDeck(
      "keynote-2x.ppsx",
      fixtureBytes("keynote-2x.ppsx"),
    );
    const part = manifest.elements[0].media!;
    const size = readImageSize((await reader.read([part])).get(part)!);
    expect(size!.width).toBeGreaterThan(0);
  });

  it("reads JPEG, GIF and BMP headers and refuses unknown bytes", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0x2c,
      0x02, 0x58, 3, 0, 0, 0, 0,
    ]);
    expect(readImageSize(jpeg)).toEqual({ width: 600, height: 300 });
    expect(
      readImageSize(
        new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 20, 0]),
      ),
    ).toEqual({ width: 10, height: 20 });
    const bmp = new Uint8Array(26);
    bmp.set([0x42, 0x4d]);
    new DataView(bmp.buffer).setInt32(18, 7, true);
    new DataView(bmp.buffer).setInt32(22, -9, true);
    expect(readImageSize(bmp)).toEqual({ width: 7, height: 9 });
    expect(readImageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("cropDeckElements", () => {
  const element = (
    key: string,
    media: string | null,
    extra: Partial<ManifestElement> = {},
  ) =>
    ({
      element_key: key,
      media,
      media_type: "image/png",
      src_rect: null,
      bbox: { x: 0, y: 0, w: 4, h: 3 },
      flip_h: false,
      flip_v: false,
      ...extra,
    }) as ManifestElement;

  it("decodes each media part once, crops every user and enforces the decode guard", async () => {
    const decoded: string[] = [];
    const plans: CropPlan[] = [];
    let closed = 0;
    const codec: DeckImageCodec = {
      async decode(bytes) {
        const size = readImageSize(bytes)!;
        decoded.push(`${size.width}x${size.height}`);
        return { ...size, source: null, close: () => (closed += 1) };
      },
      async render(_image, plan) {
        plans.push(plan);
        return new Blob(["x"], { type: "image/webp" });
      },
    };
    const media = new Map([
      ["a.png", png(400, 300)],
      ["huge.png", png(8000, 4001)],
    ]);
    expect(8000 * 4001).toBeGreaterThan(MAX_DECODED_PIXELS);
    const results = await cropDeckElements(
      {
        elements: [
          element("one", "a.png"),
          element("two", "a.png", {
            flip_v: true,
            src_rect: { l: 0, t: 0, r: 0.5, b: 0 },
          }),
          element("big", "huge.png"),
          element("gone", "missing.png"),
          element("remote", null),
        ],
      },
      media,
      codec,
    );
    expect(decoded).toEqual(["400x300"]);
    expect(closed).toBe(1);
    expect(media.size).toBe(0);
    const byKey = Object.fromEntries(results.map((r) => [r.element_key, r]));
    expect(byKey.one).toMatchObject({ ok: true, width: 400, height: 300 });
    // A 200×300 region stretched into the 4:3 frame keeps its height density.
    expect(byKey.two).toMatchObject({ ok: true, width: 400, height: 300 });
    expect(plans[1]).toMatchObject({ sw: 200, dw: 400, flipV: true });
    expect(byKey.big).toEqual({
      element_key: "big",
      ok: false,
      reason: "image_too_large",
    });
    expect(byKey.gone).toEqual({
      element_key: "gone",
      ok: false,
      reason: "missing_media",
    });
    expect(byKey.remote).toBeUndefined();
  });
});

describe("layoutDeck", () => {
  let manifest: DeckManifest;
  beforeAll(async () => {
    ({ manifest } = await parseDeck(
      "keynote-2x.ppsx",
      fixtureBytes("keynote-2x.ppsx"),
    ));
  });

  it("scales a 2× Keynote export to the 1200-unit board within ±1 unit", () => {
    let n = 0;
    const layout = layoutDeck(manifest, { newId: () => `id${(n += 1)}` });
    const scale = DECK_BOARD_WIDTH / truth.keynote.slide_size[0];
    const eames = layout.items.find(
      (i) => layout.itemIds.get(truth.keynote.eames) === i.id,
    )!;
    const expected = [2000000, 2000000, 8000000, 6000000].map((v) => v * scale);
    [eames.x, eames.y, eames.width, eames.height].forEach((v, i) =>
      expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(1),
    );
    expect(eames.rotation).toBe(15);
    expect(eames.data).toMatchObject({
      image_provenance: "imported_deck",
      source_url: "https://www.dwr.com/eames",
      vendor_name: "Design Within Reach",
      deck_import: {
        slide_index: 0,
        element_ref: truth.keynote.eames,
        role: "product",
        deck_sha256: manifest.deck_sha256,
      },
    });
    const second = layout.items.find(
      (i) => layout.itemIds.get(truth.keynote.second) === i.id,
    )!;
    const slideHeight = truth.keynote.slide_size[1] * scale;
    expect(
      Math.abs(second.y - (slideHeight + DECK_SLIDE_GUTTER + 1000000 * scale)),
    ).toBeLessThanOrEqual(1);
    expect(layout.sections.map((s) => s.name)).toEqual(["Slide 1", "Slide 2"]);
    expect(eames.data.section_id).toBe(layout.sections[0].id);
    expect(second.zIndex).toBeGreaterThan(eames.zIndex);
    expect(layout.height).toBeCloseTo(2 * slideHeight + DECK_SLIDE_GUTTER, 5);
  });

  it("pins only the chosen roles and drops empty slides", async () => {
    const { manifest: structure } = await parseDeck(
      "structure.pptx",
      fixtureBytes("structure.pptx"),
    );
    const layout = layoutDeck(structure, { roles: ["product"] });
    const pinned = [...layout.itemIds.keys()];
    expect(
      pinned.every(
        (k) =>
          structure.elements.find((e) => e.element_key === k)!.role ===
          "product",
      ),
    ).toBe(true);
    expect(layout.sections).toHaveLength(
      new Set(pinned.map((k) => k.split("#")[0])).size,
    );
    expect(
      layoutDeck(structure).items.some(
        (i) => i.data.deck_import?.role === "background",
      ),
    ).toBe(false);
  });
});

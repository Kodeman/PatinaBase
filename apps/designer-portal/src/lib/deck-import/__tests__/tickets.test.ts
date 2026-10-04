import { fixtureBytes, truth } from "../__fixtures__/load";
import type { DeckManifest, ManifestElement, ManifestSlide } from "../manifest";
import { itemExtracted } from "../manifest";
import { parseDeck } from "../parse-deck";

const T = truth.tickets;
let manifest: DeckManifest;
const el = (name: string): ManifestElement => {
  const found = manifest.elements.find(
    (e) => e.element_key === T.elements[name],
  );
  if (!found) throw new Error(`no element ${name}`);
  return found;
};
const slide = (name: string): ManifestSlide =>
  manifest.slides.find((s) => s.part === T.slides[name])!;
const urls = (e: ManifestElement) => e.links.map((l) => l.url);

beforeAll(async () => {
  ({ manifest } = await parseDeck(
    "tickets.pptx",
    fixtureBytes("tickets.pptx"),
  ));
});

describe("tickets.pptx: caption and link pairing", () => {
  it("pairs a ticket beside one picture and below another, and extracts its fields", () => {
    const sofa = el("sofa");
    expect(sofa.association).toBe("caption_side");
    expect(urls(sofa)).toEqual(["https://www.rh.com/harbor-sofa"]);
    expect(sofa.extracted).toEqual({
      name: "Harbor Sofa",
      price_cents: 420000,
      dims: {
        unit: "in",
        raw: '84"W x 38"D x 30"H',
        width: 84,
        depth: 38,
        height: 30,
      },
      vendor: "Lawson-Fenning",
    });
    const chair = el("cane_chair");
    expect(chair.association).toBe("caption_below");
    // "Shop" display text: the URL lives only on the hyperlink.
    expect(urls(chair)).toEqual(["https://www.cb2.com/cane-chair"]);
    expect(chair.extracted).toEqual({
      name: "Cane Chair",
      price_cents: 115000,
      sku: "CC-1042",
      vendor: "CB2",
    });
    expect(slide("beside_below").needs_adjudication).toBe(false);
    expect(slide("beside_below").association_margin!).toBeGreaterThanOrEqual(
      0.15,
    );
  });

  it("keeps a table-row ticket and both URLs of a two-link ticket (bit.ly included)", () => {
    const console_ = el("console");
    expect(console_.caption).toContain("Walnut Console");
    expect(urls(console_)).toEqual(["https://studiodunn.com/console"]);
    expect(urls(el("sconce"))).toEqual([
      "https://www.lumens.com/brass-sconce",
      "https://bit.ly/3xSconce",
    ]);
  });

  it("pairs an overlay link, a grouped text ticket and a shared group", () => {
    expect(el("rug").links).toEqual([
      { url: "https://www.westelm.com/overlay-rug", source: "overlay" },
    ]);
    const bench = el("bench");
    expect(bench.caption).toBe("Rattan Bench\n$890");
    expect(bench.caption_keys).toHaveLength(2);
    expect(bench.extracted).toMatchObject({
      name: "Rattan Bench",
      price_cents: 89000,
    });
    const pouf = el("pouf");
    expect(pouf.association).toBe("group");
    expect(pouf.margin).toBe(1);
    expect(pouf.extracted).toMatchObject({
      name: "Moss Pouf",
      price_cents: 38000,
    });
  });

  it("pairs every picture of a 2×3 grid with its own caption", () => {
    for (let i = 0; i < 6; i += 1) {
      const e = el(`grid_${i}`);
      expect(e.association).toBe("caption_below");
      expect(e.extracted).toMatchObject({
        name: `Grid Item ${i + 1}`,
        price_cents: (i + 1) * 10000,
      });
    }
  });

  it("abstains on an ambiguous caption and keeps its link as unpaired", () => {
    expect(el("amb_left").caption).toBeNull();
    expect(el("amb_right").caption).toBeNull();
    expect(el("amb_left").links).toEqual([]);
    const s = slide("ambiguous");
    expect(s.needs_adjudication).toBe(true);
    expect(s.unpaired_links).toEqual([
      {
        url: "https://www.article.com/side-table",
        text_context: expect.stringContaining("article.com"),
        source: "text",
      },
    ]);
  });

  it("binds numbered markers to a legend on the same slide", () => {
    const expected = [
      "https://www.flos.com/arc",
      "https://www.article.com/linen-sofa",
      "https://www.wayfair.com/jute",
    ];
    expected.forEach((url, i) => {
      const e = el(`legend_${i + 1}`);
      expect(e.association).toBe("legend");
      expect(e.legend_number).toBe(i + 1);
      expect(e.links).toEqual([{ url, source: "legend" }]);
    });
    expect(el("legend_2").extracted.price_cents).toBe(510000);
  });

  it("binds numbered markers to a separate shopping-list slide", () => {
    expect(el("shop_1").links).toEqual([
      { url: "https://www.rejuvenation.com/side-table", source: "legend" },
    ]);
    expect(el("shop_2").links).toEqual([
      { url: "https://www.schoolhouse.com/throw", source: "legend" },
    ]);
    expect(el("shop_1").caption_keys[0]).toMatch(/^ppt\/slides\/slide8\.xml#/);
    expect(slide("shopping_list").unpaired_links).toEqual([]);
    expect(
      manifest.deck_links.some((l) => l.url.includes("rejuvenation")),
    ).toBe(false);
  });

  it("keeps notes URLs unpaired, and denies attribution, mailto, licence hosts, actions and hover links", () => {
    expect(el("h_chair").links).toEqual([]);
    const s = slide("notes_denied");
    expect(s.unpaired_links.map((l) => [l.url, l.source])).toEqual([
      ["https://www.burkedecor.com/h-chair", "notes"],
      ["https://www.chairish.com/item/99", "notes"],
    ]);
    const skipped = manifest.skipped
      .filter((k) => k.slide_index === s.index)
      .map((k) => k.reason);
    expect(skipped).toEqual(
      expect.arrayContaining(["attribution_link", "link_denied"]),
    );
    expect(
      manifest.skipped.find(
        (k) => k.reason === "link_denied" && k.detail === "mailto",
      ),
    ).toBeDefined();
    expect(
      manifest.skipped.find(
        (k) => k.reason === "link_denied" && k.detail === "unsplash.com",
      ),
    ).toBeDefined();
    expect(JSON.stringify(manifest)).not.toContain("hover-only");
    expect(JSON.stringify(manifest)).not.toContain("ppaction");
    expect(s.texts.find((t) => t.text.startsWith("This Photo"))?.role).toBe(
      "attribution",
    );
  });

  it("routes links on picture-less slides to deck_links", () => {
    const s = slide("no_pictures");
    expect(s.unpaired_links).toEqual([]);
    expect(manifest.deck_links).toEqual([
      {
        url: "https://www.pinterest.com/board/1",
        text_context: "Mood: https://www.pinterest.com/board/1",
        source: "text",
        slide_index: s.index,
      },
      {
        url: "https://www.1stdibs.com/x",
        text_context: "More at https://www.1stdibs.com/x",
        source: "notes",
        slide_index: s.index,
      },
    ]);
  });

  it("never drops a link: every harvested URL is paired, unpaired, a deck link or skipped", () => {
    const placed = new Set<string>([
      ...manifest.elements.flatMap(urls),
      ...manifest.slides.flatMap((s) => s.unpaired_links.map((l) => l.url)),
      ...manifest.deck_links.map((l) => l.url),
    ]);
    for (const s of manifest.slides)
      for (const t of s.texts)
        for (const url of t.links) expect(placed).toContain(url);
    expect(manifest.stats.unpaired_links).toBe(3);
    expect(manifest.stats.deck_links).toBe(2);
    expect(manifest.stats.slides_needing_adjudication).toBe(1);
  });
});

describe("tickets.pptx: resolver seam (itemExtracted)", () => {
  it("emits canonical links, caption and alt keys for a paired ticket", () => {
    const sofa = itemExtracted(manifest, el("sofa"));
    expect(sofa.links).toEqual([
      {
        url: "https://www.rh.com/harbor-sofa",
        source: "caption",
        on_picture: false,
      },
    ]);
    expect(sofa.caption).toMatchObject({
      name: "Harbor Sofa",
      vendor: "Lawson-Fenning",
      price_cents: 420000,
      text: expect.stringContaining("Harbor Sofa"),
    });
    // The filename default alt ("image.png") is not evidence.
    expect(sofa.alt_text).toBeNull();
    expect(sofa.needs_adjudication).toBe(false);
    expect(sofa.adjudication).toBeUndefined();
    expect(itemExtracted(manifest, el("rug")).links[0]).toMatchObject({
      source: "overlay",
      on_picture: true,
    });
  });

  it("hands abstained pictures to adjudication with the slide's free texts and unpaired links", () => {
    const left = itemExtracted(manifest, el("amb_left"));
    expect(left.needs_adjudication).toBe(true);
    expect(left.caption).toBeNull();
    expect(left.links).toEqual([]);
    expect(left.adjudication).toEqual({
      images: [{ key: T.elements.amb_left }, { key: T.elements.amb_right }],
      texts: [
        {
          key: "ppt/slides/slide5.xml#4",
          text: "Side Table\nhttps://www.article.com/side-table",
        },
      ],
      links: [
        {
          id: "link:0",
          url: "https://www.article.com/side-table",
          text_context: expect.any(String),
        },
      ],
    });
    expect(itemExtracted(manifest, el("amb_right")).adjudication).toEqual(
      left.adjudication,
    );
  });
});

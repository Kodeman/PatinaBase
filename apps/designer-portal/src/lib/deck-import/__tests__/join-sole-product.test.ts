import type { ManifestElement, UnpairedLink } from "../manifest";
import { joinSoleProduct } from "../parse-deck";

const element = (
  key: string,
  role: ManifestElement["role"],
  extra: Partial<ManifestElement> = {},
): ManifestElement =>
  ({
    element_key: key,
    slide_index: 10,
    role,
    links: [],
    caption: "Reading Chair",
    extracted: { name: "Reading Chair" },
    ...extra,
  }) as ManifestElement;

const notes: UnpairedLink = {
  url: "https://www.rh.com/reading-chair",
  text_context: "Chair: https://www.rh.com/reading-chair",
  source: "notes",
};
const bare: UnpairedLink = {
  url: "https://www.rh.com/side-table",
  text_context: "https://www.rh.com/side-table",
  source: "text",
};
const overlay: UnpairedLink = {
  url: "https://www.rh.com/rug",
  text_context: "Rug",
  source: "overlay",
};

describe("joinSoleProduct: notes and bare-text links join the slide's only product picture", () => {
  it("moves notes and bare-text links onto the sole product picture; an ambiguous overlay link stays", () => {
    const chair = element("s11#2", "product");
    const backdrop = element("s11#3", "reference", { caption: null });
    const left = joinSoleProduct([chair, backdrop], [notes, bare, overlay]);
    expect(left).toEqual([overlay]);
    expect(chair.links).toEqual([
      { url: notes.url, source: "notes" },
      { url: bare.url, source: "text" },
    ]);
    // The link host now names the maker, as it would for a link on the picture.
    expect(chair.extracted.vendor).toBe("Restoration Hardware");
    expect(backdrop.links).toEqual([]);
  });

  it("keeps the links unpaired when the slide has two product pictures, or none", () => {
    const a = element("s#1", "product");
    const b = element("s#2", "product");
    expect(joinSoleProduct([a, b], [notes])).toEqual([notes]);
    expect(a.links).toEqual([]);
    const ref = element("s#3", "reference");
    expect(joinSoleProduct([ref], [notes])).toEqual([notes]);
    expect(ref.links).toEqual([]);
  });

  it("never duplicates a link the picture already carries", () => {
    const chair = element("s#1", "product", {
      links: [{ url: notes.url, source: "caption" }],
    });
    expect(joinSoleProduct([chair], [notes])).toEqual([]);
    expect(chair.links).toEqual([{ url: notes.url, source: "caption" }]);
  });
});

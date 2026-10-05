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

  it("keeps the links unpaired when the slide has two product pictures", () => {
    const a = element("s#1", "product");
    const b = element("s#2", "product");
    expect(joinSoleProduct([a, b], [notes])).toEqual([notes]);
    expect(a.links).toEqual([]);
    expect(b.links).toEqual([]);
  });

  it("never duplicates a link the picture already carries", () => {
    const chair = element("s#1", "product", {
      links: [{ url: notes.url, source: "caption" }],
    });
    expect(joinSoleProduct([chair], [notes])).toEqual([]);
    expect(chair.links).toEqual([{ url: notes.url, source: "caption" }]);
  });
});

describe("joinSoleProduct: a slide whose only product signal is an unanchored link", () => {
  it("makes a sole reference picture the product carrying the notes link", () => {
    const chair = element("s11#2", "reference");
    expect(joinSoleProduct([chair], [notes])).toEqual([]);
    expect(chair.role).toBe("product");
    expect(chair.links).toEqual([{ url: notes.url, source: "notes" }]);
    expect(chair.extracted.vendor).toBe("Restoration Hardware");
  });

  it("makes a sole reference picture the product carrying a bare-text link", () => {
    const table = element("s#1", "reference");
    const logo = element("s#2", "logo", { caption: null });
    expect(joinSoleProduct([table, logo], [bare, overlay])).toEqual([overlay]);
    expect(table.role).toBe("product");
    expect(table.links).toEqual([{ url: bare.url, source: "text" }]);
    expect(logo.role).toBe("logo");
    expect(logo.links).toEqual([]);
  });

  it("leaves two reference pictures alone; the link stays unpaired", () => {
    const a = element("s#1", "reference");
    const b = element("s#2", "reference");
    expect(joinSoleProduct([a, b], [notes])).toEqual([notes]);
    expect([a.role, b.role]).toEqual(["reference", "reference"]);
    expect(a.links).toEqual([]);
    expect(b.links).toEqual([]);
  });

  it("never promotes a sole logo-sized picture", () => {
    const logo = element("s#1", "logo");
    expect(joinSoleProduct([logo], [notes])).toEqual([notes]);
    expect(logo.role).toBe("logo");
    expect(logo.links).toEqual([]);
  });

  it("keeps a sole reference picture a reference when the slide has no links", () => {
    const ref = element("s#1", "reference");
    expect(joinSoleProduct([ref], [])).toEqual([]);
    expect(joinSoleProduct([ref], [overlay])).toEqual([overlay]);
    expect(ref.role).toBe("reference");
    expect(ref.links).toEqual([]);
  });
});

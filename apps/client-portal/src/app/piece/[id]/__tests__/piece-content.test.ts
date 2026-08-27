import { pieceMetadata, toPieceView, type PieceRow } from "../piece-content";

const ID = "a0000000-0000-0000-0000-000000000001";

function row(overrides: Partial<PieceRow> = {}): PieceRow {
  return {
    id: ID,
    name: "Heirloom Oak Dining Table",
    brand: "Nordic Atelier",
    description:
      "Solid quarter-sawn white oak with a hand-rubbed tung oil finish.",
    price_retail: 420000,
    images: ["https://images.test.invalid/table.jpg"],
    dimensions: { width: 96, depth: 40, height: 30, unit: "in" },
    lead_time_weeks: 10,
    vendors: { name: "ROOM & BOARD" },
    ...overrides,
  };
}

describe("toPieceView", () => {
  it("prefers products.brand over the vendor for the maker line", () => {
    expect(toPieceView(row()).maker).toBe("Nordic Atelier");
  });

  it("falls back to the vendor when there is no brand", () => {
    expect(toPieceView(row({ brand: null })).maker).toBe("ROOM & BOARD");
    expect(toPieceView(row({ brand: "   " })).maker).toBe("ROOM & BOARD");
  });

  it("says nothing about a maker rather than printing a placeholder", () => {
    expect(toPieceView(row({ brand: null, vendors: null })).maker).toBeNull();
    expect(toPieceView(row({ brand: null, vendors: [] })).maker).toBeNull();
    expect(
      toPieceView(row({ brand: null, vendors: { name: null } })).maker,
    ).toBeNull();
  });

  it("formats integer cents, and says nothing when there is no price", () => {
    expect(toPieceView(row()).price).toBe("$4,200");
    expect(toPieceView(row({ price_retail: null })).price).toBeNull();
    expect(toPieceView(row({ price_retail: 0 })).price).toBeNull();
  });

  it("renders dimensions, and omits the line when they are absent or unusable", () => {
    expect(toPieceView(row()).size).toBe("96″ W × 40″ D × 30″ H");
    expect(toPieceView(row({ dimensions: null })).size).toBeNull();
    expect(toPieceView(row({ dimensions: "38 wide" })).size).toBeNull();
    expect(toPieceView(row({ dimensions: {} })).size).toBeNull();
  });

  it("renders a partial dimension set without inventing the missing side", () => {
    expect(
      toPieceView(row({ dimensions: { width: 54, unit: "in" } })).size,
    ).toBe("54″ W");
  });

  it("carries a non-inch unit through", () => {
    expect(
      toPieceView(row({ dimensions: { width: 240, height: 76, unit: "cm" } }))
        .size,
    ).toBe("240 cm W × 76 cm H");
  });

  it("renders a lead time, singular and plural, and omits it when absent", () => {
    expect(toPieceView(row()).leadTime).toBe("Ships in about 10 weeks");
    expect(toPieceView(row({ lead_time_weeks: 1 })).leadTime).toBe(
      "Ships in about 1 week",
    );
    expect(toPieceView(row({ lead_time_weeks: null })).leadTime).toBeNull();
    expect(toPieceView(row({ lead_time_weeks: 0 })).leadTime).toBeNull();
  });

  it("takes the first image, and tolerates an empty or absent array", () => {
    expect(toPieceView(row()).imageUrl).toBe(
      "https://images.test.invalid/table.jpg",
    );
    expect(toPieceView(row({ images: [] })).imageUrl).toBeNull();
    expect(toPieceView(row({ images: null })).imageUrl).toBeNull();
  });

  it("hands an installed app the piece directly", () => {
    expect(toPieceView(row()).appLink).toBe(`patina://piece/${ID}`);
  });
});

describe("pieceMetadata", () => {
  it("titles the share with the piece and its maker, never the portal", () => {
    const meta = pieceMetadata(toPieceView(row()));
    expect(meta.title).toBe("Heirloom Oak Dining Table by Nordic Atelier");
    expect(meta.openGraph.title).toBe(meta.title);
    expect(meta.title).not.toMatch(/Patina Designer Portal/);
  });

  it("falls back to the bare name when no maker resolves", () => {
    const meta = pieceMetadata(
      toPieceView(row({ brand: null, vendors: null })),
    );
    expect(meta.title).toBe("Heirloom Oak Dining Table");
  });

  it("never emits an empty image entry", () => {
    const meta = pieceMetadata(toPieceView(row({ images: [] })));
    expect(meta.openGraph.images).toEqual([]);
  });

  it("always has a description, even with nothing to say", () => {
    const meta = pieceMetadata(
      toPieceView(
        row({
          description: null,
          brand: null,
          vendors: null,
          price_retail: null,
          lead_time_weeks: null,
        }),
      ),
    );
    expect(meta.description).toBe("Heirloom Oak Dining Table, on Patina.");
    expect(meta.openGraph.description).toBe(meta.description);
  });
});

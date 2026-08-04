import {
  suggestedGroupsFromFlatPiece,
  type FlatPieceConfigurationSource,
} from "./piece-configuration-model";

const basePiece: FlatPieceConfigurationSource = {
  id: "piece-1",
  name: "Oak Writing Desk",
};

function groupFor(
  groups: ReturnType<typeof suggestedGroupsFromFlatPiece>,
  name: string,
) {
  return groups.find((group) => group.name === name);
}

describe("suggestedGroupsFromFlatPiece (P2-8 capture -> groups)", () => {
  it("returns no suggestions when the piece carries no flat facets or captureOptions", () => {
    expect(suggestedGroupsFromFlatPiece(basePiece)).toEqual([]);
  });

  it("still seeds a single-value Finish group from the flat finish field alone", () => {
    const groups = suggestedGroupsFromFlatPiece({
      ...basePiece,
      finish: "Matte",
    });

    expect(groupFor(groups, "Finish")?.values).toEqual(["Matte"]);
  });

  it("unions captureOptions.finishes with the flat finish field into one Finish group", () => {
    const groups = suggestedGroupsFromFlatPiece({
      ...basePiece,
      finish: "Matte",
      captureOptions: { finishes: ["Polished", "Brushed"] },
    });

    const finish = groupFor(groups, "Finish");
    expect(finish?.values).toEqual(["Matte", "Polished", "Brushed"]);
  });

  it("produces a multi-value Finish group from captureOptions alone when no flat finish is set", () => {
    const groups = suggestedGroupsFromFlatPiece({
      ...basePiece,
      captureOptions: { finishes: ["Matte", "Satin", "Gloss"] },
    });

    expect(groupFor(groups, "Finish")?.values).toEqual([
      "Matte",
      "Satin",
      "Gloss",
    ]);
  });

  it("dedupes when captureOptions.finishes repeats the flat finish value", () => {
    const groups = suggestedGroupsFromFlatPiece({
      ...basePiece,
      finish: "Matte",
      captureOptions: { finishes: ["Matte", "Polished"] },
    });

    expect(groupFor(groups, "Finish")?.values).toEqual(["Matte", "Polished"]);
  });

  it("unions captureOptions.colors with availableColors and colors into one Color group", () => {
    const groups = suggestedGroupsFromFlatPiece({
      ...basePiece,
      availableColors: ["Walnut"],
      colors: ["Ebony"],
      captureOptions: { colors: ["Ebony", "Driftwood"] },
    });

    const color = groupFor(groups, "Color");
    expect(color?.values).toEqual(["Walnut", "Ebony", "Driftwood"]);
  });

  it("unions captureOptions.materials into the Material group", () => {
    const groups = suggestedGroupsFromFlatPiece({
      ...basePiece,
      materials: ["Oak"],
      captureOptions: { materials: ["Oak", "Leather"] },
    });

    expect(groupFor(groups, "Material")?.values).toEqual(["Oak", "Leather"]);
  });

  it("produces a Material group from captureOptions alone when the piece has no flat materials", () => {
    const groups = suggestedGroupsFromFlatPiece({
      ...basePiece,
      captureOptions: { materials: ["Boucle", "Brass"] },
    });

    expect(groupFor(groups, "Material")?.values).toEqual(["Boucle", "Brass"]);
  });

  it("ignores a null captureOptions the same as an absent one", () => {
    const groups = suggestedGroupsFromFlatPiece({
      ...basePiece,
      finish: "Matte",
      captureOptions: null,
    });

    expect(groupFor(groups, "Finish")?.values).toEqual(["Matte"]);
  });

  it("marks every suggested group unselected by default", () => {
    const groups = suggestedGroupsFromFlatPiece({
      ...basePiece,
      finish: "Matte",
      captureOptions: {
        colors: ["Walnut"],
        finishes: ["Polished"],
        materials: ["Oak"],
      },
    });

    expect(groups.every((group) => group.selected === false)).toBe(true);
  });
});

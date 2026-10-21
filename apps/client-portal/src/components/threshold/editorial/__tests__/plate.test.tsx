import { render, screen } from "@testing-library/react";

import type { EditorialAsset } from "@/lib/editorial/types";

import { HeroPlate } from "../hero-plate";

const SCOPE = "project-1";

const hero: EditorialAsset = {
  id: "asset-hero",
  sha256: "a".repeat(64),
  sourceKind: "upload",
  width: 4000,
  height: 3000,
  ground: "scene",
  dominantHex: "#8C7356",
  lqip: null,
  focal: null,
  subjectBox: null,
  crops: {
    wide: { rect: [0, 0, 4000, 2500], widths: [1280, 1600, 2048, 2560] },
    cover_phone: { rect: [500, 0, 3440, 3000], widths: [640, 828, 1080, 1242] },
  },
  caption: {
    what: "Walnut top, planed",
    whose: "Harmon Bench Works",
    when: "15 October 2026",
  },
  alt: "A hand plane on a workbench, pale shavings around it",
};

const fallback = {
  name: "Walnut sideboard",
  silhouetteKind: "case",
  category: "furniture",
};

/** The picture's state as the browser reports it when React first mounts. */
function stubImageState(state: {
  complete: boolean;
  naturalWidth: number;
  currentSrc: string;
}) {
  const proto = HTMLImageElement.prototype;
  const keys = ["complete", "naturalWidth", "currentSrc"] as const;
  const saved = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(proto, key)] as const,
  );
  for (const key of keys) {
    Object.defineProperty(proto, key, {
      configurable: true,
      get: () => state[key],
    });
  }
  return () =>
    saved.forEach(([key, desc]) =>
      desc
        ? Object.defineProperty(proto, key, desc)
        : delete (proto as unknown as Record<string, unknown>)[key],
    );
}

function renderHero() {
  return render(
    <HeroPlate
      scopeId={SCOPE}
      asset={hero}
      eyebrow="01 · House"
      headline="The house is on its way"
      fallback={fallback}
    />,
  );
}

describe("Plate pre-hydration failure", () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  it("renders the silhouette and says so when the eager picture already failed before mount", () => {
    restore = stubImageState({
      complete: true,
      naturalWidth: 0,
      currentSrc: "https://portal.test/plates/project-1/a/cover_phone-640.avif",
    });
    const { container } = renderHero();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("piece-silhouette")).toHaveAttribute(
      "data-silhouette",
      "case",
    );
    expect(screen.getByText("Picture did not load.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The house is on its way" }),
    ).toBeInTheDocument();
  });

  it("keeps a picture that already loaded before mount", () => {
    restore = stubImageState({
      complete: true,
      naturalWidth: 2048,
      currentSrc: "https://portal.test/plates/project-1/a/wide-2048.avif",
    });
    const { container } = renderHero();
    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.queryByText("Picture did not load.")).toBeNull();
  });

  it("keeps a lazy picture whose load has not started, though it reads complete", () => {
    restore = stubImageState({
      complete: true,
      naturalWidth: 0,
      currentSrc: "",
    });
    const { container } = renderHero();
    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.queryByText("Picture did not load.")).toBeNull();
  });
});

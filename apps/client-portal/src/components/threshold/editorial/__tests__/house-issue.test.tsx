import { act, render, renderHook, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server.node";

import { heroPreloads } from "@/lib/data/client-editorial";
import type {
  ClientProjectEditorial,
  EditorialAsset,
} from "@/lib/editorial/types";
import type {
  InvoiceProjection,
  InvoiceRow,
} from "@/lib/threshold/invoice-rollup";

import {
  useEditionIssue,
  HeroPreloadLinks,
  HouseIssueHead,
  HouseHeldPlate,
  LONG_HEADLINE,
  RoomOpening,
  approvalsRow,
  editionChapters,
  groundFloorChapters,
  houseIssue,
  sheetChapters,
  ledgerRow,
  letterboxRow,
  withChapter,
  withRoomOpening,
  type HouseIssue,
  type HouseIssueHeadProps,
} from "../house-issue";
import { HeroPlate, preloadLink } from "../hero-plate";
import { shortFramePosition } from "@/lib/editorial/crop";

const PROJECT = "b0000000-0000-0000-0000-0000000e1a01";

const CROPS: EditorialAsset["crops"] = {
  wide: { rect: [0, 0, 2400, 1500], widths: [1280, 1600, 2048] },
  cover_phone: { rect: [300, 0, 1720, 1500], widths: [640, 828, 1080] },
  wide32: { rect: [0, 0, 2400, 1600], widths: [768, 1024, 1600] },
  piece: { rect: [400, 0, 1600, 1600], widths: [256, 512] },
};

function asset(id: string, over: Partial<EditorialAsset> = {}): EditorialAsset {
  return {
    id,
    sha256: id.padStart(64, "a").slice(-64),
    sourceKind: "maker",
    width: 2400,
    height: 1600,
    ground: "scene",
    dominantHex: "#6B4F3A",
    lqip: null,
    focal: null,
    subjectBox: null,
    crops: CROPS,
    caption: {
      what: "Walnut sideboard",
      whose: "Birchwood Studio",
      when: "14 October 2026",
    },
    alt: "A walnut sideboard against a plaster wall",
    ...over,
  };
}

function editorial(assets: EditorialAsset[]): ClientProjectEditorial {
  return {
    project: {
      id: PROJECT,
      name: "Elm Street House",
      phase: "procurement",
      targetDate: null,
      showMakers: false,
      studio: { name: "Birchwood Studio", town: "Evanston" },
    } as ClientProjectEditorial["project"],
    rooms: [
      {
        id: "living",
        name: "Living room",
        anchor: "room-living",
        conceptAssetId: null,
        scanAssetIds: [],
        items: [
          {
            id: "sideboard",
            nameAsSigned: "Walnut sideboard",
            category: "storage",
            status: "in_production",
            material: "walnut",
            finish: null,
            dimensions: null,
            descriptionAsSigned: null,
            assetIds: assets.map((a) => a.id),
            silhouetteKind: "case",
          },
          {
            id: "sofa",
            nameAsSigned: "Linen sofa",
            category: "seating",
            status: "ordered",
            material: null,
            finish: null,
            dimensions: null,
            descriptionAsSigned: null,
            assetIds: [],
            silhouetteKind: "chair",
          },
        ],
      },
    ],
    assets,
    palette: [{ hex: "#E8E2D6", brand: "Farrow & Ball", name: "Pointing" }],
    boards: [],
    sheets: [],
  };
}

const SCENE = asset("scene1");
const WHITE = asset("white1", {
  width: 1200,
  height: 1200,
  ground: "white",
  crops: { piece: CROPS.piece },
});

function row(over: Partial<InvoiceRow>): InvoiceRow {
  return {
    invoice: {} as InvoiceRow["invoice"],
    group: "payable",
    balanceCents: 60000,
    currency: "USD",
    reviewReasons: [],
    contradictory: false,
    paymentInFlight: false,
    paymentsRead: true,
    settled: null,
    dueDate: new Date(2026, 8, 25),
    dueState: "past_due",
    studio: false,
    ...over,
  };
}

function projection(over: Partial<InvoiceProjection> = {}): InvoiceProjection {
  return {
    read: "complete",
    readAt: null,
    review: [],
    processing: [],
    payable: [],
    history: [],
    outstanding: [],
    counts: {
      review: 0,
      processing: 0,
      payable: 0,
      history: 0,
    } as InvoiceProjection["counts"],
    outstandingTotals: [],
    withheld: null,
    nothingToPay: true,
    allClear: true,
    ...over,
  };
}

describe("the hero preload", () => {
  it("names exactly the sources HeroPlate draws (server restatement pinned to preloadLink)", () => {
    const ed = editorial([SCENE, WHITE]);
    const fromServer = heroPreloads(ed);
    const fromPlate = preloadLink(PROJECT, SCENE).map(
      ({ imageSrcSet, imageSizes, media }) => ({
        imageSrcSet,
        imageSizes,
        ...(media ? { media } : {}),
      }),
    );
    expect(fromServer).toEqual(fromPlate);
    expect(fromServer).toHaveLength(2);
  });

  it("preloads nothing for a drawn cover", () => {
    expect(heroPreloads(editorial([WHITE]))).toEqual([]);
    expect(heroPreloads(null)).toEqual([]);
  });

  it("renders one high-priority avif image preload per source", () => {
    const { container } = render(
      <HeroPreloadLinks preloads={heroPreloads(editorial([SCENE]))} />,
    );
    const links = document.querySelectorAll('link[rel="preload"][as="image"]');
    expect(links).toHaveLength(2);
    links.forEach((link) => {
      expect(link.getAttribute("type")).toBe("image/avif");
      expect(link.getAttribute("fetchpriority")).toBe("high");
      expect(link.getAttribute("imagesizes")).toBeTruthy();
    });
    container.remove();
  });
});

describe("the issue", () => {
  it("numbers chapters in print order, cover first, skipping sections that did not render", () => {
    const issue = houseIssue(editorial([SCENE]));
    const chapters = editionChapters(issue, [
      "doorstep",
      "approvals",
      false,
      "room-living",
      "road",
      null,
      "mat",
    ]);
    expect(
      [...chapters.entries()].map(([anchor, c]) => `${c.number} ${anchor}`),
    ).toEqual([
      "01 cover",
      "02 doorstep",
      "03 approvals",
      "04 room-living",
      "05 road",
      "06 mat",
    ]);
    expect(chapters.get("room-living")?.label).toBe("Living room");
  });

  it("hands a section back untouched with the edition off", () => {
    const section = <section id="doorstep" />;
    expect(withChapter(null, "doorstep", section)).toBe(section);
    expect(withChapter(new Map(), "doorstep", section)).toBe(section);
    expect(withChapter(null, "doorstep", null)).toBeNull();
  });

  function head(
    issue: HouseIssue | null,
    over: Partial<HouseIssueHeadProps> = {},
  ) {
    return (
      <HouseIssueHead
        issue={issue}
        chapters={editionChapters(issue, [])}
        doorplate={<header data-testid="doorplate-today" />}
        letterhead={{
          studioName: "Birchwood Studio",
          projectName: "Elm Street House",
          preparedFor: "June Brennan",
        }}
        ledger={<nav data-testid="landmark-ledger" />}
        todayLines={<p data-testid="arrival-invoices" />}
        rows={{
          spoken: false,
          invoices: null,
          asks: [],
          gate: null,
          readFailed: false,
        }}
        plan={{ unread: true, rooms: null, marks: [] }}
        {...over}
      />
    );
  }

  it("is today’s head, element for element, with the edition off", () => {
    const { container } = render(head(null));
    expect(
      [...container.children].map(
        (el) => el.getAttribute("data-testid") ?? el.tagName.toLowerCase(),
      ),
    ).toEqual(["doorplate-today", "p", "landmark-ledger", "arrival-invoices"]);
    expect(
      container.querySelector('[data-testid="house-issue-head"], .ed-standing'),
    ).toBeNull();
  });

  it("sets the compact letterhead, purpose, cover, rows and link row in reading order, and drops today’s lines", () => {
    const { container } = render(head(houseIssue(editorial([SCENE]))));
    expect(screen.getByTestId("doorplate-title")).toHaveTextContent(
      "Elm Street House",
    );
    expect(screen.getByTestId("doorplate")).toHaveTextContent(
      "Birchwood StudioElm Street HousePrepared for June Brennan",
    );
    expect(screen.queryByTestId("doorplate-today")).toBeNull();
    expect(screen.queryByTestId("arrival-invoices")).toBeNull();
    // PLAN §2: no skip link; standing row 1 is the first Tab stop.
    expect(container.querySelector("a[href='#doorstep']")).toBeNull();
    const order = [
      "#doorplate",
      '[data-testid="house-issue-hero"]',
      '[data-testid="standing-rows-held"]',
      '[data-testid="landmark-ledger"]',
    ].map((sel) => container.querySelector(sel)!);
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("draws the hero when a photograph meets the floor, a drawn cover when none does", () => {
    const withHero = houseIssue(editorial([SCENE]));
    const { container, unmount } = render(head(withHero));
    expect(
      container.querySelector(
        '[data-testid="house-issue-hero"] figure.ed-hero',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-testid="house-issue-hero"] [data-caption-field]',
      ),
    ).toHaveLength(3);
    expect(screen.queryByTestId("house-issue-cover")).toBeNull();
    unmount();

    render(head(houseIssue(editorial([WHITE]))));
    expect(screen.queryByTestId("house-issue-hero")).toBeNull();
    expect(screen.getByTestId("house-issue-cover")).toHaveTextContent(
      "Elm Street House",
    );
    // The paint chips stand on the drawn cover when there is no hero.
    expect(screen.getByTestId("house-issue-cover")).toHaveTextContent(
      "Pointing",
    );
  });

  it("holds the standing rows’ place until the house has spoken, then links all three", () => {
    const issue = houseIssue(editorial([SCENE]));
    const { rerender } = render(head(issue));
    expect(screen.getByTestId("standing-rows-held")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(document.querySelectorAll("[data-standing-row]")).toHaveLength(0);
    rerender(
      head(issue, {
        rows: {
          spoken: true,
          invoices: null,
          asks: [],
          gate: null,
          readFailed: false,
        },
      }),
    );
    expect(
      [...document.querySelectorAll("[data-standing-row]")].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual(["#letterbox", "#approvals", "#ledger"]);
  });

  it("numbers each branch’s chapters only for the sections it printed, and none with the edition off", () => {
    const issue = houseIssue(editorial([SCENE]));
    const quiet = { note: null, previously: 0, hasRecord: false };
    expect(groundFloorChapters(null, quiet)).toBeNull();
    expect(
      sheetChapters(null, { ...quiet, roomsUnread: false, roomAnchors: [] }),
    ).toBeNull();
    expect([...groundFloorChapters(issue, quiet)!.keys()]).not.toContain(
      "note",
    );
    expect([
      ...groundFloorChapters(issue, {
        ...quiet,
        note: { body: "x" },
        hasRecord: true,
      })!.keys(),
    ]).toEqual(expect.arrayContaining(["note", "previously"]));
    expect([
      ...sheetChapters(issue, {
        ...quiet,
        roomsUnread: true,
        roomAnchors: ["room-living"],
      })!.keys(),
    ]).not.toContain("key");
  });

  it("hands a room band back untouched with the edition off", () => {
    const band = <section id="room-living" />;
    expect(withRoomOpening(null, null, "living", band)).toBe(band);
  });

  it.each([true, false])("threads live showMakers=%s to shared-byte piece captions even with frozen null makers", (showMakers) => {
    const data = editorial([WHITE]);
    data.project.showMakers = showMakers;
    const first = data.rooms[0].items[0];
    data.rooms = [{ ...data.rooms[0], items: [
      { ...first, nameAsSigned: "Harmon walnut sideboard", makerName: null },
      { ...first, id: "second", nameAsSigned: "Harmon oak sideboard", makerName: null },
    ] }];
    const issue = houseIssue(data);
    const chapters = editionChapters(issue, ["room-living"])!;
    const { container } = render(<RoomOpening issue={issue} chapters={chapters} roomId="living" />);
    const pieces = container.querySelector('ul[aria-label^="Pieces"]')!;
    expect(Array.from(pieces.querySelectorAll('[data-caption-field="what"]')).map((node) => node.textContent)).toEqual(
      showMakers
        ? ["Harmon walnut sideboard, the same model", "Harmon oak sideboard, the same model"]
        : ["Walnut sideboard, the same model", "Walnut sideboard, the same model"],
    );
  });

  it("uses This piece instead of a maker-bearing category when makers are off", () => {
    const data = editorial([{ ...WHITE, caption: { ...WHITE.caption, what: null } }]);
    data.rooms = [{ ...data.rooms[0], items: [{ ...data.rooms[0].items[0], category: "Harmon seating", makerName: null }] }];
    const issue = houseIssue(data);
    const chapters = editionChapters(issue, ["room-living"])!;
    const { container } = render(<RoomOpening issue={issue} chapters={chapters} roomId="living" />);
    const caption = container.querySelector('ul[aria-label^="Pieces"] figcaption')!;
    expect(caption.querySelector('[data-caption-field="what"]')?.textContent).toBe('This piece, the same model');
    expect(caption).not.toHaveTextContent('Harmon seating');
  });

  it("opens a room with at most three revealed children: head, plate, pieces; silhouettes for pieces with no photograph", () => {
    const issue = houseIssue(editorial([SCENE, WHITE]));
    const chapters = editionChapters(issue, ["room-living"])!;
    const { container } = render(
      <RoomOpening issue={issue} chapters={chapters} roomId="living" />,
    );
    const reveal = container.querySelector(".ed-reveal")!;
    expect(reveal.children.length).toBeLessThanOrEqual(3);
    expect(reveal.querySelector(".ed-chapter-head")).toHaveTextContent(
      "Living room",
    );
    expect(container.querySelector("[data-dimmable]")).toBeNull();
    const pieces = container.querySelectorAll('ul[aria-label^="Pieces"] > li');
    expect(pieces).toHaveLength(2);
    // The sofa has no plate asset: drawn, and no picture is asked for.
    expect(pieces[1].querySelector('[data-plate="silhouette"]')).not.toBeNull();
    expect(pieces[1].querySelector("img, source")).toBeNull();
  });

  it("opens nothing for a room the issue does not hold", () => {
    const issue = houseIssue(editorial([SCENE, WHITE]));
    const chapters = editionChapters(issue, ["room-living"])!;
    const { container } = render(
      <RoomOpening issue={issue} chapters={chapters} roomId="study" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the standing rows, in words", () => {
  const MEASURE = /\b\d+\s*\/\s*\d+\b|\d+%/;

  it("row 1 names the first payable amount and when it was due", () => {
    const r = letterboxRow(
      projection({ payable: [row({})], nothingToPay: false, allClear: false }),
    );
    expect(r).toEqual({
      sentence: "$600.00 was due on 25 September.",
      amountAct: true,
    });
    expect(
      letterboxRow(projection({ payable: [row({ dueState: "due_today" })] }))
        .sentence,
    ).toBe("$600.00 is due today.");
    expect(
      letterboxRow(
        projection({ payable: [row({ dueDate: null, dueState: null })] }),
      ).sentence,
    ).toBe("$600.00 is ready to pay.");
  });

  it("row 1 is zero when nothing is payable, and says a failed read rather than zero", () => {
    expect(letterboxRow(projection())).toEqual({ sentence: null });
    expect(letterboxRow(projection({ read: "failed" })).sentence).toBe(
      "Your invoices could not be read just now.",
    );
    expect(
      letterboxRow(projection({ processing: [row({ group: "processing" })] }))
        .sentence,
    ).toBe("Your payment is on its way to the studio.");
  });

  it("row 2 names the one approval, counts several in words, and names a gate", () => {
    expect(
      approvalsRow({
        asks: [{ artifactTitle: "Sofa, edition 2" }],
        gate: null,
        readFailed: false,
      }).sentence,
    ).toBe("Waiting for your approval: Sofa, edition 2.");
    expect(
      approvalsRow({ asks: [{}, {}], gate: null, readFailed: false }).sentence,
    ).toBe("Two approvals are waiting for you.");
    expect(
      approvalsRow({ asks: [], gate: "door", readFailed: false }).sentence,
    ).toBe("A document is waiting for your signature.");
    expect(
      approvalsRow({ asks: [], gate: null, readFailed: true }).sentence,
    ).toBe("The approvals could not be read just now.");
    expect(approvalsRow({ asks: [], gate: null, readFailed: false })).toEqual({
      sentence: null,
    });
    // Any other ask owed her, by the name "Waiting on you" gives it.
    expect(
      approvalsRow({
        asks: [],
        gate: null,
        waiting: { label: "Share a preference with your studio" },
        readFailed: false,
      }).sentence,
    ).toBe("Waiting for you: Share a preference with your studio.");
    expect(
      approvalsRow({
        asks: [{}],
        gate: null,
        waiting: { label: "Share a preference with your studio" },
        readFailed: false,
      }).sentence,
    ).toBe("One approval is waiting for you.");
  });

  it("row 3 counts open invoices in words with one currency’s total, never a measure", () => {
    const six = projection({
      outstandingTotals: [{ currency: "USD", cents: 137500, invoiceCount: 6 }],
      allClear: false,
    });
    const sentence = ledgerRow(six).sentence!;
    expect(sentence).toBe("Six invoices are open, $1,375.00 in all.");
    expect(sentence).not.toMatch(MEASURE);
    expect(
      ledgerRow(
        projection({
          outstandingTotals: [
            { currency: "USD", cents: 100, invoiceCount: 1 },
            { currency: "EUR", cents: 100, invoiceCount: 1 },
          ],
          allClear: false,
        }),
      ).sentence,
    ).toBe("Two invoices are open.");
    expect(ledgerRow(projection())).toEqual({ sentence: null });
    expect(
      ledgerRow(
        projection({
          withheld: {} as InvoiceProjection["withheld"],
          allClear: false,
        }),
      ).sentence,
    ).toBe("Your invoices are being checked.");
  });
});

// Exercise the real query with analytics off: initial data is enough to render.
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false, isLoading: true }) }));
jest.mock('@patina/supabase/client', () => ({ createBrowserClient: jest.fn() }));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase/client';

it('renders editorial immediately while analytics is unavailable', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useEditionIssue(PROJECT, editorial([asset('cover')])), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  expect(result.current?.hero?.id).toBe('cover');
  expect(createBrowserClient).not.toHaveBeenCalled();
});

// ── Phase 2: the approved edition (00846) ─────────────────────────────────────

const EDITION_ID = "e0000000-0000-0000-0000-0000000ed002";

function edition(
  assets: EditorialAsset[],
  composition: Partial<NonNullable<ClientProjectEditorial["composition"]>> = {},
): ClientProjectEditorial {
  return {
    ...editorial(assets),
    edition: {
      id: EDITION_ID,
      seq: 2,
      approvedAt: "2026-10-21T10:00:00Z",
      approvedBy: "studio",
      notice: "The page now opens on your sideboard.",
    },
    composition: { hero: { assetId: assets[0]?.id ?? "none" }, held: [], chapters: [], ...composition },
  };
}

/** A white-ground catalogue shot that meets the hero floor: V2-1 lets the studio pick it. */
const CATALOGUE = asset("catalogue1", { ground: "white" });

describe("the approved edition", () => {
  function cover(issue: HouseIssue) {
    return render(
      <HouseIssueHead
        issue={issue}
        chapters={editionChapters(issue, [])}
        doorplate={null}
        letterhead={{ studioName: "Birchwood Studio", projectName: "Elm Street House", preparedFor: "June Brennan" }}
        ledger={null}
        todayLines={null}
        rows={{ spoken: false, invoices: null, asks: [], gate: null, readFailed: false }}
        plan={{ unread: true, rooms: null, marks: [] }}
      />,
    );
  }

  it("heroes the composition's pick, a white-ground catalogue shot included, where Phase 1 would draw the cover", () => {
    expect(houseIssue(editorial([CATALOGUE])).hero).toBeNull();
    const issue = houseIssue(edition([CATALOGUE, SCENE], { hero: { assetId: CATALOGUE.id } }));
    expect(issue.hero?.id).toBe(CATALOGUE.id);
    cover(issue);
    expect(screen.getByTestId("house-issue-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("house-issue-cover")).toBeNull();
  });

  it("marks a hero headline past LONG_HEADLINE for the smaller step, whole, and leaves a short one alone", () => {
    const sixty = "Your walnut sideboard is planed and waiting on the workbench";
    expect(sixty).toHaveLength(60);
    for (const [headline, mark] of [
      [sixty, "long"],
      ["x".repeat(LONG_HEADLINE + 1), "long"],
      ["x".repeat(LONG_HEADLINE), null],
      ["Your sideboard", null],
    ] as const) {
      const issue = houseIssue(edition([SCENE], { chapters: [{ key: "cover", headline, standing: null }] }));
      const { unmount } = cover(issue);
      const hero = screen.getByTestId("house-issue-hero");
      expect(hero.getAttribute("data-headline")).toBe(mark);
      // No subject box to protect: a long headline always takes the shorter phone frame.
      expect(hero.getAttribute("data-hero-frame")).toBe(mark ? "short" : null);
      expect(hero.querySelector("h2")).toHaveTextContent(headline);
      unmount();
    }
  });

  it("draws the cover, never another photograph, when the edition names no hero, a concept, or one under the floor", () => {
    for (const [assets, hero] of [
      [[SCENE], null],
      [[asset("concept1", { sourceKind: "concept" }), SCENE], { assetId: "concept1" }],
      [[WHITE, SCENE], { assetId: WHITE.id }],
      [[SCENE], { assetId: "not-in-the-envelope" }],
    ] as const) {
      const issue = houseIssue(edition([...assets], { hero }));
      expect(issue.hero).toBeNull();
      const { unmount } = cover(issue);
      expect(screen.queryByTestId("house-issue-hero")).toBeNull();
      expect(screen.getByTestId("house-issue-cover")).toBeInTheDocument();
      unmount();
    }
  });

  it("scopes every plate and the hero preload to the edition, and to the project without one", () => {
    const withEdition = edition([SCENE]);
    expect(houseIssue(withEdition).scopeId).toBe(EDITION_ID);
    const preloads = heroPreloads(withEdition);
    expect(preloads.length).toBeGreaterThan(0);
    for (const p of preloads) {
      expect(p.imageSrcSet).toContain(`/plates/${EDITION_ID}/`);
      expect(p.imageSrcSet).not.toContain(`/plates/${PROJECT}/`);
    }
    expect(houseIssue(editorial([SCENE])).scopeId).toBe(PROJECT);
    for (const p of heroPreloads(editorial([SCENE]))) expect(p.imageSrcSet).toContain(`/plates/${PROJECT}/`);
  });

  it("takes headlines and standing sentences from the composition, keeping the PLAN's order and anchors", () => {
    const phase1 = editionChapters(houseIssue(editorial([SCENE])), ["doorstep", "approvals", "key", "room-living", "road", "note", "mat"])!;
    const issue = houseIssue(
      edition([SCENE], {
        // Reversed, with keys the composition may not set: order and anchors stay the PLAN's.
        chapters: [
          { key: "progress", headline: "The sideboard is on the bench", standing: "The workshop is planing the top." },
          { key: "room-living", headline: "Walnut, and the light it takes", standing: "The sofa is ordered." },
          { key: "note", headline: "Not the studio's to rename", standing: null },
          { key: "doorstep", headline: "Not composed", standing: null },
          { key: "room-stranger", headline: "No such room", standing: null },
          { key: "house", headline: "Three rooms, read from the front door", standing: null },
          { key: "cover", headline: "Your sideboard, in the workshop", standing: "It ships in January." },
        ],
      }),
    );
    const chapters = editionChapters(issue, ["doorstep", "approvals", "key", "room-living", "road", "note", "mat"])!;
    expect([...chapters.keys()]).toEqual([...phase1.keys()]);
    expect([...chapters.values()].map((c) => c.number)).toEqual([...phase1.values()].map((c) => c.number));
    expect(chapters.get("cover")?.headline).toBe("Your sideboard, in the workshop");
    expect(chapters.get("key")?.headline).toBe("Three rooms, read from the front door");
    expect(chapters.get("room-living")).toMatchObject({ headline: "Walnut, and the light it takes", standing: "The sofa is ordered." });
    expect(chapters.get("road")).toMatchObject({ headline: "The sideboard is on the bench", standing: "The workshop is planing the top." });
    for (const anchor of ["doorstep", "approvals", "note", "mat"]) {
      expect(chapters.get(anchor)?.headline).toBe(phase1.get(anchor)?.headline);
      expect(chapters.get(anchor)?.standing).toBeUndefined();
    }

    // The hero's tab carries the composed cover headline.
    cover(issue);
    expect(screen.getByTestId("house-issue-hero")).toHaveTextContent("Your sideboard, in the workshop");
  });

  it("ignores composed words without an approved edition", () => {
    const loose = { ...editorial([SCENE]), composition: { hero: null, held: [], chapters: [{ key: "cover", headline: "Loose", standing: null }] } };
    const chapters = editionChapters(houseIssue(loose), [])!;
    expect(chapters.get("cover")?.headline).not.toBe("Loose");
    expect(houseIssue(loose).hero?.id).toBe(SCENE.id);
  });

  it("prints a chapter's standing sentence under its head, inside one revealed child", () => {
    const issue = houseIssue(
      edition([SCENE, WHITE], {
        chapters: [
          { key: "room-living", headline: "Walnut, and the light it takes", standing: "The sofa is ordered." },
          { key: "progress", headline: "On the bench", standing: "The workshop is planing the top." },
        ],
      }),
    );
    const chapters = editionChapters(issue, ["room-living", "road"])!;
    const room = render(<RoomOpening issue={issue} chapters={chapters} roomId="living" />);
    const reveal = room.container.querySelector(".ed-reveal")!;
    expect(reveal.children.length).toBeLessThanOrEqual(3);
    expect(reveal.children[0]).toHaveTextContent("Walnut, and the light it takes");
    expect(reveal.children[0].querySelector('[data-testid="chapter-standing"]')).toHaveTextContent("The sofa is ordered.");
    room.unmount();

    render(<>{withChapter(chapters, "road", <section id="road" />)}</>);
    expect(screen.getByTestId("chapter-standing")).toHaveTextContent("The workshop is planing the top.");
  });

  // ── SQ-1593 R2: the edition's own held placement, never Phase 1's rank ─────

  /** The reviewer's two scans: 1800 × 2100, each in its own room, each with a tall crop. */
  function twoScans(): ClientProjectEditorial {
    const scan = (id: string) =>
      asset(id, {
        sourceKind: "scan",
        width: 1800,
        height: 2100,
        crops: {
          wide32: { rect: [0, 0, 1800, 1200], widths: [768, 1024] },
          tall: { rect: [420, 0, 966, 2100], widths: [780, 1080] },
          cover_phone: { rect: [0, 0, 1800, 1569], widths: [640, 828] },
        },
      });
    const base = editorial([scan("scana"), scan("scanb")]);
    const room = (id: string) => ({
      id,
      name: `Room ${id}`,
      anchor: `room-${id}`,
      conceptAssetId: null,
      scanAssetIds: [`scan${id}`],
      items: [],
    });
    return { ...base, rooms: [room("a"), room("b")] };
  }

  function placed(held: string[], images: NonNullable<ClientProjectEditorial["images"]>): ClientProjectEditorial {
    const house = twoScans();
    return { ...edition([...house.assets], { hero: null, held }), rooms: house.rooms, images };
  }

  function heldIn(issue: HouseIssue, roomId: string) {
    const chapters = editionChapters(issue, issue.editorial.rooms.map((r) => r.anchor))!;
    const view = render(<RoomOpening issue={issue} chapters={chapters} roomId={roomId} />);
    const held = view.container.querySelector(".ed-held");
    const src = held?.querySelector("img")?.getAttribute("src") ?? null;
    view.unmount();
    return { held: Boolean(held), src };
  }

  it("holds the plate the edition approved in the room it placed it, where Phase 1 would hold another", () => {
    // Phase 1 (no edition) still ranks a held plate of its own.
    expect(houseIssue(twoScans()).heldRoomId).not.toBeNull();

    // approvedHeld=[b] with a room-B held row: b stands held in room B.
    const issue = houseIssue(
      placed(["scanb"], [{ assetId: "scanb", plateRole: "held", rank: 1, chapterKey: "room-b" }]),
    );
    expect(issue.heldRoomId).toBe("b");
    expect(issue.rooms.get("b")?.chapter?.id).toBe("scanb");
    expect(issue.rooms.get("a")?.chapter?.id).toBe("scana");
    const b = heldIn(issue, "b");
    expect(b.held).toBe(true);
    expect(b.src).toContain(`/plates/${EDITION_ID}/${"scanb".padStart(64, "a")}/`);
    expect(heldIn(issue, "a").held).toBe(false);
  });

  it("holds nothing when the edition approved no held plate, or only placed one it did not approve", () => {
    for (const house of [
      placed([], []),
      placed([], [{ assetId: "scanb", plateRole: "held", rank: 1, chapterKey: "room-b" }]),
      // Unknown keys retain the Phase 1 room ranking, without inventing a held placement.
      placed(["scanb"], [{ assetId: "scanb", plateRole: "held", rank: 1, chapterKey: "unknown" }]),
    ]) {
      const issue = houseIssue(house);
      expect(issue.heldRoomId).toBeNull();
      expect(heldIn(issue, "a").held).toBe(false);
      expect(heldIn(issue, "b").held).toBe(false);
    }
  });

  it("renders the exact approved house held image at the key opening, never a ranked substitute", () => {
    const issue = houseIssue(
      placed(["scanb"], [{ assetId: "scanb", plateRole: "held", rank: 1, chapterKey: "house" }]),
    );
    const chapters = editionChapters(issue, ["key", "room-a", "room-b"])!;
    const view = render(<>{withChapter(chapters, "key", <section id="key" />)}</>);
    const held = view.container.querySelector(".ed-held")!;
    expect(held).not.toBeNull();
    expect(held.querySelector("img")?.getAttribute("src")).toContain(
      "/plates/" + EDITION_ID + "/" + "scanb".padStart(64, "a") + "/",
    );
    expect(held.compareDocumentPosition(view.container.querySelector("#key")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(issue.rooms.get("b")?.chapter).toBeNull();
    expect(heldIn(issue, "a").held).toBe(false);
    expect(heldIn(issue, "b").held).toBe(false);
  });

  it("renders the ground-floor house held plate with the key chapter's exact crop, caption and fallback", () => {
    const house = placed(["scanb"], [{ assetId: "scanb", plateRole: "held", rank: 1, chapterKey: "house" }]);
    const issue = houseIssue({ ...house, rooms: [] });
    const chapters = editionChapters(issue, ["key"])!;
    const key = render(<>{withChapter(chapters, "key", <section id="key" />)}</>);
    const keyPlate = key.container.querySelector(".ed-held")!.outerHTML;
    key.unmount();
    const ground = render(<HouseHeldPlate issue={issue} />);
    expect(ground.container.querySelectorAll(".ed-held")).toHaveLength(1);
    expect(ground.container.querySelector(".ed-held")!.outerHTML).toBe(keyPlate);
    expect(ground.container.querySelectorAll("[id]")).toHaveLength(0);
  });

  it("renders no ground-floor house plate without an approved house placement", () => {
    for (const issue of [
      null,
      houseIssue(editorial([SCENE])),
      houseIssue(placed([], [{ assetId: "scanb", plateRole: "held", rank: 1, chapterKey: "house" }])),
      houseIssue(placed(["scanb"], [{ assetId: "scanb", plateRole: "held", rank: 1, chapterKey: "room-b" }])),
    ]) {
      const view = render(<HouseHeldPlate issue={issue} />);
      expect(view.container.innerHTML).toBe("");
      view.unmount();
    }
  });

  it("follows the edition's rank among held rows, and keeps a held picture out of every other room", () => {
    const issue = houseIssue(
      placed(
        ["scana", "scanb"],
        [
          { assetId: "scana", plateRole: "held", rank: 2, chapterKey: "room-a" },
          { assetId: "scanb", plateRole: "held", rank: 1, chapterKey: "room-a" },
        ],
      ),
    );
    // Rank 1 is b, placed in room A: one held plate on the page, there.
    expect(issue.heldRoomId).toBe("a");
    expect(issue.rooms.get("a")?.chapter?.id).toBe("scanb");
    expect(issue.rooms.get("b")?.chapter).toBeNull();
  });

  // ── SQ-1593 R3: the approved cover's standing sentence ───────────────────────

  function arrival(issue: HouseIssue) {
    return render(
      <HouseIssueHead
        issue={issue}
        chapters={editionChapters(issue, [])}
        doorplate={null}
        letterhead={{ studioName: "Birchwood Studio", projectName: "Elm Street House", preparedFor: "June Brennan" }}
        ledger={<nav data-testid="landmark-ledger" />}
        todayLines={null}
        rows={{ spoken: true, invoices: projection(), asks: [], gate: null, readFailed: false }}
        plan={{ unread: true, rooms: null, marks: [] }}
      />,
    );
  }

  it("prints the cover's standing sentence under the hero and the drawn cover alike, after the three rows", () => {
    const words = { key: "cover", headline: "Your sideboard", standing: "The workshop has planed the walnut top." };
    for (const issue of [
      houseIssue(edition([SCENE], { chapters: [words] })),
      houseIssue(edition([SCENE], { hero: null, chapters: [words] })),
    ]) {
      const { container, unmount } = arrival(issue);
      const standing = screen.getByTestId("cover-standing");
      expect(standing).toHaveTextContent(words.standing);
      const rows = container.querySelectorAll("[data-standing-row]");
      // The three operational rows stand, in order, untouched; the sentence follows them.
      expect([...rows].map((r) => r.getAttribute("data-standing-row"))).toEqual(["1", "2", "3"]);
      expect([...rows].some((r) => r.textContent?.includes(words.standing))).toBe(false);
      const cover = container.querySelector('[data-testid="house-issue-hero"], [data-testid="house-issue-cover"]')!;
      for (const [before, after] of [
        [cover, rows[2]],
        [rows[2], standing],
        [standing, screen.getByTestId("landmark-ledger")],
      ] as const) {
        expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
      unmount();
    }
  });

  it("prints no cover sentence without an approved standing, and never the doorstep's", () => {
    arrival(houseIssue(edition([SCENE], { chapters: [{ key: "cover", headline: "Your sideboard", standing: null }] })));
    expect(screen.queryByTestId("cover-standing")).toBeNull();
  });

  // ── SQ-1593 R5: a long headline never crops the subject box ─────────────────

  it("server-renders and starts an unmeasured short phone hero with cover at its nominal position", () => {
    const scan = asset("firstpaint", {
      sourceKind: "scan", width: 1200, height: 1600,
      subjectBox: [0.05, 0, 0.9, 0.57],
      crops: { cover_phone: { rect: [0, 0, 1200, 1046], widths: [640, 828, 1080] } },
    });
    const nominalPosition = shortFramePosition(scan);
    expect(nominalPosition).toBe("50% 0%");
    const plate = (
      <HeroPlate
        scopeId={PROJECT}
        asset={scan}
        eyebrow="01 · Elm Street House"
        headline="Your scan, from the room upstairs"
        phoneObjectPosition={nominalPosition}
        fallback={{ name: "The room upstairs" }}
      />
    );
    const server = document.createElement("div");
    server.innerHTML = renderToString(plate);
    // A zero-sized box keeps the client in its pre-measure state, as on the server.
    jest.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue(
      { width: 0, height: 0 } as DOMRect,
    );
    const client = render(plate);
    for (const container of [server, client.container]) {
      const slot = container.querySelector<HTMLElement>(".ed-hero-slot")!;
      expect(slot.style.getPropertyValue("--ed-hero-phone-fit")).toBe("cover");
      expect(slot.style.getPropertyValue("--ed-hero-phone-position")).toBe(nominalPosition);
    }
  });

  it("contains a short-frame scan when the 72svh box cannot cover its subject, and remeasures on resize", () => {
    let height = 288; // 72svh at a 390 × 400 viewport; nominal 39:30 would be 300.
    jest.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockImplementation(() =>
      ({ width: 390, height } as DOMRect),
    );
    const scan = asset("clamped", {
      sourceKind: "scan", width: 1200, height: 1600,
      subjectBox: [0.05, 0, 0.9, 0.57],
      crops: { cover_phone: { rect: [0, 0, 1200, 1046], widths: [640, 828, 1080] } },
    });
    cover(houseIssue(edition([scan], { chapters: [{ key: "cover", headline: "Your scan, from the room upstairs", standing: null }] })));
    const hero = screen.getByTestId("house-issue-hero");
    expect(hero).toHaveAttribute("data-hero-frame", "short");
    const slot = hero.querySelector<HTMLElement>(".ed-hero-slot")!;
    expect(slot.style.getPropertyValue("--ed-hero-phone-fit")).toBe("contain");
    height = 300;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(slot.style.getPropertyValue("--ed-hero-phone-fit")).toBe("cover");
    expect(slot.style.getPropertyValue("--ed-hero-phone-position")).toBe("50% 0%");
  });

  it("shortens the phone frame for a long headline only where the subject fits, at the position that keeps it whole", () => {
    const sixty = "Your walnut sideboard is planed and waiting on the workbench";
    const nearEdge = asset("nearedge", {
      width: 1560,
      height: 1360,
      subjectBox: [0.05, 0, 0.9, 0.7],
      crops: {
        wide32: { rect: [0, 0, 1560, 1040], widths: [768, 1024] },
        cover_phone: { rect: [0, 0, 1560, 1360], widths: [640, 828, 1080] },
      },
    });
    const view = cover(houseIssue(edition([nearEdge], { chapters: [{ key: "cover", headline: sixty, standing: null }] })));
    const hero = screen.getByTestId("house-issue-hero");
    expect(hero.getAttribute("data-headline")).toBe("long");
    expect(hero.getAttribute("data-hero-frame")).toBe("short");
    const slot = hero.querySelector<HTMLElement>(".ed-hero-slot")!;
    expect(slot.style.getPropertyValue("--ed-hero-phone-position")).toBe("50% 0%");
    view.unmount();

    // A portrait whose subject fills its 39:34 phone crop: the shorter frame would cut it,
    // so the smaller type keeps the taller frame.
    const tall = asset("portrait", {
      width: 1100,
      height: 1900,
      subjectBox: [0.1, 0.2, 0.8, 0.5],
      crops: {
        cover_phone: { rect: [0, 376, 1100, 959], widths: [640, 828, 1080] },
        tall: { rect: [113, 0, 874, 1900], widths: [640, 828] },
      },
    });
    cover(houseIssue(edition([tall], { chapters: [{ key: "cover", headline: sixty, standing: null }] })));
    const kept = screen.getByTestId("house-issue-hero");
    expect(kept.getAttribute("data-headline")).toBe("long");
    expect(kept.getAttribute("data-hero-frame")).toBeNull();
    expect(kept.querySelector<HTMLElement>(".ed-hero-slot")!.style.getPropertyValue("--ed-hero-phone-position")).toBe("");
  });
});


describe('approved catalogue cover', () => {
  it('keeps the approved white-ground hero and renumbers its phase-free label', () => {
    const photo = asset('bed', { width: 1600, height: 1600, ground: 'white', subjectBox: [0.12, 0.27, 0.7, 0.4], crops: { pair: { rect: [0, 197, 1600, 1143], widths: [768, 1024, 1600] }, piece: CROPS.piece } });
    const data = editorial([photo]);
    data.project.phase = null;
    data.edition = { id: 'approved', seq: 1, approvedAt: '2026-10-23', approvedBy: 'studio', notice: null };
    data.composition = { hero: { assetId: photo.id }, held: [], chapters: [{ key: 'cover', headline: 'Your bed is on the way to the house', standing: null }] };
    const issue = houseIssue(data)!;
    expect(issue.hero?.id).toBe('bed');
    const { container } = render(
      <HouseIssueHead
        issue={issue}
        chapters={editionChapters(issue, [])}
        doorplate={null}
        letterhead={{ studioName: 'Birchwood Studio', projectName: 'Elm Street House', preparedFor: 'June Brennan' }}
        ledger={null}
        todayLines={null}
        rows={{ spoken: false, invoices: projection(), asks: [], gate: null, readFailed: false }}
        plan={{ unread: true, rooms: null, marks: [] }}
      />,
    );
    expect(container.querySelector('[data-testid="house-issue-hero"]')).not.toHaveAttribute('data-hero-frame');
    expect(container.querySelector('.ed-hero--contained')).not.toBeNull();
    const chapters = editionChapters(issue, ['doorstep'])!;
    expect(chapters.get('cover')!.eyebrow).toBe('01 · Elm Street House');
    expect(heroPreloads(data)[0].imageSrcSet).toContain('/pair-1600.avif');
  });
});

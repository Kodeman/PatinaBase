import { act, fireEvent, render, screen } from '@testing-library/react';

import { SIZES } from '@/lib/editorial/crop';
import type { EditorialAsset, EditorialItem } from '@/lib/editorial/types';

import { BoardPlate } from '../board-plate';
import { HeldPlate } from '../held-plate';
import { HeroPlate, preloadLink } from '../hero-plate';
import { PairPlate } from '../pair-plate';
import { PiecePlate } from '../piece-plate';
import { PlanPlate } from '../plan-plate';
import { CONCEPT_CHIP, RoomPlate } from '../room-plate';
import { SheetPlate } from '../sheet-plate';
import { SilhouettePlate } from '../silhouette-plate';
import { SwatchStrip } from '../swatch-strip';
import { ProvenanceLine } from '../provenance-line';
import { ChapterHead } from '../chapter-head';
import { Reveal } from '../reveal';

const SCOPE = 'project-1';
const ALL_CROPS: EditorialAsset['crops'] = {
  wide: { rect: [0, 0, 4000, 2500], widths: [1280, 1600, 2048, 2560] },
  cover_phone: { rect: [500, 0, 3440, 3000], widths: [640, 828, 1080, 1242] },
  tall: { rect: [1300, 0, 1380, 3000], widths: [640, 828, 1080, 1242] },
  wide32: { rect: [0, 0, 4000, 2666], widths: [768, 1024, 1600, 2048] },
  pair: { rect: [0, 0, 4000, 2857], widths: [768, 1024, 1600, 2048] },
  piece: { rect: [0, 0, 3000, 3000], widths: [256, 512, 768] },
  sheet: { rect: [0, 0, 4000, 3000], widths: [768, 1024, 1600, 2048] },
  board: { rect: [0, 0, 4000, 3000], widths: [768, 1024, 1600, 2048] },
};

let n = 0;
function asset(over: Partial<EditorialAsset> = {}): EditorialAsset {
  n += 1;
  return {
    id: `asset-${n}`,
    sha256: n.toString(16).padStart(64, '0'),
    sourceKind: 'upload',
    width: 4000,
    height: 3000,
    ground: 'scene',
    dominantHex: '#8C7356',
    lqip: null,
    focal: null,
    subjectBox: null,
    crops: ALL_CROPS,
    caption: { what: 'Walnut top, planed', whose: 'Harmon Bench Works', when: '15 October 2026' },
    alt: 'A hand plane on a workbench, pale shavings around it',
    ...over,
  };
}

const item: EditorialItem = {
  id: 'sideboard',
  nameAsSigned: 'Walnut sideboard',
  category: 'furniture',
  status: 'in_production',
  makerName: 'Harmon Bench Works',
  material: null,
  finish: null,
  dimensions: null,
  descriptionAsSigned: null,
  assetIds: [],
  silhouetteKind: 'case',
};

const fallback = { name: 'Walnut sideboard', silhouetteKind: 'case' };

function everyPlate() {
  return (
    <>
      <HeroPlate scopeId={SCOPE} asset={asset({ sourceKind: 'installed' })} eyebrow="01 · Elm Street House · Procurement" headline="The living room is on its way" fallback={fallback} paletteHex="#6B4F3A" />
      <RoomPlate scopeId={SCOPE} asset={asset({ sourceKind: 'scan' })} fallback={fallback} />
      <RoomPlate scopeId={SCOPE} asset={asset({ sourceKind: 'concept' })} fallback={fallback} />
      <HeldPlate scopeId={SCOPE} asset={asset()} fallback={fallback} />
      <PairPlate scopeId={SCOPE} asset={asset({ sourceKind: 'maker' })} swatches={[{ hex: '#E3DACB', brand: 'Halvorsen', name: 'Morning Oat' }]} fallback={fallback} />
      <PiecePlate showMakers scopeId={SCOPE} item={item} asset={asset({ sourceKind: 'maker', ground: 'white' })} statusWords="In production" />
      <SheetPlate scopeId={SCOPE} asset={asset({ sourceKind: 'sheet', ground: 'drawing' })} alt="Sheet A-101, first-floor plan" fallback={fallback} />
      <BoardPlate scopeId={SCOPE} asset={asset({ sourceKind: 'board' })} alt="Living room board" fallback={fallback} />
      <SilhouettePlate name="Floor lamp" silhouetteKind="light" />
      <SwatchStrip swatches={[{ hex: '#3B4A40', brand: 'Halvorsen', name: 'Bur Oak Green' }]} caption={{ what: 'Living room paint', whose: "from Birchwood Studio's palette", when: '2 September 2026' }} />
      <PlanPlate
        geometry={{
          viewBox: '0 0 100 50',
          rects: [{ roomId: 'r', x: 0, y: 0, w: 50, h: 50, anchor: 'room-r' }],
          labels: [],
          road: { x1: 50, x2: 100, y: 25, anchor: 'road' },
          roadLabelY: 40,
          doorMarks: [],
          leaders: [],
        }}
        caption={{ what: 'Elm Street House, the key plan', whose: 'drawn by Birchwood Studio', when: '2 June 2026' }}
      />
    </>
  );
}

describe('editorial plates', () => {
  it('captions every plate with exactly three segments, a note never making a fourth', () => {
    const { container } = render(everyPlate());
    const captions = container.querySelectorAll('figcaption');
    expect(captions.length).toBeGreaterThanOrEqual(11);
    captions.forEach((caption) => {
      expect(caption.querySelectorAll('[data-caption-field]').length).toBeGreaterThanOrEqual(2);
      const note = caption.querySelector('.plate-note')?.textContent ?? '';
      const triplet = (caption.textContent ?? '').slice(0, (caption.textContent ?? '').length - note.length);
      expect([2, 3]).toContain(triplet.split(' · ').length);
    });
  });

  it('never marks a plate dimmable, and keeps every plate inked', () => {
    const { container } = render(everyPlate());
    expect(container.querySelector('[data-dimmable]')).toBeNull();
    container.querySelectorAll('figure').forEach((figure) => {
      expect(figure).toHaveAttribute('data-never-dim');
    });
  });

  it('loads the hero eagerly at high priority and every other plate lazily', () => {
    const { container } = render(everyPlate());
    const images = Array.from(container.querySelectorAll('img'));
    const hero = container.querySelector('[data-plate="hero"] img')!;
    expect(hero).not.toHaveAttribute('loading', 'lazy');
    expect(hero).toHaveAttribute('fetchpriority', 'high');
    images
      .filter((img) => img !== hero)
      .forEach((img) => expect(img).toHaveAttribute('loading', 'lazy'));
  });

  it('sets width and height on every image', () => {
    const { container } = render(everyPlate());
    container.querySelectorAll('img').forEach((img) => {
      expect(Number(img.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0);
    });
  });

  it('offers AVIF before WebP, the phone crop first on the hero', () => {
    const { container } = render(
      <HeroPlate scopeId={SCOPE} asset={asset()} eyebrow="01 · House" headline="The house" fallback={fallback} />,
    );
    const sources = Array.from(container.querySelectorAll('source'));
    expect(sources.map((s) => [s.getAttribute('type'), s.getAttribute('media')])).toEqual([
      ['image/avif', '(max-width: 600px)'],
      ['image/webp', '(max-width: 600px)'],
      ['image/avif', null],
      ['image/webp', null],
    ]);
    expect(sources[0].getAttribute('srcset')).toContain('cover_phone-640.avif 640w');
    expect(container.querySelector('img')).toHaveStyle({ objectPosition: '50% 41.7%' });
  });

  it('places the missing-photograph note outside the silhouette caption fields', () => {
    const { container } = render(<SilhouettePlate name="Floor lamp" />);
    expect(Array.from(container.querySelectorAll('[data-caption-field]')).map((field) => field.textContent)).toEqual([
      'Floor lamp',
      'drawn from the specification',
    ]);
    expect(container.querySelector('.plate-note')).toHaveTextContent('Photograph to follow.');
    expect(container.querySelector('figcaption')).not.toHaveTextContent('photograph to follow');
  });

  it('swaps a picture that fails to load for the silhouette and says so', () => {
    const { container } = render(<RoomPlate scopeId={SCOPE} asset={asset({ sourceKind: 'scan' })} fallback={fallback} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('piece-silhouette')).toHaveAttribute('data-silhouette', 'case');
    expect(container.querySelector('.plate-note')).toHaveTextContent('Picture did not load.');
    expect(container.querySelectorAll('[data-caption-field]')).toHaveLength(2);
  });

  it('keeps the hero headline when the hero picture fails', () => {
    render(<HeroPlate scopeId={SCOPE} asset={asset()} eyebrow="01 · House" headline="The house is on its way" fallback={fallback} />);
    fireEvent.error(screen.getByRole('img', { name: /hand plane/ }));
    expect(screen.getByRole('heading', { name: 'The house is on its way' })).toBeInTheDocument();
    expect(screen.getByText('Picture did not load.')).toBeInTheDocument();
  });

  it('chips a concept render on the image and only a concept render', () => {
    const { container, rerender } = render(<RoomPlate scopeId={SCOPE} asset={asset({ sourceKind: 'concept' })} fallback={fallback} />);
    expect(screen.getByText(CONCEPT_CHIP).closest('.ed-plate__frame')).not.toBeNull();
    expect(container.querySelector('figure')).toHaveAttribute('data-concept');
    rerender(<RoomPlate scopeId={SCOPE} asset={asset({ sourceKind: 'scan' })} fallback={fallback} />);
    expect(screen.queryByText(CONCEPT_CHIP)).toBeNull();
  });

  it('captions a catalogue photograph as the same model, not your piece', () => {
    const { container } = render(
      <PiecePlate showMakers scopeId={SCOPE} item={item} asset={asset({ sourceKind: 'maker', ground: 'white' })} statusWords="In production" />,
    );
    expect(container.querySelector('[data-caption-field="what"]')).toHaveTextContent('Walnut sideboard, the same model');
    expect(container.querySelector('[data-caption-field="whose"]')).toHaveTextContent("from Harmon Bench Works' catalogue");
    expect(container.querySelector('.plate-note')).toHaveTextContent('Not your piece; yours is in production.');
    expect(container.querySelector('figure')).toHaveAttribute('data-ground', 'white');
    expect(screen.getByText('In production')).toBeInTheDocument();
  });

  it('drops the catalogue note once the piece is installed', () => {
    const { container } = render(
      <PiecePlate showMakers scopeId={SCOPE} item={{ ...item, status: 'installed' }} asset={asset({ sourceKind: 'maker', ground: 'white' })} statusWords="Installed" />,
    );
    expect(container.querySelector('.plate-note')).toBeNull();
  });

  it('draws a piece with no photograph, captioned from the specification', () => {
    const { container } = render(<PiecePlate showMakers scopeId={SCOPE} item={{ ...item, nameAsSigned: 'Floor lamp', silhouetteKind: null, category: 'lighting' }} asset={null} statusWords="Ordered" />);
    expect(screen.getByTestId('piece-silhouette')).toHaveAttribute('data-silhouette', 'light');
    expect(Array.from(container.querySelectorAll('[data-caption-field]')).map((s) => s.textContent)).toEqual([
      'Floor lamp',
      'drawn from the specification',
    ]);
    expect(container.querySelector('.plate-note')).toHaveTextContent('Photograph to follow.');
  });

  it('captions what · whose when the when is withheld, with no dangling separator and no silhouette', () => {
    const { container } = render(
      <HeldPlate
        scopeId={SCOPE}
        asset={asset({ caption: { what: 'walnut sideboard', whose: 'Birchwood Studio', when: null } })}
        fallback={fallback}
      />,
    );
    expect(container.querySelector('img')).not.toBeNull();
    expect(screen.queryByTestId('piece-silhouette')).toBeNull();
    const caption = container.querySelector('figcaption');
    expect(caption).toHaveTextContent(/^walnut sideboard · Birchwood Studio$/);
    expect(Array.from(caption!.querySelectorAll('[data-caption-field]')).map((s) => s.getAttribute('data-caption-field'))).toEqual([
      'what',
      'whose',
    ]);
  });

  it('draws the silhouette when the asset holds no rendition of the crop', () => {
    const { container } = render(<RoomPlate scopeId={SCOPE} asset={asset({ crops: {} })} fallback={fallback} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.plate-note')).toHaveTextContent('Photograph to follow.');
  });

  it('refuses a caption carrying banned wording by drawing instead', () => {
    const { container } = render(
      <RoomPlate scopeId={SCOPE} asset={asset({ caption: { what: 'AI render', whose: 'Studio', when: '2026' } })} fallback={fallback} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).not.toMatch(/\bAI\b/);
  });

  it('links the whole sheet to its document', () => {
    render(<SheetPlate scopeId={SCOPE} asset={asset({ sourceKind: 'sheet' })} alt="Sheet A-101" href="#mat" hrefLabel="Open sheet A-101 in Documents" fallback={fallback} />);
    expect(screen.getByRole('link', { name: 'Open sheet A-101 in Documents' })).toHaveAttribute('href', '#mat');
    expect(screen.getByRole('img', { name: 'Sheet A-101' }).getAttribute('src')).toMatch(/\/sheet-\d+\.webp$/);
  });

  it('serves a board from its uncropped board rendition', () => {
    render(<BoardPlate scopeId={SCOPE} asset={asset({ sourceKind: 'board' })} alt="Living room board" fallback={fallback} />);
    expect(screen.getByRole('img', { name: 'Living room board' }).getAttribute('src')).toMatch(/\/board-\d+\.webp$/);
  });

  it('names each swatch by brand and colour', () => {
    render(<SwatchStrip swatches={[{ hex: '#E3DACB', brand: 'Halvorsen', name: 'Morning Oat' }]} />);
    expect(screen.getByText('Halvorsen, Morning Oat')).toBeInTheDocument();
  });
});

describe('preloadLink', () => {
  it('gives one AVIF preload per art-directed hero source', () => {
    const links = preloadLink(SCOPE, asset());
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ rel: 'preload', as: 'image', type: 'image/avif', imageSizes: '100vw', fetchPriority: 'high', media: '(max-width: 600px)' });
    expect(links[0].imageSrcSet).toContain('/cover_phone-1242.avif 1242w');
    expect(links[1].imageSrcSet).toContain('/wide-2560.avif 2560w');
  });

  it('gives nothing when the hero has no rendition', () => {
    expect(preloadLink(SCOPE, asset({ crops: {} }))).toEqual([]);
  });
});

/* SQ-1585 F2: the hero carries floors.ts' desktop layout. Each source below
   holds the crops the media worker (plates.mjs) emits for its size. */
describe("the hero's desktop layout", () => {
  const PHONE = '(max-width: 600px)';
  const MEASURE = {
    width: 1400,
    height: 1000,
    crops: {
      cover_phone: { rect: [127, 0, 1147, 1000], widths: [640, 828, 1080] },
      wide32: { rect: [0, 0, 1400, 933], widths: [768, 1024] },
      pair: { rect: [0, 0, 1400, 1000], widths: [768, 1024] },
      piece: { rect: [0, 0, 1400, 1000], widths: [256, 512, 768] },
    },
  } satisfies Partial<EditorialAsset>;
  const PORTRAIT = {
    width: 1100,
    height: 1900,
    crops: {
      cover_phone: { rect: [0, 376, 1100, 959], widths: [640, 828, 1080] },
      tall: { rect: [113, 0, 874, 1900], widths: [640, 828] },
      piece: { rect: [0, 0, 1100, 1900], widths: [256, 512, 768] },
    },
  } satisfies Partial<EditorialAsset>;

  function drawn(a: EditorialAsset) {
    const { container } = render(
      <HeroPlate scopeId={SCOPE} asset={a} eyebrow="01 · House" headline="The house" fallback={fallback} />,
    );
    const sources = Array.from(container.querySelectorAll('source'));
    return {
      figure: container.querySelector('figure')!,
      img: container.querySelector('img')!,
      phone: sources.filter((s) => s.getAttribute('media') === PHONE),
      desk: sources.filter((s) => s.getAttribute('media') !== PHONE),
    };
  }

  it.each([
    ['bleed', {}, 'wide', SIZES.bleed, [1440, 648]],
    ['measure', MEASURE, 'wide32', SIZES.measure, [1248, 648]],
    ['portrait', PORTRAIT, 'tall', SIZES.portrait, [520, 650]],
  ] as const)('%s: draws its crop at its size, the phone on cover_phone, and preloads the same', (layout, over, crop, sizes, box) => {
    const a = asset(over);
    const { figure, img, phone, desk } = drawn(a);

    expect(figure).toHaveClass('ed-hero', `ed-hero--${layout}`);
    expect(desk.map((s) => s.getAttribute('sizes'))).toEqual([sizes, sizes]);
    expect(desk[0].getAttribute('srcset')).toContain(`/${crop}-`);
    expect(phone[0].getAttribute('srcset')).toContain('/cover_phone-');
    expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(box.map(String));

    const links = preloadLink(SCOPE, a);
    expect(links.map((l) => [l.media, l.imageSizes])).toEqual([
      [PHONE, SIZES.bleed],
      ['(min-width: 601px)', sizes],
    ]);
    expect(links[0].imageSrcSet).toBe(phone[0].getAttribute('srcset'));
    expect(links[1].imageSrcSet).toBe(desk[0].getAttribute('srcset'));
  });

  it('asks for `wide` first on a measure source that has one', () => {
    const { desk } = drawn(asset({ ...MEASURE, crops: { ...MEASURE.crops, wide: ALL_CROPS.wide } }));
    expect(desk[0].getAttribute('srcset')).toContain('/wide-');
  });

  it('draws a portrait with no `tall` on cover_phone at every width, and fails to a portrait silhouette', () => {
    // 1100 × 1400 is under `tall`'s 1696 floor: the worker emits no `tall`.
    const a = asset({
      width: 1100,
      height: 1400,
      crops: {
        cover_phone: { rect: [0, 151, 1100, 959], widths: [640, 828, 1080] },
        piece: { rect: [0, 0, 1100, 1400], widths: [256, 512, 768] },
      },
    });
    const { figure, img, phone, desk } = drawn(a);

    expect(figure).toHaveClass('ed-hero--portrait');
    expect(phone).toHaveLength(0);
    expect(desk.map((s) => [s.getAttribute('media'), s.getAttribute('sizes')])).toEqual([
      [null, SIZES.portrait],
      [null, SIZES.portrait],
    ]);
    expect(desk[0].getAttribute('srcset')).toContain('/cover_phone-');
    expect(preloadLink(SCOPE, a).map((l) => [l.media, l.imageSizes])).toEqual([[undefined, SIZES.portrait]]);

    fireEvent.error(img);
    expect(document.querySelector('figure.ed-silhouette')).toHaveClass('ed-hero', 'ed-hero--portrait');
  });
});

describe('ProvenanceLine', () => {
  it('appears only when the studio shows makers', () => {
    const { container, rerender } = render(
      <ProvenanceLine showMakers={false} maker="Harmon Bench Works" town="Dayton" inProductionSince="12 September 2026" />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<ProvenanceLine showMakers maker="Harmon Bench Works" town="Dayton" inProductionSince="12 September 2026" photographed="15 October 2026" />);
    expect(container).toHaveTextContent('Harmon Bench Works · Dayton · in production since 12 September 2026 · photographed 15 October 2026');
  });
});

describe('ChapterHead', () => {
  it('sets the numeral, eyebrow and headline', () => {
    render(<ChapterHead number="05" label="Living room" headline="Walnut, linen and wool" headingId="living-h" />);
    expect(screen.getByText('05')).toHaveClass('ed-numeral');
    expect(screen.getByRole('heading', { level: 2, name: 'Walnut, linen and wool' })).toHaveAttribute('id', 'living-h');
  });
});

describe('Reveal', () => {
  let trigger: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
  const originalIO = window.IntersectionObserver;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    trigger = null;
    window.IntersectionObserver = class {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        trigger = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000 } as DOMRect);
  });

  afterEach(() => {
    window.IntersectionObserver = originalIO;
    window.matchMedia = originalMatchMedia;
  });

  const tree = (
    <Reveal>
      <p>One</p>
      <p>Two</p>
    </Reveal>
  );

  it('holds a chapter below the fold, then shows it once it scrolls in', () => {
    window.matchMedia = jest.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
    const { container } = render(tree);
    expect(container.firstChild).toHaveAttribute('data-reveal', 'pending');
    act(() => trigger!([{ isIntersecting: true }]));
    expect(container.firstChild).toHaveAttribute('data-reveal', 'shown');
  });

  it('does nothing under reduced motion', () => {
    window.matchMedia = jest.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const { container } = render(tree);
    expect(container.firstChild).toHaveAttribute('data-reveal', 'idle');
    expect(trigger).toBeNull();
  });

  it('never hides a chapter already on screen', () => {
    window.matchMedia = jest.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
    (HTMLElement.prototype.getBoundingClientRect as jest.Mock).mockReturnValue({ top: 10 } as DOMRect);
    const { container } = render(tree);
    expect(container.firstChild).toHaveAttribute('data-reveal', 'idle');
  });
});

 describe('catalogue cover and bed fallback', () => {
  const pair = { rect: [0, 197, 1600, 1143] as const, widths: [768, 1024, 1600] };
  const piece = { rect: [0, 0, 1600, 1600] as const, widths: [256, 512, 768] };
  it.each(['pair', 'piece'] as const)('shows a white-ground %s photograph, not a drawing, with stock and its caption', (crop) => {
    const a = asset({ ground: 'white', lqip: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="purple"/></svg>'), width: 1600, height: 1600, crops: crop === 'pair' ? { pair, piece } : { piece } });
    const { container } = render(<HeroPlate scopeId={SCOPE} asset={a} eyebrow="01 · Man Den" headline="The rooms" fallback={{ name: 'Sierra Queen Bed', category: '.', silhouetteKind: '.' }} />);
    const img = container.querySelector('img')!;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('/' + crop + '-');
    expect(container.querySelector('figure')).toHaveClass('ed-hero--contained');
    expect(container.querySelector('.ed-plate__frame')).toHaveClass('ed-stock');
    expect(container.querySelectorAll('[data-caption-field]')).toHaveLength(3);
    expect(container).not.toHaveTextContent('drawn from the specification');
    expect(container.querySelector('.ed-tab')).toHaveAttribute('data-tab-mode', 'below');
    const link = preloadLink(SCOPE, a)[0];
    expect(link.imageSrcSet).toBe(container.querySelector('source')!.getAttribute('srcset'));
    expect(link.imageSizes).toBe(container.querySelector('source')!.getAttribute('sizes'));
    expect(container.querySelector('.ed-hero-slot')).toHaveStyle({ '--ed-hero-aspect': crop === 'pair' ? String(1600 / 1143) : '1' });
    if (process.env.HERO_CAPTURE_DIR) require('fs').writeFileSync(require('path').join(process.env.HERO_CAPTURE_DIR, crop + '.html'), container.innerHTML);
    fireEvent.error(img);
    expect(screen.getByTestId('piece-silhouette')).toHaveAttribute('data-silhouette', 'bed');
    expect(screen.getByText('Picture did not load.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The rooms' })).toBeInTheDocument();
  });
  it('still draws a scene hero on the bleed path', () => {
    const { container } = render(<HeroPlate scopeId={SCOPE} asset={asset()} eyebrow="01 · House" headline="The rooms" fallback={fallback} />);
    expect(container.querySelector('figure')).toHaveClass('ed-hero--bleed');
    expect(container.querySelector('figure')).not.toHaveClass('ed-hero--contained');
    if (process.env.HERO_CAPTURE_DIR) require('fs').writeFileSync(require('path').join(process.env.HERO_CAPTURE_DIR, 'scene.html'), container.innerHTML);
  });
  it('does not measure a contained hero even when passed a short-frame position', () => {
    const observer = jest.spyOn(window, 'ResizeObserver');
    observer.mockClear();
    render(<HeroPlate scopeId={SCOPE} asset={asset({ ground: 'white', width: 1600, height: 1600, crops: { pair } })} eyebrow="01 · House" headline="Your bed is on the way to the house" phoneObjectPosition="50% 50%" fallback={fallback} />);
    expect(observer).not.toHaveBeenCalled();
    observer.mockRestore();
  });
  it('honours an explicit case kind rather than overriding it with name inference', () => {
    render(<SilhouettePlate name="Sierra Queen Bed" category="case" silhouetteKind="case" />);
    expect(screen.getByTestId('piece-silhouette')).toHaveAttribute('data-silhouette', 'case');
  });
  it('infers a bed when no rendition exists and the reader supplies an unknown category', () => {
    render(<SilhouettePlate name="Sierra Queen Bed" category="." silhouetteKind="." />);
    expect(screen.getByTestId('piece-silhouette')).toHaveAttribute('data-silhouette', 'bed');
  });
 });

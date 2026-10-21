import { render, screen } from '@testing-library/react';

import { heroPreloads } from '@/lib/data/client-editorial';
import type { ClientProjectEditorial, EditorialAsset } from '@/lib/editorial/types';
import type { InvoiceProjection, InvoiceRow } from '@/lib/threshold/invoice-rollup';

import {
  HeroPreloadLinks,
  HouseIssueArrival,
  RoomOpening,
  approvalsRow,
  editionChapters,
  houseIssue,
  ledgerRow,
  letterboxRow,
  withChapter,
} from '../house-issue';
import { preloadLink } from '../hero-plate';

const PROJECT = 'b0000000-0000-0000-0000-0000000e1a01';

const CROPS: EditorialAsset['crops'] = {
  wide: { rect: [0, 0, 2400, 1500], widths: [1280, 1600, 2048] },
  cover_phone: { rect: [300, 0, 1720, 1500], widths: [640, 828, 1080] },
  wide32: { rect: [0, 0, 2400, 1600], widths: [768, 1024, 1600] },
  piece: { rect: [400, 0, 1600, 1600], widths: [256, 512] },
};

function asset(id: string, over: Partial<EditorialAsset> = {}): EditorialAsset {
  return {
    id,
    sha256: id.padStart(64, 'a').slice(-64),
    sourceKind: 'maker',
    width: 2400,
    height: 1600,
    ground: 'scene',
    dominantHex: '#6B4F3A',
    lqip: null,
    focal: null,
    subjectBox: null,
    crops: CROPS,
    caption: { what: 'Walnut sideboard', whose: 'Birchwood Studio', when: '14 October 2026' },
    alt: 'A walnut sideboard against a plaster wall',
    ...over,
  };
}

function editorial(assets: EditorialAsset[]): ClientProjectEditorial {
  return {
    project: {
      id: PROJECT,
      name: 'Elm Street House',
      phase: 'procurement',
      targetDate: null,
      showMakers: false,
      studio: { name: 'Birchwood Studio', town: 'Evanston' },
    } as ClientProjectEditorial['project'],
    rooms: [
      {
        id: 'living',
        name: 'Living room',
        anchor: 'room-living',
        conceptAssetId: null,
        scanAssetIds: [],
        items: [
          {
            id: 'sideboard',
            nameAsSigned: 'Walnut sideboard',
            category: 'storage',
            status: 'in_production',
            material: 'walnut',
            finish: null,
            dimensions: null,
            descriptionAsSigned: null,
            assetIds: assets.map((a) => a.id),
            silhouetteKind: 'case',
          },
          {
            id: 'sofa',
            nameAsSigned: 'Linen sofa',
            category: 'seating',
            status: 'ordered',
            material: null,
            finish: null,
            dimensions: null,
            descriptionAsSigned: null,
            assetIds: [],
            silhouetteKind: 'chair',
          },
        ],
      },
    ],
    assets,
    palette: [{ hex: '#E8E2D6', brand: 'Farrow & Ball', name: 'Pointing' }],
    boards: [],
    sheets: [],
  };
}

const SCENE = asset('scene1');
const WHITE = asset('white1', { width: 1200, height: 1200, ground: 'white', crops: { piece: CROPS.piece } });

function row(over: Partial<InvoiceRow>): InvoiceRow {
  return {
    invoice: {} as InvoiceRow['invoice'],
    group: 'payable',
    balanceCents: 60000,
    currency: 'USD',
    reviewReasons: [],
    contradictory: false,
    paymentInFlight: false,
    paymentsRead: true,
    settled: null,
    dueDate: new Date(2026, 8, 25),
    dueState: 'past_due',
    studio: false,
    ...over,
  };
}

function projection(over: Partial<InvoiceProjection> = {}): InvoiceProjection {
  return {
    read: 'complete',
    readAt: null,
    review: [],
    processing: [],
    payable: [],
    history: [],
    outstanding: [],
    counts: { review: 0, processing: 0, payable: 0, history: 0 } as InvoiceProjection['counts'],
    outstandingTotals: [],
    withheld: null,
    nothingToPay: true,
    allClear: true,
    ...over,
  };
}

describe('the hero preload', () => {
  it('names exactly the sources HeroPlate draws (server restatement pinned to preloadLink)', () => {
    const ed = editorial([SCENE, WHITE]);
    const fromServer = heroPreloads(ed);
    const fromPlate = preloadLink(PROJECT, SCENE).map(({ imageSrcSet, imageSizes, media }) => ({
      imageSrcSet,
      imageSizes,
      ...(media ? { media } : {}),
    }));
    expect(fromServer).toEqual(fromPlate);
    expect(fromServer).toHaveLength(2);
  });

  it('preloads nothing for a drawn cover', () => {
    expect(heroPreloads(editorial([WHITE]))).toEqual([]);
    expect(heroPreloads(null)).toEqual([]);
  });

  it('renders one high-priority avif image preload per source', () => {
    const { container } = render(<HeroPreloadLinks preloads={heroPreloads(editorial([SCENE]))} />);
    const links = document.querySelectorAll('link[rel="preload"][as="image"]');
    expect(links).toHaveLength(2);
    links.forEach((link) => {
      expect(link.getAttribute('type')).toBe('image/avif');
      expect(link.getAttribute('fetchpriority')).toBe('high');
      expect(link.getAttribute('imagesizes')).toBeTruthy();
    });
    container.remove();
  });
});

describe('the issue', () => {
  it('numbers chapters in print order, cover first, skipping sections that did not render', () => {
    const issue = houseIssue(editorial([SCENE]));
    const chapters = editionChapters(issue, ['doorstep', 'approvals', false, 'room-living', 'road', null, 'mat']);
    expect([...chapters.entries()].map(([anchor, c]) => `${c.number} ${anchor}`)).toEqual([
      '01 cover',
      '02 doorstep',
      '03 approvals',
      '04 room-living',
      '05 road',
      '06 mat',
    ]);
    expect(chapters.get('room-living')?.label).toBe('Living room');
  });

  it('hands a section back untouched with the edition off', () => {
    const section = <section id="doorstep" />;
    expect(withChapter(null, 'doorstep', section)).toBe(section);
    expect(withChapter(new Map(), 'doorstep', section)).toBe(section);
    expect(withChapter(null, 'doorstep', null)).toBeNull();
  });

  it('draws the hero when a photograph meets the floor, a drawn cover when none does', () => {
    const withHero = houseIssue(editorial([SCENE]));
    const { container, unmount } = render(
      <HouseIssueArrival issue={withHero} chapters={editionChapters(withHero, [])} rows={null} plan={null} />,
    );
    expect(container.querySelector('[data-testid="house-issue-hero"] figure.ed-hero')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="house-issue-hero"] [data-caption-field]')).toHaveLength(3);
    expect(screen.queryByTestId('house-issue-cover')).toBeNull();
    unmount();

    const drawn = houseIssue(editorial([WHITE]));
    render(<HouseIssueArrival issue={drawn} chapters={editionChapters(drawn, [])} rows={null} plan={null} />);
    expect(screen.queryByTestId('house-issue-hero')).toBeNull();
    expect(screen.getByTestId('house-issue-cover')).toHaveTextContent('Elm Street House');
    // The paint chips stand on the drawn cover when there is no hero.
    expect(screen.getByTestId('house-issue-cover')).toHaveTextContent('Pointing');
  });

  it('holds the standing rows’ place until the house has spoken, then links all three', () => {
    const issue = houseIssue(editorial([SCENE]));
    const chapters = editionChapters(issue, []);
    const { rerender } = render(<HouseIssueArrival issue={issue} chapters={chapters} rows={null} plan={null} />);
    expect(screen.getByTestId('standing-rows-held')).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelectorAll('[data-standing-row]')).toHaveLength(0);
    rerender(
      <HouseIssueArrival
        issue={issue}
        chapters={chapters}
        rows={{ letterbox: { sentence: null }, approvals: { sentence: null }, ledger: { sentence: null } }}
        plan={null}
      />,
    );
    expect([...document.querySelectorAll('[data-standing-row]')].map((a) => a.getAttribute('href'))).toEqual([
      '#letterbox',
      '#approvals',
      '#ledger',
    ]);
  });

  it('opens a room with at most three revealed children: head, plate, pieces; silhouettes for pieces with no photograph', () => {
    const issue = houseIssue(editorial([SCENE, WHITE]));
    const chapters = editionChapters(issue, ['room-living']);
    const { container } = render(<RoomOpening issue={issue} chapters={chapters} roomId="living" />);
    const reveal = container.querySelector('.ed-reveal')!;
    expect(reveal.children.length).toBeLessThanOrEqual(3);
    expect(reveal.querySelector('.ed-chapter-head')).toHaveTextContent('Living room');
    expect(container.querySelector('[data-dimmable]')).toBeNull();
    const pieces = container.querySelectorAll('ul[aria-label^="Pieces"] > li');
    expect(pieces).toHaveLength(2);
    // The sofa has no plate asset: drawn, and no picture is asked for.
    expect(pieces[1].querySelector('[data-plate="silhouette"]')).not.toBeNull();
    expect(pieces[1].querySelector('img, source')).toBeNull();
  });

  it('opens nothing with the edition off', () => {
    const { container } = render(<RoomOpening issue={null} chapters={null} roomId="living" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the standing rows, in words', () => {
  const MEASURE = /\b\d+\s*\/\s*\d+\b|\d+%/;

  it('row 1 names the first payable amount and when it was due', () => {
    const r = letterboxRow(projection({ payable: [row({})], nothingToPay: false, allClear: false }));
    expect(r).toEqual({ sentence: '$600.00 was due on 25 September.', amountAct: true });
    expect(letterboxRow(projection({ payable: [row({ dueState: 'due_today' })] })).sentence).toBe('$600.00 is due today.');
    expect(letterboxRow(projection({ payable: [row({ dueDate: null, dueState: null })] })).sentence).toBe('$600.00 is ready to pay.');
  });

  it('row 1 is zero when nothing is payable, and says a failed read rather than zero', () => {
    expect(letterboxRow(projection())).toEqual({ sentence: null });
    expect(letterboxRow(projection({ read: 'failed' })).sentence).toBe('Your invoices could not be read just now.');
    expect(letterboxRow(projection({ processing: [row({ group: 'processing' })] })).sentence).toBe(
      'Your payment is on its way to the studio.',
    );
  });

  it('row 2 names the one approval, counts several in words, and names a gate', () => {
    expect(approvalsRow({ asks: [{ artifactTitle: 'Sofa, edition 2' }], gate: null, readFailed: false }).sentence).toBe(
      'Waiting for your approval: Sofa, edition 2.',
    );
    expect(approvalsRow({ asks: [{}, {}], gate: null, readFailed: false }).sentence).toBe('Two approvals are waiting for you.');
    expect(approvalsRow({ asks: [], gate: 'door', readFailed: false }).sentence).toBe('A document is waiting for your signature.');
    expect(approvalsRow({ asks: [], gate: null, readFailed: true }).sentence).toBe('The approvals could not be read just now.');
    expect(approvalsRow({ asks: [], gate: null, readFailed: false })).toEqual({ sentence: null });
  });

  it('row 3 counts open invoices in words with one currency’s total, never a measure', () => {
    const six = projection({
      outstandingTotals: [{ currency: 'USD', cents: 137500, invoiceCount: 6 }],
      allClear: false,
    });
    const sentence = ledgerRow(six).sentence!;
    expect(sentence).toBe('Six invoices are open, $1,375.00 in all.');
    expect(sentence).not.toMatch(MEASURE);
    expect(
      ledgerRow(
        projection({
          outstandingTotals: [
            { currency: 'USD', cents: 100, invoiceCount: 1 },
            { currency: 'EUR', cents: 100, invoiceCount: 1 },
          ],
          allClear: false,
        }),
      ).sentence,
    ).toBe('Two invoices are open.');
    expect(ledgerRow(projection())).toEqual({ sentence: null });
    expect(ledgerRow(projection({ withheld: {} as InvoiceProjection['withheld'], allClear: false })).sentence).toBe(
      'Your invoices are being checked.',
    );
  });
});

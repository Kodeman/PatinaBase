import { render, screen } from '@testing-library/react';
import { PressBandPreview, GALLERY_FRAMES, galleryCropWindow, gallerySourcePosition } from '../press-band-preview';
import { galleryRendition } from '../../../../../client-portal/src/lib/editorial/gallery-picture';
import type { EditorialAsset } from '../../../../../client-portal/src/lib/editorial/types';

// Full-source fixtures are already normalized. Stub URL assembly, not galleryRendition's crop calculation.
jest.mock('../../../../../client-portal/src/lib/editorial/crop', () => ({
  normalised: (rect: readonly number[]) => rect,
  platePicture: () => ({ sources: [], src: 'plate.webp' }),
}));
import { editionRow, imageRow, composition, listEnvelope } from '../__fixtures__/client-editions';

const { normalizeClientEditions } = jest.requireActual<typeof import('@patina/supabase')>('@patina/supabase');

const edition = (headline: string, images: Record<string, unknown>[] = []) => normalizeClientEditions(listEnvelope([
  editionRow({ composition: composition('hero', { chapters: [{ key: 'cover', headline, standing: 'The sideboard is taking shape.' }] }), images }),
]) as never).editions[0];

it.each(['One two three four five six seven', 'A beautifully proportioned sideboard in walnut'])('falls back to the house name for an overlong headline: %s', (headline) => {
  const { container } = render(<PressBandPreview edition={edition(headline)} current={null} sourceUrls={{}} houseName="Elm Street House" />);
  const bands = container.querySelectorAll('[data-gallery-band]');
  expect(bands).toHaveLength(2);
  for (const band of bands) {
    expect(band).toHaveTextContent('Elm Street House');
    expect(band).not.toHaveTextContent(headline);
  }
  expect(screen.getByText('The cover headline is too long for the band, so the house name is shown instead.')).toBeInTheDocument();
});

it('uses full-height palette stripes, not a weak hero or a drawing, when no photograph qualifies', () => {
  const { container } = render(<PressBandPreview edition={edition('Your sideboard, on the bench', [imageRow('hero', { width: 1999 })])} current={null} sourceUrls={{ hero: 'https://example.com/hero.jpg' }} palette={[{ hex: '#E6DCC8', name: 'Morning Oat' }, { hex: '#6E7458', name: 'Bur Oak' }]} />);
  expect(container.querySelector('[data-press-cover]')).toBeNull();
  const cards = container.querySelectorAll('[data-gallery-paint]');
  expect(cards).toHaveLength(2);
  for (const card of cards) {
    expect(card).toHaveAccessibleName('The house palette: Morning Oat, Bur Oak');
    expect(card.children).toHaveLength(2);
    expect(card.children[0]).toHaveStyle({ backgroundColor: '#E6DCC8' });
    expect(card.children[1]).toHaveStyle({ backgroundColor: '#6E7458' });
  }
  expect(screen.queryByText(/The cover is a drawing/)).toBeNull();
});

it('shows eligible source crops at both arrival aspects with the focal point and the sample asks line', () => {
  const { container } = render(<PressBandPreview edition={edition('Your sideboard, on the bench', [imageRow('hero', { plateRole: 'hero', chapterKey: 'cover', focal: [0.3, 0.7] })])} current={null} sourceUrls={{ hero: 'https://example.com/hero.jpg' }} />);
  expect(container.querySelectorAll('[data-press-cover]')).toHaveLength(2);
  expect(container.querySelector('[data-gallery-frame="cover_phone"] [data-press-cover]')).toHaveStyle({ objectPosition: '21.2% 50%' });
  expect(container.querySelector('[data-gallery-frame="wide"] [data-press-cover]')).toHaveStyle({ objectPosition: '50% 100%' });
  for (const band of container.querySelectorAll('[data-gallery-band]')) expect(band).toHaveTextContent('Your sideboard, on the bench');
  expect(screen.getByText('The muted line is a sample; invoices and approvals supply the live words.')).toBeInTheDocument();
  expect(screen.getByText('Phone · 390 × 796')).toBeInTheDocument();
  expect(screen.getByText('Laptop · 1440 × 852')).toBeInTheDocument();
});

it.each(GALLERY_FRAMES)('matches the client full-source rendition for $width × $height and live focal edits', (frame) => {
  const row = edition('The living room', [imageRow('hero', { width: 2400, height: 1600, plateRole: 'hero', chapterKey: 'cover', subjectBox: [0.6, 0.3, 0.2, 0.4], focal: [0.7, 0.6] })]);
  const image = row.images[0];
  const asset: EditorialAsset = {
    id: image.assetId, sha256: 'a'.repeat(64), sourceKind: 'installed', width: 2400, height: 1600,
    ground: 'scene', dominantHex: null, lqip: null, focal: [0.7, 0.6], subjectBox: [0.6, 0.3, 0.2, 0.4],
    crops: { wide: { rect: [0, 0, 1, 1], widths: [2400] } }, caption: { what: null, whose: null, when: null }, alt: null,
  };
  const aspect = frame.width / frame.height;
  const { container, rerender } = render(<PressBandPreview edition={row} current={null} sourceUrls={{ hero: 'hero.jpg' }} />);
  for (const point of [[0.7, 0.6], [0.62, 0.35]] as const) {
    const client = galleryRendition('house', { ...asset, focal: point }, aspect);
    expect(client).not.toBeNull();
    expect(gallerySourcePosition(image, aspect, [...point])).toBe(client?.position);
    rerender(<PressBandPreview edition={row} current={null} sourceUrls={{ hero: 'hero.jpg' }} focal={{ assetId: 'hero', point: [...point] }} />);
    expect(container.querySelector(`[data-gallery-frame="${frame.key}"] [data-press-cover]`)).toHaveStyle({ objectPosition: client!.position });
    const window = galleryCropWindow(image, aspect, [...point]);
    const [x, y] = client!.position.split(' ').map((value) => parseFloat(value) / 100);
    expect(window.left).toBeCloseTo((1 - window.vx) * x);
    expect(window.top).toBeCloseTo((1 - window.vy) * y);
  }
});

it('uses the paint card when the subject cannot fit both Gallery frames', () => {
  const { container } = render(<PressBandPreview edition={edition('The living room', [imageRow('hero', { subjectBox: [0, 0, 1, 1] })])} current={null} sourceUrls={{ hero: 'hero.jpg' }} />);
  expect(container.querySelectorAll('[data-gallery-paint]')).toHaveLength(2);
  expect(container.querySelector('[data-press-cover]')).toBeNull();
});

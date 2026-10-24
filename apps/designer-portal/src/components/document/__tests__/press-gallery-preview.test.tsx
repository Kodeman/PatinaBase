import { render, screen } from '@testing-library/react';
import { PressBandPreview } from '../press-band-preview';
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
  for (const image of container.querySelectorAll('[data-press-cover]')) expect(image).toHaveStyle({ objectPosition: '30% 70%' });
  for (const band of container.querySelectorAll('[data-gallery-band]')) expect(band).toHaveTextContent('Your sideboard, on the bench');
  expect(screen.getByText('The muted line is a sample; invoices and approvals supply the live words.')).toBeInTheDocument();
  expect(screen.getByText('Phone · 390 × 796')).toBeInTheDocument();
  expect(screen.getByText('Laptop · 1440 × 852')).toBeInTheDocument();
});

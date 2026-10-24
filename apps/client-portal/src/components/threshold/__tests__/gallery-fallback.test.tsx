import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { RoomBandModel } from '@/lib/threshold/derive';
import { arrivalFixture, bed, smallScene } from '@/lib/editorial/__fixtures__/arrival-fixtures';
import { houseIssue } from '../editorial/house-issue';
import { GalleryPage } from '../gallery-page';
import { GalleryPhoto } from '../gallery-photo';

it('contains the catalogue arrival on white at no more than 1.25 times its served width', () => {
  const { container } = render(<GalleryPhoto scope="edition" asset={bed} palette={[]} arrival />);
  expect(container.querySelector('[data-gallery-mode="contained"]')).toHaveAttribute('data-ground', 'white');
  expect(container.querySelector('[data-gallery-mode="contained"]')).toHaveStyle('--gallery-contained-width: 2000px');
  expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('pair-1600.webp'));
  expect(screen.getByText(/the same model · from the maker’s catalogue|the same model · from the maker's catalogue/)).toBeVisible();
});
it('shows room piece photographs at piece size instead of only a room silhouette', () => {
  const editorial = arrivalFixture([bed, smallScene]);
  editorial.rooms = [{ id: 'room', name: 'Bedroom', anchor: 'room-bedroom', conceptAssetId: null, scanAssetIds: [], items: [
    { id: 'bed-item', nameAsSigned: 'Sierra Queen Bed', category: 'bed', status: null, material: null, finish: null, dimensions: null, descriptionAsSigned: null, silhouetteKind: null, assetIds: ['bed'] },
    { id: 'chair', nameAsSigned: 'Chair', category: 'chair', status: null, material: null, finish: null, dimensions: null, descriptionAsSigned: null, silhouetteKind: null, assetIds: [] },
  ] }];
  const props = { projectName: 'Elm', ready: true, bands: [{ roomId: 'room', name: 'Bedroom', anchor: 'room-bedroom', pieces: [] } as unknown as RoomBandModel],
    issue: houseIssue(editorial), otherHouses: [], pieces: () => null, documents: () => null } as unknown as ComponentProps<typeof GalleryPage>;
  const { container } = render(<GalleryPage {...props} />);
  const chapter = screen.getByRole('region', { name: 'Bedroom' });
  expect(within(chapter).getByRole('img', { name: /Sierra Queen Bed/ }).tagName).toBe('IMG');
  expect(chapter.querySelector('img')).toHaveAttribute('src', expect.stringContaining('piece-768.webp'));
  expect(container.querySelector('.gallery-silhouette')).toBeNull();
  expect(within(chapter).getAllByText('Chair').length).toBeGreaterThan(0);
});

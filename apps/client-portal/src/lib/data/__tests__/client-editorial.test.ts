import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { heroPreloads } from '../client-editorial';
import { arrivalFixture, bed } from '@/lib/editorial/__fixtures__/arrival-fixtures';
import { houseIssue } from '@/components/threshold/editorial/house-issue';
import { GalleryPage } from '@/components/threshold/gallery-page';

jest.mock('server-only', () => ({}));
jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));

it.each(['contained', 'pieces'] as const)('preloads exactly the rendered arrival request in %s mode', (mode) => {
  const editorial = arrivalFixture([bed], mode === 'contained' ? 'bed' : null);
  editorial.rooms = [{ id: 'room', name: 'Bedroom', anchor: 'room-bedroom', conceptAssetId: null, scanAssetIds: [], items: [{
    id: 'item', nameAsSigned: 'Bed', category: 'bed', status: null, material: null, finish: null, dimensions: null, descriptionAsSigned: null, silhouetteKind: null, assetIds: ['bed'],
  }] }];
  if (mode === 'pieces') editorial.rooms[0].items.push(...Array.from({ length: 3 }, (_, index) => ({
    ...editorial.rooms[0].items[0], id: 'repeated-photo-' + index,
  })));
  const props = { projectName: 'Elm', ready: true, bands: [], issue: houseIssue(editorial), otherHouses: [], pieces: () => null, documents: () => null } as unknown as ComponentProps<typeof GalleryPage>;
  const { container } = render(createElement(GalleryPage, props));
  const frame = container.querySelector('.gallery-arrival')!;
  const preloads = heroPreloads(editorial);
  expect(preloads).toHaveLength(1);
  if (mode === 'contained') {
    const image = frame.querySelector('img')!;
    expect(preloads[0].imageSrcSet).toBe(image.getAttribute('src'));
    expect(preloads[0].imageSizes).toBe(image.getAttribute('sizes'));
    expect(preloads[0].imageSrcSet).toContain('.webp');
  } else {
    const source = frame.querySelector('source[type="image/avif"]')!;
    expect(preloads[0].imageSrcSet).toBe(source.getAttribute('srcset'));
    expect(preloads[0].imageSizes).toBe(source.getAttribute('sizes'));
    expect(preloads[0].imageSrcSet).toContain('.avif');
  }
});

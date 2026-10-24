/** @jest-environment node */
import { renderToStaticMarkup } from 'react-dom/server';
import { GalleryPhoto } from '@/components/threshold/gallery-photo';
import { heroPreloads } from '@/lib/data/client-editorial';
import { arrivalFixture, eligibleScene } from '../__fixtures__/arrival-fixtures';

jest.mock('server-only', () => ({}));
jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));

it.each([
  [899, '(max-width: 899px)'],
  [900, '(min-width: 900px)'],
])('cover preload matches SSR picture at %ipx', (_width, media) => {
  const editorial = arrivalFixture([eligibleScene], eligibleScene.id);
  const markup = renderToStaticMarkup(<GalleryPhoto scope="edition" asset={eligibleScene} palette={[]} arrival />);
  const sources = markup.match(/<source\b[^>]+>/g) ?? [];
  const source = sources.find(source => source.includes(`media="${media}"`) && source.includes('type="image/avif"'))!;
  const preload = heroPreloads(editorial).find(source => source.media === media)!;
  expect(preload).toBeDefined();
  expect(source).toContain(`media="${preload.media}"`);
  expect(source).toContain(`srcSet="${preload.imageSrcSet}"`);
  expect(source).toContain(`sizes="${preload.imageSizes}"`);
  expect(preload.imageSrcSet).toContain('wide-2400.avif');
  expect(markup.match(/<img\b[^>]+>/)?.[0]).toContain('wide-2400.webp');
});

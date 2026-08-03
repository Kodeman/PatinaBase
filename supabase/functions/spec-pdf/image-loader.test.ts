// deno-lint-ignore-file no-import-prefix
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { hydrateCompositionImages } from './image-loader.ts';

Deno.test('composition image hydration caches successes and collapses failures to null', async () => {
  let calls = 0;
  const loader = (url: string) => {
    calls += 1;
    return url.includes('missing')
      ? Promise.reject(new Error('not found'))
      : Promise.resolve('data:image/png;base64,cG5n');
  };
  const result = await hydrateCompositionImages(
    [
      { imageUrl: 'https://cdn.example.com/a.png', key: 'a' },
      { imageUrl: 'https://cdn.example.com/a.png', key: 'duplicate' },
      { imageUrl: 'https://cdn.example.com/missing.png', key: 'missing' },
      { imageUrl: null, key: 'none' },
    ],
    loader,
  );
  assertEquals(calls, 2);
  assertEquals(result.map((item) => item.imageDataUrl), [
    'data:image/png;base64,cG5n',
    'data:image/png;base64,cG5n',
    null,
    null,
  ]);
  assertEquals(result.map((item) => item.imageRequested), [
    true,
    true,
    true,
    false,
  ]);
});

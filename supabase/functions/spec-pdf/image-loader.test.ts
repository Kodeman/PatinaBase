// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  type PinnedHttpTransport,
  type ResolvedAddress,
  UrlError,
} from '../capture-from-url/ssrf.ts';
import {
  boardStoragePath,
  hydrateCompositionImages,
  loadCompositionImage,
  resolvePrivateBoardImageSources,
  serviceMayResolveBoardProjection,
} from './image-loader.ts';

Deno.test('private board references normalize and resolve before PDF hydration', () => {
  const path = 'owner/boards/board/image.png';
  assertEquals(boardStoragePath(path), path);
  assertEquals(
    boardStoragePath(`https://storage.example/storage/v1/object/public/proposal-mood-boards/${path}?download=1`),
    path,
  );
  assertEquals(boardStoragePath('https://images.example/product.png'), null);
  assertEquals(
    resolvePrivateBoardImageSources(
      [
        { imageUrl: path, key: 'private' },
        { imageUrl: 'https://images.example/product.png', key: 'external' },
      ],
      new Map([[path, 'https://storage.example/signed-image']]),
    ),
    [
      { imageUrl: 'https://storage.example/signed-image', key: 'private' },
      { imageUrl: 'https://images.example/product.png', key: 'external' },
    ],
  );
});

Deno.test('service PDF signing fails closed on an incoherent board projection', async () => {
  const calls: unknown[] = [];
  const allowed = await serviceMayResolveBoardProjection({
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data: false, error: null });
    },
  }, 'board-a');

  assertEquals(allowed, false);
  assertEquals(calls, [{
    name: 'board_media_projection_is_allowed',
    args: { p_board_id: 'board-a' },
  }]);
});

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

Deno.test('composition image fetch pins the validated address across a DNS rebind', async () => {
  const publicAddress: ResolvedAddress = { address: '1.1.1.1', family: 4 };
  let resolverCalls = 0;
  let transportCalls = 0;
  const transport: PinnedHttpTransport = {
    request(url, address, options) {
      transportCalls += 1;
      assertEquals(url.hostname, 'images.example.com');
      assertEquals(address, publicAddress);
      assertEquals(options.timeoutMs, 5_000);
      assertEquals(options.maxBytes, 5 * 1024 * 1024);
      assertEquals(options.headers.accept, 'image/png,image/jpeg');
      assertEquals(options.allowedContentTypes, ['image/png', 'image/jpeg']);
      return Promise.resolve(
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          headers: { 'content-type': 'image/png' },
        }),
      );
    },
  };

  const result = await loadCompositionImage(
    'https://images.example.com/product.png',
    {
      resolver: () => {
        resolverCalls += 1;
        return Promise.resolve(
          resolverCalls === 1
            ? [publicAddress]
            : [{ address: '10.0.0.1', family: 4 }],
        );
      },
      transport,
    },
  );

  assertEquals(resolverCalls, 1);
  assertEquals(transportCalls, 1);
  assertEquals(result, 'data:image/png;base64,iVBORw==');
});

Deno.test('composition image redirects are revalidated before connecting', async () => {
  let transportCalls = 0;
  const transport: PinnedHttpTransport = {
    request() {
      transportCalls += 1;
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data' },
        }),
      );
    },
  };

  const error = await assertRejects(
    () =>
      loadCompositionImage('https://images.example.com/product.png', {
        resolver: () => Promise.resolve([{ address: '1.1.1.1', family: 4 }]),
        transport,
      }),
    UrlError,
    'blocked_host',
  );

  assertEquals(error.status, 400);
  assertEquals(transportCalls, 1);
});

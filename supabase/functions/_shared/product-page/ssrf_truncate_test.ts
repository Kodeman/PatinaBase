// deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/product-page/
//
// SQ-366 F10: the deck path reads the first maxBytes of a large page instead
// of a 413; capture-from-url (no `truncate`) still refuses it.
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type ByteReader,
  fetchHtml,
  type PinnedHttpTransport,
  type PinnedRequestOptions,
  PinnedTransportError,
  readPinnedHttpResponse,
  UrlError,
} from './ssrf.ts';

class Reader implements ByteReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array, private readonly fragment = 4096) {}
  read(buffer: Uint8Array): Promise<number | null> {
    if (this.offset >= this.bytes.length) return Promise.resolve(null);
    const n = Math.min(buffer.length, this.fragment, this.bytes.length - this.offset);
    buffer.set(this.bytes.subarray(this.offset, this.offset + n));
    this.offset += n;
    return Promise.resolve(n);
  }
}

const enc = new TextEncoder();
const head = 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n';

function raw(text: string, fragment?: number): Reader {
  return new Reader(enc.encode(text), fragment);
}

Deno.test('F10: a declared length past maxBytes returns the prefix when truncating', async () => {
  const body = 'a'.repeat(100);
  const res = await readPinnedHttpResponse(raw(`${head}Content-Length: 100\r\n\r\n${body}`), {
    maxBytes: 40,
    truncate: true,
  });
  assertEquals(await res.text(), 'a'.repeat(40));
});

Deno.test('F10: without truncate a declared length past maxBytes is still too_large', async () => {
  await assertRejects(
    () => readPinnedHttpResponse(raw(`${head}Content-Length: 100\r\n\r\n${'a'.repeat(100)}`), { maxBytes: 40 }),
    PinnedTransportError,
    'too_large',
  );
});

Deno.test('F10: a chunked body past maxBytes is cut at maxBytes when truncating', async () => {
  const chunk = (s: string) => `${s.length.toString(16)}\r\n${s}\r\n`;
  const text = `${head}Transfer-Encoding: chunked\r\n\r\n${chunk('x'.repeat(30))}${chunk('y'.repeat(30))}0\r\n\r\n`;
  const res = await readPinnedHttpResponse(raw(text, 7), { maxBytes: 40, truncate: true });
  assertEquals(await res.text(), 'x'.repeat(30) + 'y'.repeat(10));
  await assertRejects(
    () => readPinnedHttpResponse(raw(text, 7), { maxBytes: 40 }),
    PinnedTransportError,
    'too_large',
  );
});

Deno.test('F10: a close-delimited body past maxBytes is cut at maxBytes when truncating', async () => {
  const res = await readPinnedHttpResponse(raw(`${head}\r\n${'z'.repeat(100)}`, 9), {
    maxBytes: 40,
    truncate: true,
  });
  assertEquals(await res.text(), 'z'.repeat(40));
});

Deno.test('F10: the chunk-count cap scales with maxBytes (5MB admits more than 4096 small chunks)', async () => {
  const chunks = 5000;
  const piece = '1\r\nq\r\n';
  const text = `${head}Transfer-Encoding: chunked\r\n\r\n${piece.repeat(chunks)}0\r\n\r\n`;
  const res = await readPinnedHttpResponse(raw(text), { maxBytes: 5 * 1024 * 1024 });
  assertEquals((await res.text()).length, chunks);
  // At capture's 2MB the 4096-chunk cap is unchanged.
  await assertRejects(
    () => readPinnedHttpResponse(raw(text), { maxBytes: 2 * 1024 * 1024 }),
    PinnedTransportError,
  );
});

const resolver = () => Promise.resolve([{ address: '93.184.216.34', family: 4 as const }]);

function transport(body: string, seen: PinnedRequestOptions[]): PinnedHttpTransport {
  return {
    request: (_url, _address, options) => {
      seen.push(options);
      return Promise.resolve(
        new Response(body, { headers: { 'content-type': 'text/html', 'content-length': String(body.length) } }),
      );
    },
  };
}

Deno.test('F10: fetchHtml with truncate parses the prefix of a large page instead of a 413', async () => {
  const seen: PinnedRequestOptions[] = [];
  const body = '<title>Sofa</title>' + 'p'.repeat(200);
  const out = await fetchHtml('https://shop.example/p/1', { resolver, transport: transport(body, seen) }, {
    maxBytes: 50,
    truncate: true,
  });
  assertEquals(out.html, body.slice(0, 50));
  assertEquals(seen[0].truncate, true);
});

Deno.test('F10: fetchHtml without truncate still answers 413, and sends no truncate option', async () => {
  const seen: PinnedRequestOptions[] = [];
  const error = await assertRejects(
    () => fetchHtml('https://shop.example/p/1', { resolver, transport: transport('p'.repeat(200), seen) }, {
      maxBytes: 50,
    }),
    UrlError,
  );
  assertEquals(error.status, 413);
  assertEquals('truncate' in seen[0], false);
});

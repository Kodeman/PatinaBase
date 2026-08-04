// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  type ByteReader,
  PinnedTransportError,
  readPinnedHttpResponse,
} from './ssrf.ts';

class FragmentedReader implements ByteReader {
  private offset = 0;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly fragmentBytes = 3,
  ) {}

  read(buffer: Uint8Array): Promise<number | null> {
    if (this.offset >= this.bytes.length) return Promise.resolve(null);
    const count = Math.min(
      buffer.length,
      this.fragmentBytes,
      this.bytes.length - this.offset,
    );
    buffer.set(this.bytes.subarray(this.offset, this.offset + count));
    this.offset += count;
    return Promise.resolve(count);
  }
}

function reader(raw: string, fragmentBytes = 3): FragmentedReader {
  return new FragmentedReader(new TextEncoder().encode(raw), fragmentBytes);
}

Deno.test('pinned parser handles informational and chunked responses', async () => {
  const response = await readPinnedHttpResponse(
    reader(
      'HTTP/1.1 103 Early Hints\r\n' +
        'Link: </style.css>; rel=preload\r\n\r\n' +
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: text/html; charset=utf-8\r\n' +
        'Transfer-Encoding: chunked\r\n\r\n' +
        '4;source=test\r\nWiki\r\n' +
        '5\r\npedia\r\n' +
        '0\r\nX-Trace: safe\r\n\r\n',
    ),
    { maxBytes: 64, allowedContentTypes: ['text/html'] },
  );

  assertEquals(response.status, 200);
  assertEquals(await response.text(), 'Wikipedia');
});

Deno.test('pinned parser constructs null-body 204 and 205 responses', async () => {
  for (const status of [204, 205]) {
    const response = await readPinnedHttpResponse(
      reader(`HTTP/1.1 ${status} Empty\r\nContent-Length: 0\r\n\r\n`),
      { maxBytes: 64 },
    );
    assertEquals(response.status, status);
    assertEquals(response.body, null);
  }
});

Deno.test('pinned parser rejects ambiguous response framing', async () => {
  const hostile = [
    'HTTP/1.1 200 OK\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n',
    'HTTP/1.1 200 OK\r\nContent-Length: 4\r\nContent-Length: 5\r\n\r\ntest',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: gzip, chunked\r\n\r\n0\r\n\r\n',
    'HTTP/1.1 205 Empty\r\nContent-Length: 1\r\n\r\nx',
  ];
  for (const raw of hostile) {
    await assertRejects(
      () => readPinnedHttpResponse(reader(raw), { maxBytes: 64 }),
      PinnedTransportError,
      'failed',
    );
  }
});

Deno.test('pinned parser enforces byte, encoding, and content-type limits', async () => {
  const tooLarge = await assertRejects(
    () =>
      readPinnedHttpResponse(
        reader(
          'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n' +
            'Content-Length: 65\r\n\r\n',
        ),
        { maxBytes: 64, allowedContentTypes: ['text/html'] },
      ),
    PinnedTransportError,
    'too_large',
  );
  assertEquals(tooLarge.reason, 'too_large');

  const compressed = await assertRejects(
    () =>
      readPinnedHttpResponse(
        reader(
          'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n' +
            'Content-Encoding: gzip\r\nContent-Length: 0\r\n\r\n',
        ),
        { maxBytes: 64, allowedContentTypes: ['text/html'] },
      ),
    PinnedTransportError,
    'failed',
  );
  assertEquals(compressed.reason, 'failed');

  const wrongType = await assertRejects(
    () =>
      readPinnedHttpResponse(
        reader(
          'HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\n' +
            'Content-Length: 0\r\n\r\n',
        ),
        { maxBytes: 64, allowedContentTypes: ['text/html'] },
      ),
    PinnedTransportError,
    'unsupported_content_type',
  );
  assertEquals(wrongType.reason, 'unsupported_content_type');
});

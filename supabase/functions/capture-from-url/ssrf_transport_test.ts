// deno-lint-ignore-file no-import-prefix
// Runtime compatibility test for the native HTTP pinning layer.
// Run with: deno test --allow-net=127.0.0.1 --config ../deno.json ssrf_transport_test.ts

import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { DenoPinnedHttpTransport, PinnedTransportError } from './ssrf.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readRequestHeaders(connection: Deno.Conn): Promise<string> {
  let request = '';
  const buffer = new Uint8Array(2_048);
  while (!request.includes('\r\n\r\n')) {
    const count = await connection.read(buffer);
    if (count === null) break;
    request += decoder.decode(buffer.subarray(0, count), { stream: true });
  }
  return request;
}

Deno.test('native pinned transport connects to the vetted IP and preserves Host', async () => {
  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  let connection: Deno.Conn | undefined;
  let requestHeaders = '';
  const server = (async () => {
    connection = await listener.accept();
    requestHeaders = await readRequestHeaders(connection);
    await connection.write(
      encoder.encode(
        'HTTP/1.1 200 OK\r\n' +
          'Content-Type: text/plain\r\n' +
          'Content-Length: 6\r\n' +
          'Connection: close\r\n\r\n' +
          'pinned',
      ),
    );
    connection.close();
    connection = undefined;
  })();

  try {
    const response = await new DenoPinnedHttpTransport().request(
      new URL(`http://public.invalid:${port}/asset`),
      { address: '127.0.0.1', family: 4 },
      { headers: { accept: 'text/plain' }, timeoutMs: 2_000, maxBytes: 64 },
    );
    await server;

    assertEquals(response.status, 200);
    assertEquals(await response.text(), 'pinned');
    assertStringIncludes(requestHeaders, 'GET /asset HTTP/1.1');
    assertStringIncludes(requestHeaders, `Host: public.invalid:${port}`);
  } finally {
    connection?.close();
    listener.close();
  }
});

Deno.test('native pinned transport closes a slow response at its absolute deadline', async () => {
  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  let connection: Deno.Conn | undefined;
  const server = (async () => {
    connection = await listener.accept();
    await readRequestHeaders(connection);
    await new Promise((resolve) => setTimeout(resolve, 75));
    try {
      await connection.write(
        encoder.encode(
          'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok',
        ),
      );
    } catch {
      // The expected deadline closes the client half first.
    }
    connection.close();
    connection = undefined;
  })();

  try {
    const error = await assertRejects(
      () =>
        new DenoPinnedHttpTransport().request(
          new URL(`http://slow.invalid:${port}/asset`),
          { address: '127.0.0.1', family: 4 },
          { headers: {}, timeoutMs: 20, maxBytes: 64 },
        ),
      PinnedTransportError,
      'timeout',
    );
    assertEquals(error.reason, 'timeout');
    await server;
  } finally {
    connection?.close();
    listener.close();
  }
});

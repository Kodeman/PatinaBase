// deno-lint-ignore-file no-import-prefix
// Deno tests for the PURE SSRF classifiers. No network — runs WITHOUT
// --allow-net. Run: deno test ssrf_test.ts --no-check
//
// Exercises isBlockedAddress (IPv4 + IPv6, incl. v4-mapped) and assertSafeUrl
// against a hostile matrix. Non-standard IPv4 encodings (decimal / hex / octal)
// are normalized to dotted-quad by the WHATWG URL parser before assertSafeUrl
// sees them, so the literal-IP block catches them too.

import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  assertSafeUrl,
  fetchHtml,
  hostToIpLiteral,
  isBlockedAddress,
  type PinnedHttpTransport,
  type ResolvedAddress,
  UrlError,
} from './ssrf.ts';

// ─── isBlockedAddress · IPv4 ──────────────────────────────────────────────────

Deno.test('isBlockedAddress · blocked IPv4 ranges', () => {
  const blocked = [
    '0.0.0.0',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '169.254.169.254', // cloud metadata
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
  ];
  for (const ip of blocked) {
    assert(isBlockedAddress(ip), `${ip} should be blocked`);
  }
});

Deno.test('isBlockedAddress · allowed (public) IPv4', () => {
  const allowed = [
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34', // example.com
    '11.0.0.1',
    '100.63.255.255', // just below CGNAT 100.64/10
    '100.128.0.1', // just above CGNAT
    '172.15.255.255', // just below 172.16/12
    '172.32.0.1', // just above 172.16/12
    '169.253.0.1', // adjacent to link-local, not in 169.254/16
  ];
  for (const ip of allowed) {
    assert(!isBlockedAddress(ip), `${ip} should be allowed`);
  }
});

// ─── isBlockedAddress · IPv6 ──────────────────────────────────────────────────

Deno.test('isBlockedAddress · blocked IPv6 (incl. v4-mapped + zone)', () => {
  const blocked = [
    '::', // unspecified
    '::1', // loopback
    'fc00::1', // unique-local
    'fd12:3456::1', // unique-local
    'fe80::1', // link-local
    'fe80::1%eth0', // link-local with zone id
    'febf::1', // top of fe80::/10
    '64:ff9b::808:808', // NAT64 well-known prefix
    '64:ff9b:1::1', // local-use translation
    '100::1', // discard-only
    '2001::1', // Teredo
    '2001:2::1', // benchmark
    '2001:10::1', // ORCHID
    '2001:db8::1', // documentation
    '2002:0808:0808::1', // 6to4
    '2001:100::1', // unassigned IETF protocol block
    '3fff::1', // documentation
    '5f00::1', // non-global SRv6 SID space
    'fec0::1', // deprecated site-local
    '4000::1', // reserved outside current global unicast
    'ff02::1', // multicast
    '::ffff:127.0.0.1', // v4-mapped loopback
    '::ffff:10.0.0.1', // v4-mapped private
    '::ffff:169.254.169.254', // v4-mapped metadata
    '::ffff:8.8.8.8', // reject mapped forms wholesale
  ];
  for (const ip of blocked) {
    assert(isBlockedAddress(ip), `${ip} should be blocked`);
  }
});

Deno.test('isBlockedAddress · allowed (public) IPv6', () => {
  const allowed = [
    '2606:4700:4700::1111', // cloudflare
    '2001:4860:4860::8888', // google
    '2a00:1450:4009:80b::200e',
  ];
  for (const ip of allowed) {
    assert(!isBlockedAddress(ip), `${ip} should be allowed`);
  }
});

Deno.test('isBlockedAddress · unparseable fails closed', () => {
  assert(isBlockedAddress('not-an-ip'));
  assert(isBlockedAddress('999.1.1.1'));
  assert(isBlockedAddress('1:2:3:4:5:6:7::8'));
});

// ─── hostToIpLiteral ──────────────────────────────────────────────────────────

Deno.test('hostToIpLiteral · literals vs names', () => {
  assertEquals(hostToIpLiteral('127.0.0.1'), '127.0.0.1');
  assertEquals(hostToIpLiteral('[::1]'), '::1');
  assertEquals(hostToIpLiteral('example.com'), null);
});

// ─── assertSafeUrl · hostile matrix (all must throw) ──────────────────────────

Deno.test('assertSafeUrl · rejects the hostile matrix', () => {
  const hostile = [
    'http://localhost',
    'http://localhost.',
    'http://app.localhost',
    'http://printer.local',
    'https://service.internal/path',
    'http://127.0.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.1',
    'http://192.168.1.1',
    'http://[::1]',
    'http://[fc00::1]',
    'http://[fe80::1]',
    'http://[::ffff:127.0.0.1]', // v4-mapped literal
    'http://2130706433', // decimal 127.0.0.1
    'http://0x7f000001', // hex 127.0.0.1
    'http://017700000001', // octal 127.0.0.1
    'https://user:secret@example.com/private',
    'https://example.com:444/path',
    'http://example.com:443/path',
    'file:///etc/passwd',
    'ftp://x',
    'gopher://evil',
    'data:text/html,<h1>hi</h1>',
    'not a url',
  ];
  for (const u of hostile) {
    assertThrows(
      () => assertSafeUrl(u),
      UrlError,
      undefined,
      `${u} should be rejected`,
    );
  }
});

// ─── assertSafeUrl · legitimate hosts pass the pure gate ──────────────────────

Deno.test('assertSafeUrl · accepts legit http(s) hosts', () => {
  const okCases: Array<[string, string]> = [
    ['https://example.com', 'example.com'],
    ['https://example.com:443/path', 'example.com'],
    ['http://example.com:80/path', 'example.com'],
    ['https://shop.example.com/products/oak-table?ref=1', 'shop.example.com'],
    ['http://93.184.216.34/', '93.184.216.34'], // public IP literal is allowed by the pure gate
  ];
  for (const [u, host] of okCases) {
    const parsed = assertSafeUrl(u);
    assert(parsed instanceof URL);
    assertEquals(parsed.hostname, host);
  }
});

// ─── resolution-to-connection pinning ────────────────────────────────────────

Deno.test('fetchHtml pins the connection to the validated address', async () => {
  const publicAddress: ResolvedAddress = { address: '8.8.8.8', family: 4 };
  let resolverCalls = 0;
  let transportCalls = 0;
  const resolver = (hostname: string) => {
    assertEquals(hostname, 'shop.example.com');
    resolverCalls += 1;
    // A vulnerable validate-then-fetch implementation would resolve again and
    // receive this private answer. The pinned transport must never ask again.
    return Promise.resolve(
      resolverCalls === 1
        ? [publicAddress]
        : [{ address: '127.0.0.1', family: 4 as const }],
    );
  };
  const transport: PinnedHttpTransport = {
    request(url, address, options) {
      transportCalls += 1;
      assertEquals(url.hostname, 'shop.example.com');
      assertEquals(address, publicAddress);
      assertEquals(options.timeoutMs, 5_000);
      assertEquals(options.maxBytes, 2 * 1024 * 1024);
      assertEquals(options.headers.accept, 'text/html,application/xhtml+xml');
      assertEquals(options.allowedContentTypes, ['text/html']);
      return Promise.resolve(
        new Response('<html><title>Oak table</title></html>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      );
    },
  };

  const result = await fetchHtml('https://shop.example.com/products/oak', {
    resolver,
    transport,
  });

  assertEquals(resolverCalls, 1);
  assertEquals(transportCalls, 1);
  assertEquals(result.finalUrl, 'https://shop.example.com/products/oak');
  assert(result.html.includes('Oak table'));
});

Deno.test('fetchHtml rejects a mixed public/private DNS answer before transport', async () => {
  let transportCalled = false;
  const transport: PinnedHttpTransport = {
    request() {
      transportCalled = true;
      return Promise.reject(new Error('must not connect'));
    },
  };

  const error = await assertRejects(
    () =>
      fetchHtml('https://mixed.example.com', {
        resolver: () =>
          Promise.resolve([
            { address: '8.8.8.8', family: 4 },
            { address: '169.254.169.254', family: 4 },
          ]),
        transport,
      }),
    UrlError,
    'blocked_host',
  );

  assertEquals(error.status, 400);
  assertEquals(transportCalled, false);
});

Deno.test('fetchHtml revalidates and repins every redirect hop', async () => {
  const resolutions: string[] = [];
  const connections: Array<{ host: string; address: string }> = [];
  const addresses: Record<string, ResolvedAddress> = {
    'shop.example.com': { address: '8.8.8.8', family: 4 },
    'cdn.example.net': { address: '1.1.1.1', family: 4 },
  };
  const transport: PinnedHttpTransport = {
    request(url, address) {
      connections.push({ host: url.hostname, address: address.address });
      if (url.hostname === 'shop.example.com') {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: 'https://cdn.example.net/final' },
          }),
        );
      }
      return Promise.resolve(
        new Response('<html>final</html>', {
          headers: { 'content-type': 'text/html' },
        }),
      );
    },
  };

  const result = await fetchHtml('https://shop.example.com/start', {
    resolver: (hostname) => {
      resolutions.push(hostname);
      return Promise.resolve([addresses[hostname]]);
    },
    transport,
  });

  assertEquals(resolutions, ['shop.example.com', 'cdn.example.net']);
  assertEquals(connections, [
    { host: 'shop.example.com', address: '8.8.8.8' },
    { host: 'cdn.example.net', address: '1.1.1.1' },
  ]);
  assertEquals(result.finalUrl, 'https://cdn.example.net/final');
});

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
  assertThrows,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { assertSafeUrl, hostToIpLiteral, isBlockedAddress, UrlError } from './ssrf.ts';

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
    '192.168.1.1',
  ];
  for (const ip of blocked) assert(isBlockedAddress(ip), `${ip} should be blocked`);
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
  for (const ip of allowed) assert(!isBlockedAddress(ip), `${ip} should be allowed`);
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
    '::ffff:127.0.0.1', // v4-mapped loopback
    '::ffff:10.0.0.1', // v4-mapped private
    '::ffff:169.254.169.254', // v4-mapped metadata
  ];
  for (const ip of blocked) assert(isBlockedAddress(ip), `${ip} should be blocked`);
});

Deno.test('isBlockedAddress · allowed (public) IPv6', () => {
  const allowed = [
    '2606:4700:4700::1111', // cloudflare
    '2001:4860:4860::8888', // google
    '::ffff:8.8.8.8', // v4-mapped public
  ];
  for (const ip of allowed) assert(!isBlockedAddress(ip), `${ip} should be allowed`);
});

Deno.test('isBlockedAddress · unparseable fails closed', () => {
  assert(isBlockedAddress('not-an-ip'));
  assert(isBlockedAddress('999.1.1.1'));
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
    'http://app.localhost',
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
    'file:///etc/passwd',
    'ftp://x',
    'gopher://evil',
    'data:text/html,<h1>hi</h1>',
    'not a url',
  ];
  for (const u of hostile) {
    assertThrows(() => assertSafeUrl(u), UrlError, undefined, `${u} should be rejected`);
  }
});

// ─── assertSafeUrl · legitimate hosts pass the pure gate ──────────────────────

Deno.test('assertSafeUrl · accepts legit http(s) hosts', () => {
  const okCases: Array<[string, string]> = [
    ['https://example.com', 'example.com'],
    ['https://shop.example.com/products/oak-table?ref=1', 'shop.example.com'],
    ['http://93.184.216.34/', '93.184.216.34'], // public IP literal is allowed by the pure gate
  ];
  for (const [u, host] of okCases) {
    const parsed = assertSafeUrl(u);
    assert(parsed instanceof URL);
    assertEquals(parsed.hostname, host);
  }
});

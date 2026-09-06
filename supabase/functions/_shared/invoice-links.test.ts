import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ensureInvoiceLinkUrl,
  INVOICE_LINK_TOKEN_PATTERN,
  invoiceLinkPath,
  invoiceLinkUrl,
} from './invoice-links.ts';

const TOKEN = 'f'.repeat(64);

Deno.test('invoice links: the token pattern is exactly 64 lowercase hex', () => {
  assertEquals(INVOICE_LINK_TOKEN_PATTERN.test(TOKEN), true);
  assertEquals(INVOICE_LINK_TOKEN_PATTERN.test('0123456789abcdef'.repeat(4)), true);
  for (const bad of ['', TOKEN.slice(1), TOKEN + 'f', TOKEN.toUpperCase(), 'g'.repeat(64), ` ${TOKEN}`]) {
    assertEquals(INVOICE_LINK_TOKEN_PATTERN.test(bad), false, JSON.stringify(bad));
  }
});

Deno.test('invoice links: path and url', () => {
  assertEquals(invoiceLinkPath(TOKEN), `/pay/${TOKEN}`);
  assertEquals(invoiceLinkUrl('https://client.patina.cloud', TOKEN), `https://client.patina.cloud/pay/${TOKEN}`);
  assertEquals(invoiceLinkUrl('https://client.patina.cloud/', TOKEN), `https://client.patina.cloud/pay/${TOKEN}`);
  assertThrows(() => invoiceLinkPath('not-a-token'), Error, 'malformed');
  assertThrows(() => invoiceLinkUrl('https://client.test', TOKEN.toUpperCase()), Error, 'malformed');
});

function rpcClient(result: { data: unknown; error: { message: string } | null } | Error) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (result instanceof Error) return Promise.reject(result);
        return Promise.resolve(result);
      },
    },
  };
}

Deno.test('invoice links: ensureInvoiceLinkUrl asks ensure_invoice_link and builds the url', async () => {
  const { client, calls } = rpcClient({ data: TOKEN, error: null });
  assertEquals(
    await ensureInvoiceLinkUrl(client, 'https://client.test', 'inv-1'),
    `https://client.test/pay/${TOKEN}`
  );
  assertEquals(calls, [{ name: 'ensure_invoice_link', args: { p_invoice_id: 'inv-1' } }]);
});

Deno.test('invoice links: ensureInvoiceLinkUrl is null on every failure shape (the safety valve)', async () => {
  assertEquals(
    await ensureInvoiceLinkUrl(rpcClient({ data: null, error: null }).client, 'https://client.test', 'inv-draft'),
    null
  );
  assertEquals(
    await ensureInvoiceLinkUrl(
      rpcClient({ data: null, error: { message: 'boom' } }).client,
      'https://client.test',
      'inv-1'
    ),
    null
  );
  assertEquals(
    await ensureInvoiceLinkUrl(rpcClient({ data: 'not-a-token', error: null }).client, 'https://client.test', 'inv-1'),
    null
  );
  assertEquals(
    await ensureInvoiceLinkUrl(rpcClient({ data: 42, error: null }).client, 'https://client.test', 'inv-1'),
    null
  );
  assertEquals(
    await ensureInvoiceLinkUrl(rpcClient(new Error('network')).client, 'https://client.test', 'inv-1'),
    null
  );
});

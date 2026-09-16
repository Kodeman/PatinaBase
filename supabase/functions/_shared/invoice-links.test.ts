import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ensureInvoiceLinkUrl,
  INVOICE_LINK_TOKEN_PATTERN,
  invoiceLinkPath,
  invoiceLinkUrl,
  invoiceLetterMustHold,
  invoiceLettersMustHold,
  letterFallbackUrl,
  letterPortalUrl,
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

// ── The address the letters actually use ──────────────────────────────────
//
// `letterPortalUrl` IS what invoice-send:265 and invoice-reminders:353 call —
// the fallback lives beside the helper it guards, so these exercise the real
// producer path rather than a restatement of it.

const CLIENT_PORTAL_URL = 'https://client.patina.cloud';

Deno.test('invoice links: the letters address /pay/<token> when the link mints', async () => {
  const { client, calls } = rpcClient({ data: TOKEN, error: null });
  assertEquals(
    await letterPortalUrl(client, CLIENT_PORTAL_URL, 'inv-1'),
    `https://client.patina.cloud/pay/${TOKEN}`
  );
  // Asked per letter, never cached — a Regenerate is honored by the next send.
  assertEquals(calls, [{ name: 'ensure_invoice_link', args: { p_invoice_id: 'inv-1' } }]);
});

Deno.test('invoice links: the fallback is a page the portal actually has (W4 r6 MAJOR-1)', () => {
  // `/invoices/<id>` is not a route in apps/client-portal/src/app — only
  // `/invoices/[invoiceId]/print` is — and the middleware neither rewrites nor
  // exempts it, so that address was a sign-in bounce into not-found. The
  // letterbox form is the one the Threshold reads (`useNamedInvoice`).
  assertEquals(
    letterFallbackUrl(CLIENT_PORTAL_URL, 'inv-1'),
    'https://client.patina.cloud/?invoice=inv-1'
  );
  assertEquals(letterFallbackUrl('https://client.test/', 'inv-1'), 'https://client.test/?invoice=inv-1');
  // An id is a uuid in production, but the query value is escaped regardless.
  assertEquals(
    letterFallbackUrl(CLIENT_PORTAL_URL, 'inv 1&x=2'),
    'https://client.patina.cloud/?invoice=inv%201%26x%3D2'
  );
});

Deno.test('invoice links: the letters fall back to the letterbox, never a broken address', async () => {
  // A draft/void (null token), a Checkout standing on the address (00636's
  // guard, also a null), an RPC failure, and a throw all fall back (M7).
  for (const result of [
    { data: null, error: null },
    { data: null, error: { message: 'boom' } } as const,
    new Error('network'),
  ]) {
    assertEquals(
      await letterPortalUrl(rpcClient(result).client, CLIENT_PORTAL_URL, 'inv-1'),
      'https://client.patina.cloud/?invoice=inv-1'
    );
  }
});

Deno.test('invoice links: the fallback normalizes a trailing slash on the base', async () => {
  assertEquals(
    await letterPortalUrl(rpcClient({ data: null, error: null }).client, 'https://client.test/', 'inv-1'),
    'https://client.test/?invoice=inv-1'
  );
});

// ── One predicate, asked by both rails (R-BZ, W4 r10 MAJOR-1) ──────────────
//
// The rails used to re-list three of the mint guard's states in TypeScript and
// never learned the fourth, so inside a day of a declined card they shipped a
// letter carrying the SIGNED-IN address to an account-less payer. These prove
// the rails now ask the guard's own predicate and fail closed on it.

Deno.test('invoice links: the hold is whatever invoice_letter_must_hold says', async () => {
  const held = rpcClient({ data: true, error: null });
  assertEquals(await invoiceLetterMustHold(held.client, 'inv-1'), {
    hold: true,
    readable: true,
  });
  assertEquals(held.calls, [
    { name: 'invoice_letter_must_hold', args: { p_invoice_id: 'inv-1' } },
  ]);

  const free = rpcClient({ data: false, error: null });
  assertEquals(await invoiceLetterMustHold(free.client, 'inv-2'), {
    hold: false,
    readable: true,
  });
});

Deno.test('invoice links: an unreadable predicate holds the letter, never releases it', async () => {
  assertEquals(
    await invoiceLetterMustHold(rpcClient({ data: null, error: { message: 'boom' } }).client, 'inv-1'),
    { hold: true, readable: false }
  );
  assertEquals(
    await invoiceLetterMustHold(rpcClient(new Error('network')).client, 'inv-1'),
    { hold: true, readable: false }
  );
});

Deno.test('invoice links: the batched predicate returns the held ids and fails closed', async () => {
  const batch = rpcClient({ data: ['inv-1', 'inv-3'], error: null });
  const answer = await invoiceLettersMustHold(batch.client, ['inv-1', 'inv-2', 'inv-3']);
  assertEquals(answer.readable, true);
  assertEquals([...answer.held].sort(), ['inv-1', 'inv-3']);
  assertEquals(batch.calls, [
    {
      name: 'invoice_letters_must_hold',
      args: { p_invoice_ids: ['inv-1', 'inv-2', 'inv-3'] },
    },
  ]);

  // A row-shaped answer reads the same way rather than silently emptying.
  const rows = rpcClient({ data: [{ candidate: 'inv-9' }], error: null });
  assertEquals([...(await invoiceLettersMustHold(rows.client, ['inv-9'])).held], ['inv-9']);

  // Unreadable: every candidate holds, and the caller is told the scan failed.
  const broken = await invoiceLettersMustHold(
    rpcClient({ data: null, error: { message: 'boom' } }).client,
    ['inv-1', 'inv-2']
  );
  assertEquals(broken.readable, false);
  assertEquals([...broken.held].sort(), ['inv-1', 'inv-2']);

  // Nothing to ask about is not a round trip.
  const empty = rpcClient({ data: [], error: null });
  assertEquals((await invoiceLettersMustHold(empty.client, [])).held.size, 0);
  assertEquals(empty.calls.length, 0);
});

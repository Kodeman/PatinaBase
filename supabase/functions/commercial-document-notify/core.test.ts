import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { renderCommercialEmail } from './core.ts';

Deno.test('client signature clearly requires studio countersignature', () => {
  const email = renderCommercialEmail({
    transition: 'client_signed',
    audience: 'studio',
    documentTitle: 'Lake House Design Services',
    documentKind: 'design_services',
    signerName: 'Jamie Client',
    recipientName: 'Morgan Designer',
    portalUrl: 'https://app.patina.cloud/doc/agreement-1',
    ceilingCents: 2_500_000,
  });

  assertStringIncludes(email.subject, 'Client signed');
  assertStringIncludes(email.html, 'not executed');
  assertStringIncludes(email.html, 'countersigns');
  assertStringIncludes(email.html, '$25,000');
});

Deno.test('client signature receipt does not claim execution', () => {
  const email = renderCommercialEmail({
    transition: 'client_signed',
    audience: 'client',
    documentTitle: 'Lake House Design Services',
    documentKind: 'design_services',
    recipientName: 'Jamie Client',
    counterpartyName: 'Morgan Studio',
    portalUrl: 'https://client.patina.cloud/proposals/agreement-1',
  });

  assertStringIncludes(email.subject, 'Signature received');
  assertStringIncludes(email.html, 'not executed');
  assertStringIncludes(email.html, 'design work is not active');
});

Deno.test('working budget copy cannot imply purchasing authority', () => {
  const email = renderCommercialEmail({
    transition: 'budget_published',
    audience: 'client',
    documentTitle: 'Lake House',
    documentKind: 'design_services',
    recipientName: 'Jamie Client',
    counterpartyName: 'Morgan Studio',
    portalUrl: 'https://client.patina.cloud/budget',
  });

  assertStringIncludes(email.html, 'does not authorize purchasing');
});

Deno.test('furnishings and deposit transitions remain distinct', () => {
  const executed = renderCommercialEmail({
    transition: 'furnishings_executed',
    audience: 'client',
    documentTitle: 'Living Room Wave',
    documentKind: 'furnishings_authorization',
    portalUrl: 'https://client.patina.cloud/proposals/wave-1',
  });
  const deposit = renderCommercialEmail({
    transition: 'deposit_ready',
    audience: 'client',
    documentTitle: 'Living Room Wave',
    documentKind: 'furnishings_authorization',
    portalUrl: 'https://client.patina.cloud/invoices',
  });

  assert(!executed.html.includes('Complete the required deposit'));
  assertStringIncludes(deposit.html, 'Purchasing remains locked');
  assertEquals(deposit.subject, 'Deposit ready: Living Room Wave');
});

Deno.test('trade scope sent copy asks the client to review, not just sign', () => {
  const email = renderCommercialEmail({
    transition: 'trade_scope_sent',
    audience: 'client',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    counterpartyName: 'Morgan Studio',
    portalUrl: 'https://client.patina.cloud/proposals/trade-1',
  });

  assertStringIncludes(email.subject, 'Trade scope ready for review');
  assertStringIncludes(email.html, 'draws, and pricing');
  assertStringIncludes(email.html, 'Review trade scope');
});

Deno.test('trade scope executed copy differs by audience but never conflates deposit payment', () => {
  const clientCopy = renderCommercialEmail({
    transition: 'trade_scope_executed',
    audience: 'client',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    portalUrl: 'https://client.patina.cloud/proposals/trade-1',
  });
  const studioCopy = renderCommercialEmail({
    transition: 'trade_scope_executed',
    audience: 'studio',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    signerName: 'Jamie Client',
    portalUrl: 'https://app.patina.cloud/doc/trade-1',
  });

  assertStringIncludes(clientCopy.subject, 'Trade scope authorized');
  assertStringIncludes(clientCopy.html, 'signed and active');
  assertStringIncludes(studioCopy.subject, 'Trade scope executed');
  assertStringIncludes(studioCopy.html, 'Jamie Client signed');
  assert(!clientCopy.html.includes('Complete the required deposit'));
});

Deno.test('trade scope accepted copy signals the final draw, not payment itself', () => {
  const email = renderCommercialEmail({
    transition: 'trade_scope_accepted',
    audience: 'studio',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    signerName: 'Jamie Client',
    portalUrl: 'https://app.patina.cloud/doc/trade-1',
  });

  assertStringIncludes(email.subject, 'Trade scope accepted');
  assertStringIncludes(email.html, 'Jamie Client accepted');
  assertStringIncludes(email.html, 'final draw is ready to invoice');
});

Deno.test('trade draw ready copy mirrors deposit-ready payment framing', () => {
  const email = renderCommercialEmail({
    transition: 'trade_draw_ready',
    audience: 'client',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    portalUrl: 'https://client.patina.cloud/invoices',
  });

  assertStringIncludes(email.subject, 'Draw invoice ready');
  assertStringIncludes(email.html, 'Patina records the required payment');
});

// ─── paper-channel copy ──────────────────────────────────────────────────────

Deno.test('paper-executed copy names the CLIENT as the one who signed the printed copy, not a mutual online signature', () => {
  const email = renderCommercialEmail({
    transition: 'executed',
    audience: 'client',
    documentTitle: 'Lake House Design Services',
    documentKind: 'design_services',
    counterpartyName: 'Morgan Studio',
    portalUrl: 'https://client.patina.cloud/proposals/agreement-1',
    channel: 'paper',
  });

  assertStringIncludes(email.subject, 'Agreement executed');
  assertStringIncludes(email.html, 'You signed a printed copy');
  assertStringIncludes(email.html, 'Morgan Studio recorded it and has countersigned');
  assert(!email.html.includes('Both you and'));
  assert(!email.html.includes('countersigned paper original'));
});

Deno.test('paper furnishings-executed copy carries the same provenance line as the online copy carries none of', () => {
  const paper = renderCommercialEmail({
    transition: 'furnishings_executed',
    audience: 'client',
    documentTitle: 'Living Room Wave',
    documentKind: 'furnishings_authorization',
    counterpartyName: 'Morgan Studio',
    portalUrl: 'https://client.patina.cloud/proposals/wave-1',
    channel: 'paper',
  });
  const online = renderCommercialEmail({
    transition: 'furnishings_executed',
    audience: 'client',
    documentTitle: 'Living Room Wave',
    documentKind: 'furnishings_authorization',
    portalUrl: 'https://client.patina.cloud/proposals/wave-1',
  });

  assertStringIncludes(paper.html, 'Morgan Studio recorded your signed printed copy');
  assertStringIncludes(paper.html, 'immutable item, quantity, and price snapshot');
  assert(!online.html.includes('recorded your signed printed copy'));
  assert(!paper.html.includes('countersigned paper original'));
});

Deno.test('paper trade-scope-executed copy applies only to the client leg; the studio leg is untouched by the channel', () => {
  const clientPaper = renderCommercialEmail({
    transition: 'trade_scope_executed',
    audience: 'client',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    counterpartyName: 'Morgan Studio',
    portalUrl: 'https://client.patina.cloud/proposals/trade-1',
    channel: 'paper',
  });
  const studioPaper = renderCommercialEmail({
    transition: 'trade_scope_executed',
    audience: 'studio',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    signerName: 'Jamie Client',
    portalUrl: 'https://app.patina.cloud/doc/trade-1',
    channel: 'paper',
  });

  assertStringIncludes(clientPaper.html, 'Morgan Studio recorded your signed printed copy');
  assertStringIncludes(clientPaper.html, 'first draw invoice is on its way');
  assert(!clientPaper.html.includes('countersigned paper original'));
  // A paper-narrowed audience list never actually invokes this leg (see
  // lib.test.ts), but the copy itself stays honest even if it were: it
  // still correctly attributes the signature to the client, not the studio.
  assertStringIncludes(studioPaper.html, 'Jamie Client signed');
});

Deno.test('paper trade-scope-accepted copy tells the client the studio recorded their acceptance, never payment itself', () => {
  const clientPaper = renderCommercialEmail({
    transition: 'trade_scope_accepted',
    audience: 'client',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    counterpartyName: 'Morgan Studio',
    portalUrl: 'https://client.patina.cloud/proposals/trade-1',
    channel: 'paper',
  });

  assertStringIncludes(clientPaper.subject, 'Trade scope accepted');
  assertStringIncludes(clientPaper.html, 'Morgan Studio recorded your signed acceptance');
  assertStringIncludes(clientPaper.html, 'the final payment follows');
  assert(!clientPaper.html.includes('final draw is ready to invoice'));
});

Deno.test('paper trade-scope-accepted copy leaves the studio leg exactly as the online copy reads it', () => {
  const studioPaper = renderCommercialEmail({
    transition: 'trade_scope_accepted',
    audience: 'studio',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    signerName: 'Jamie Client',
    portalUrl: 'https://app.patina.cloud/doc/trade-1',
    channel: 'paper',
  });

  assertStringIncludes(studioPaper.html, 'Jamie Client accepted');
  assertStringIncludes(studioPaper.html, 'final draw is ready to invoice');
});

Deno.test('the attached-scan line appears only when hasScan is true, and only on paper copy', () => {
  const withScan = renderCommercialEmail({
    transition: 'furnishings_executed',
    audience: 'client',
    documentTitle: 'Living Room Wave',
    documentKind: 'furnishings_authorization',
    portalUrl: 'https://client.patina.cloud/proposals/wave-1',
    channel: 'paper',
    hasScan: true,
  });
  const withoutScan = renderCommercialEmail({
    transition: 'furnishings_executed',
    audience: 'client',
    documentTitle: 'Living Room Wave',
    documentKind: 'furnishings_authorization',
    portalUrl: 'https://client.patina.cloud/proposals/wave-1',
    channel: 'paper',
    hasScan: false,
  });
  const onlineIgnoresHasScan = renderCommercialEmail({
    transition: 'furnishings_executed',
    audience: 'client',
    documentTitle: 'Living Room Wave',
    documentKind: 'furnishings_authorization',
    portalUrl: 'https://client.patina.cloud/proposals/wave-1',
    hasScan: true,
  });

  assertStringIncludes(withScan.html, 'scanned copy of the signed paper original');
  assert(!withoutScan.html.includes('scanned copy'));
  assert(!onlineIgnoresHasScan.html.includes('scanned copy'));
});

Deno.test('the attached-scan line also appears on a paper trade-scope-accepted notice when hasScan is true', () => {
  const withScan = renderCommercialEmail({
    transition: 'trade_scope_accepted',
    audience: 'client',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    portalUrl: 'https://client.patina.cloud/proposals/trade-1',
    channel: 'paper',
    hasScan: true,
  });
  const withoutScan = renderCommercialEmail({
    transition: 'trade_scope_accepted',
    audience: 'client',
    documentTitle: 'Kitchen Millwork',
    documentKind: 'trade_scope',
    portalUrl: 'https://client.patina.cloud/proposals/trade-1',
    channel: 'paper',
    hasScan: false,
  });

  assertStringIncludes(withScan.html, 'scanned copy of the signed paper original');
  assert(!withoutScan.html.includes('scanned copy'));
});

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
    portalUrl: 'https://client.patina.cloud/projects/project-1#ledger',
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
    portalUrl: 'https://client.patina.cloud/projects/project-1#letterbox',
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
    portalUrl: 'https://client.patina.cloud/projects/project-1#letterbox',
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

Deno.test('the studio signs the client copy; Patina still signs the studio copy (R7)', () => {
  const clientCopy = renderCommercialEmail({
    transition: 'executed',
    audience: 'client',
    documentTitle: 'Lake House Design Services',
    documentKind: 'design_services',
    recipientName: 'Jamie Client',
    counterpartyName: 'Morgan Studio',
    portalUrl: 'https://client.patina.cloud/proposals/agreement-1',
    signature: {
      designerGivenName: 'Morgan',
      studioName: 'Morgan Studio',
      city: 'Madison',
    },
  });
  assertStringIncludes(clientCopy.html, '&mdash; Morgan, Morgan Studio<br>Madison');
  assert(!clientCopy.html.includes('— Patina'));

  const studioCopy = renderCommercialEmail({
    transition: 'executed',
    audience: 'studio',
    documentTitle: 'Lake House Design Services',
    documentKind: 'design_services',
    recipientName: 'Morgan Designer',
    portalUrl: 'https://app.patina.cloud/doc/agreement-1',
  });
  assertStringIncludes(studioCopy.html, '— Patina');
});

Deno.test('a client-addressed commercial letter resolves the client portal (P-03b)', () => {
  const clientCopy = renderCommercialEmail({
    transition: 'executed',
    audience: 'client',
    documentTitle: 'Lake House Design Services',
    documentKind: 'design_services',
    recipientName: 'Jamie Client',
    portalUrl: 'https://client.patina.cloud/proposals/agreement-1',
  });
  assert(!clientCopy.html.includes('>Dashboard</a>'));
  assertStringIncludes(clientCopy.html, '>Your project</a>');
  // With no signature to render, the letter goes unsigned rather than
  // signed "Patina".
  assert(!clientCopy.html.includes('&mdash; '));

  const studioCopy = renderCommercialEmail({
    transition: 'executed',
    audience: 'studio',
    documentTitle: 'Lake House Design Services',
    documentKind: 'design_services',
    recipientName: 'Morgan Designer',
    portalUrl: 'https://app.patina.cloud/doc/agreement-1',
  });
  assertStringIncludes(studioCopy.html, '>Dashboard</a>');
});

Deno.test('agreement draw ready copy names the retainage held back, and never a figure', () => {
  const email = renderCommercialEmail({
    transition: 'agreement_draw_ready',
    audience: 'client',
    documentTitle: 'Halvorsen kitchen and mudroom',
    documentKind: 'design_build',
    portalUrl: 'https://client.patina.cloud/projects/project-1#letterbox',
  });

  assertStringIncludes(email.subject, 'Draw ready: Halvorsen kitchen and mudroom');
  assertStringIncludes(email.html, 'The next draw on your agreement is ready');
  assertStringIncludes(email.html, 'Retainage is held back from this draw');
  assertStringIncludes(email.message, 'The next draw on Halvorsen kitchen and mudroom is ready.');
  // The notice points at the paper; the amount lives on the invoice.
  assert(!email.html.includes('$'));
});

Deno.test('agreement draw ready prints no figure even when the authority carries one', () => {
  // The schedule parts of a turnkey agreement project into the same
  // proposal_service_terms columns the loader reads for the authority block,
  // so the fixture that would have leaked a "Design-services ceiling" onto a
  // turnkey letter is exactly the one worth pinning.
  const email = renderCommercialEmail({
    transition: 'agreement_draw_ready',
    audience: 'client',
    documentTitle: 'Halvorsen kitchen and mudroom',
    documentKind: 'design_build',
    portalUrl: 'https://client.patina.cloud/projects/project-1#letterbox',
    ceilingCents: 8_413_400,
    retainerCents: 1_200_000,
  });

  assert(!email.html.includes('$'));
  assert(!email.html.includes('Design-services ceiling'));
  assert(!email.html.includes('Retainer'));
  assert(!email.html.includes('84,134'));
});

Deno.test('turnkey execution copy never claims a design engagement or tracked time', () => {
  const email = renderCommercialEmail({
    transition: 'executed',
    audience: 'client',
    documentTitle: 'Halvorsen kitchen and mudroom',
    documentKind: 'design_build',
    recipientName: 'Jamie Client',
    counterpartyName: 'Halvorsen Studio',
    portalUrl: 'https://client.patina.cloud/projects/project-1',
    ceilingCents: 8_413_400,
  });

  assertStringIncludes(email.subject, 'Agreement executed: Halvorsen kitchen and mudroom');
  assertStringIncludes(email.html, 'Your agreement is executed');
  assertStringIncludes(email.html, 'schedule of values');
  assertStringIncludes(email.html, 'retainage is held back until the end');
  assertStringIncludes(email.message, 'the draw schedule is live');
  assert(!email.html.includes('Design services authorized'));
  assert(!email.html.includes('Design time'));
  assert(!email.html.includes('design engagement'));
  assert(!email.html.includes('$'));
});

Deno.test('turnkey execution recorded on paper keeps the turnkey sentences', () => {
  const email = renderCommercialEmail({
    transition: 'executed',
    audience: 'client',
    documentTitle: 'Halvorsen kitchen and mudroom',
    documentKind: 'design_build',
    recipientName: 'Jamie Client',
    counterpartyName: 'Halvorsen Studio',
    portalUrl: 'https://client.patina.cloud/projects/project-1',
    channel: 'paper',
    hasScan: true,
  });

  assertStringIncludes(email.html, 'Signed on paper');
  assertStringIncludes(email.html, 'Your agreement is executed');
  assertStringIncludes(email.html, 'schedule of values');
  assertStringIncludes(email.html, 'scanned copy of the signed paper original');
  assert(!email.html.includes('design engagement'));
});

Deno.test('turnkey signature receipt speaks of work beginning, not design work being active', () => {
  const clientCopy = renderCommercialEmail({
    transition: 'client_signed',
    audience: 'client',
    documentTitle: 'Halvorsen kitchen and mudroom',
    documentKind: 'design_build',
    recipientName: 'Jamie Client',
    counterpartyName: 'Halvorsen Studio',
    portalUrl: 'https://client.patina.cloud/projects/project-1',
  });

  assertStringIncludes(clientCopy.html, 'not executed');
  assertStringIncludes(clientCopy.html, 'no work begins until Halvorsen Studio countersigns');
  assert(!clientCopy.html.includes('design work is not active'));

  const studioCopy = renderCommercialEmail({
    transition: 'client_signed',
    audience: 'studio',
    documentTitle: 'Halvorsen kitchen and mudroom',
    documentKind: 'design_build',
    signerName: 'Jamie Client',
    recipientName: 'Morgan Designer',
    portalUrl: 'https://app.patina.cloud/doc/agreement-1',
  });

  assertStringIncludes(studioCopy.html, 'no work begins until the studio countersigns');
  assert(!studioCopy.html.includes('no project has been created'));
});

Deno.test('design-services letters keep their own sentences and authority block', () => {
  const email = renderCommercialEmail({
    transition: 'executed',
    audience: 'client',
    documentTitle: 'Lake House Design Services',
    documentKind: 'design_services',
    recipientName: 'Jamie Client',
    counterpartyName: 'Morgan Studio',
    portalUrl: 'https://client.patina.cloud/projects/project-1',
    ceilingCents: 2_500_000,
    retainerCents: 500_000,
  });

  assertStringIncludes(email.html, 'Design services authorized');
  assertStringIncludes(email.html, 'Design time can now be tracked');
  assertStringIncludes(email.html, 'Design-services ceiling');
  assertStringIncludes(email.html, '$25,000');
  assertStringIncludes(email.html, '$5,000');
});

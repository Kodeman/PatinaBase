import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { renderCommercialEmail } from './core.ts';

Deno.test('client signature clearly requires studio countersignature', () => {
  const email = renderCommercialEmail({
    transition: 'client_signed',
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

Deno.test('working budget copy cannot imply purchasing authority', () => {
  const email = renderCommercialEmail({
    transition: 'budget_published',
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
    documentTitle: 'Living Room Wave',
    documentKind: 'furnishings_authorization',
    portalUrl: 'https://client.patina.cloud/proposals/wave-1',
  });
  const deposit = renderCommercialEmail({
    transition: 'deposit_ready',
    documentTitle: 'Living Room Wave',
    documentKind: 'furnishings_authorization',
    portalUrl: 'https://client.patina.cloud/invoices',
  });

  assert(!executed.html.includes('Complete the required deposit'));
  assertStringIncludes(deposit.html, 'Purchasing remains locked');
  assertEquals(deposit.subject, 'Deposit ready: Living Room Wave');
});

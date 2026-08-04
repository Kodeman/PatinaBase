import { assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { renderProposalEmail, type ProposalSendSnapshot } from './handler.ts';

const base: ProposalSendSnapshot = {
  id: 'dispatch-1',
  proposalId: 'proposal-1',
  sentAt: '2026-08-03T00:00:00Z',
  designerId: 'designer-1',
  clientId: 'client-1',
  proposalTitle: 'Lake House',
  recipientEmail: 'client@example.com',
  recipientName: 'Jamie',
  designerName: 'Morgan',
  senderName: 'Morgan',
  clientPortalPath: '/proposals/proposal-1',
};

Deno.test('design-services send copy preserves the FF&E authority boundary', () => {
  const rendered = renderProposalEmail(
    { ...base, documentKind: 'design_services' },
    'https://client.patina.cloud',
  );

  assertStringIncludes(rendered.subject, 'design services agreement');
  assertStringIncludes(rendered.html, 'role-based rates');
  assertStringIncludes(rendered.html, 'permission to purchase are not included');
  assertStringIncludes(rendered.html, 'Review agreement');
});

Deno.test('furnishings send copy describes snapshot-limited authority', () => {
  const rendered = renderProposalEmail(
    { ...base, documentKind: 'furnishings_authorization' },
    'https://client.patina.cloud',
  );

  assertStringIncludes(rendered.subject, 'furnishings authorization');
  assertStringIncludes(rendered.html, 'listed items, quantities, and client prices');
  assertStringIncludes(rendered.html, 'Review authorization');
});

Deno.test('legacy proposal send copy is unchanged', () => {
  const rendered = renderProposalEmail(
    { ...base, documentKind: 'legacy' },
    'https://client.patina.cloud',
  );

  assertStringIncludes(rendered.subject, 'sent you a proposal');
  assertStringIncludes(rendered.html, 'Your proposal is ready');
  assertStringIncludes(rendered.html, 'Review proposal');
});

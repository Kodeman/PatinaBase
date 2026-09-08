import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
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

Deno.test('trade scope send copy states the signing boundary', () => {
  const rendered = renderProposalEmail(
    { ...base, documentKind: 'trade_scope' },
    'https://client.patina.cloud',
  );

  assertStringIncludes(rendered.subject, 'sent you a trade scope');
  assertStringIncludes(rendered.html, 'draw schedule');
  assertStringIncludes(rendered.html, 'Signing authorizes only the work and draws described inside');
  assertStringIncludes(rendered.html, 'Review trade scope');
});

Deno.test('design-build send copy names the pricing basis, values, draws and retainage', () => {
  const rendered = renderProposalEmail(
    { ...base, documentKind: 'design_build' },
    'https://client.patina.cloud',
  );

  assertStringIncludes(rendered.subject, 'sent you a design-build agreement: "Lake House"');
  assertStringIncludes(rendered.html, 'Design-build');
  assertStringIncludes(rendered.html, 'Your design-build agreement is ready');
  assertStringIncludes(rendered.html, 'pricing basis');
  assertStringIncludes(rendered.html, 'schedule of values');
  assertStringIncludes(rendered.html, 'draw schedule');
  assertStringIncludes(rendered.html, 'retainage held back from each draw');
  assertStringIncludes(rendered.html, 'Review agreement');
});

// The design-build arm was threaded through five existing ternary chains. These
// digests were taken from the pre-change bodies (documentLabel/description/
// eyebrow/heading/cta), so any drift in the four shipped kinds fails here
// rather than in a client's inbox.
const PRE_DESIGN_BUILD_DIGESTS: Record<string, string> = {
  legacy: '09366eab823106654a9a6727295472638b01008cb1b3622b1134298b8d77ca74',
  design_services: '1ec22325c4b8cee0fe971c7e66c7e8dc99cd2aaa6e117e59959e10cefbb2aaf9',
  furnishings_authorization:
    'ee7b7589d9a8379ad81b177c68b1308288f594aebbf85cb9610f1f30913c0af0',
  service_addendum: '1ec22325c4b8cee0fe971c7e66c7e8dc99cd2aaa6e117e59959e10cefbb2aaf9',
  trade_scope: 'd34638f125d53c05c131f13dffdcd007334edf735fd066393c1a1b1389b7cb28',
};

async function digest(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.test('the four shipped document kinds render byte-identically after the design-build arm', async () => {
  for (const [kind, expected] of Object.entries(PRE_DESIGN_BUILD_DIGESTS)) {
    const rendered = renderProposalEmail(
      { ...base, documentKind: kind as ProposalSendSnapshot['documentKind'] },
      'https://client.patina.cloud',
    );
    assertEquals(
      await digest(`${rendered.subject}\n${rendered.html}`),
      expected,
      `${kind} rendering drifted`,
    );
  }
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

Deno.test('the studio signs the proposal letter and it opens her own door (R7, P-03b)', () => {
  const rendered = renderProposalEmail(
    { ...base, documentKind: 'legacy', studioName: 'Morgan Studio' },
    'https://client.patina.cloud',
  );

  assertStringIncludes(rendered.html, '&mdash; Morgan, Morgan Studio');
  assert(!rendered.html.includes('— Patina'));
  assert(!rendered.html.includes('>Dashboard</a>'));
  assertStringIncludes(rendered.html, '>Your project</a>');
});

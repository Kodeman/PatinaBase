import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';

/* ── The keepsake for a signed agreement ─────────────────────────────────────
   The boundary is the one client-scoped read the page makes —
   `get_client_commercial_document_bundle`, through
   `useClientCommercialDocument` — plus the studio's letterhead. A stranger's
   call comes back with nothing, which is why these tests drive the page by
   what the read returns rather than by a session.

   Wave 2 adds two things to this sheet and nothing else: the sentence she
   actually ticked, taken from her own signature's metadata, and the frozen
   agreement the countersignature sealed (R12). Both are absent on every
   record written before the composer, and the sheet must then read exactly as
   it does today — no empty state, nothing said about a snapshot.
   ────────────────────────────────────────────────────────────────────────── */

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useStudioIdentity: jest.fn(),
}));

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientCommercialDocument: jest.fn(),
}));

import { useStudioIdentity } from '@patina/supabase';

import { useClientCommercialDocument } from '@/hooks/use-commercial-client';

import ProposalRecordPage from '../page';

const bundleHook = useClientCommercialDocument as jest.Mock;
const identityHook = useStudioIdentity as jest.Mock;

const COMPOSED_LINE =
  'I agree to these design-services terms, the per-phase fee schedule, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns.';

const SNAPSHOT_HTML =
  '<h2>Services</h2><p>Interior design services.</p><h2>Per-phase fee</h2>';

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    error: null,
    data: {
      document: {
        id: 'prop-9',
        projectId: 'proj-1',
        kind: 'design_services',
        state: 'executed',
        title: 'Cedar Lane — Design services',
        version: 2,
        sentAt: '2026-09-01T00:00:00Z',
      },
      signatures: [
        {
          party: 'client',
          signerName: 'Nora Ellison',
          signedAt: '2026-09-04T14:20:00Z',
          consentVersion: 'v1',
          documentFingerprint: 'f'.repeat(64),
          signedOnPaper: false,
          paperSignedOn: null,
          paperScanDocumentId: null,
          consentSentence: null,
        },
      ],
      furnishings: null,
      executionSnapshot: null,
      ...overrides,
    },
  };
}

async function renderPage(id = 'prop-9') {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={null}>
        <ProposalRecordPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
  });
  return result;
}

beforeEach(() => {
  bundleHook.mockReturnValue(bundle());
  identityHook.mockReturnValue({
    data: { name: 'Quist Interiors', logoUrl: null },
    isLoading: false,
    isError: false,
  });
});

describe('/proposals/[id]/record — the keepsake', () => {
  it('prints the sheet the signature earned', async () => {
    await renderPage();

    expect(screen.getByTestId('record-studio-name')).toHaveTextContent('Quist Interiors');
    expect(screen.getByTestId('record-kind')).toHaveTextContent('Record of signature');
    expect(screen.getByTestId('record-signed-name')).toHaveTextContent('Nora Ellison');
    expect(screen.getByTestId('record-checksum')).toHaveTextContent('Mark ffffffffffff');
  });

  it('says nothing about a snapshot when the execution predates one', async () => {
    await renderPage();

    expect(screen.queryByTestId('record-executed')).not.toBeInTheDocument();
    expect(screen.queryByText('The agreement as executed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('record-executed-checksum')).not.toBeInTheDocument();
  });

  it('shows the frozen agreement the countersignature sealed, with its own mark', async () => {
    bundleHook.mockReturnValue(
      bundle({
        executionSnapshot: {
          html: SNAPSHOT_HTML,
          documentHash: 'a1b2c3d4e5f6' + '0'.repeat(52),
          createdAt: '2026-09-05T10:00:00Z',
        },
      }),
    );

    await renderPage();

    expect(screen.getByText('The agreement as executed')).toBeInTheDocument();
    const executed = screen.getByTestId('record-executed');
    expect(executed).toHaveTextContent('Services');
    expect(executed).toHaveTextContent('Per-phase fee');
    expect(screen.getByTestId('record-executed-checksum')).toHaveTextContent(
      'Mark a1b2c3d4e5f6',
    );
  });

  it('prints the sentence she ticked, not one composed today', async () => {
    bundleHook.mockReturnValue(
      bundle({
        signatures: [
          {
            ...bundle().data.signatures[0],
            consentSentence: COMPOSED_LINE,
          },
        ],
      }),
    );

    await renderPage();

    expect(screen.getByTestId('record-agreed')).toHaveTextContent(COMPOSED_LINE);
    // The method statement stays beside it: how she signed and what she agreed
    // to are two different facts, and the sheet has always carried the first.
    expect(screen.getByTestId('record-consent')).toHaveTextContent(
      'Signed electronically by typed name: Nora Ellison.',
    );
  });

  it('prints no consent line at all for a signature written before the composer', async () => {
    await renderPage();

    expect(screen.queryByTestId('record-agreed')).not.toBeInTheDocument();
  });

  it('keeps nothing for a paper nobody has signed', async () => {
    bundleHook.mockReturnValue(bundle({ signatures: [] }));

    await renderPage();

    expect(screen.queryByTestId('record-sheet')).not.toBeInTheDocument();
    expect(
      screen.getByText('This paper has not been signed yet, so there is nothing to keep.'),
    ).toBeInTheDocument();
  });
});

import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';

import type { CommercialDocumentBundle } from '@/lib/commercial-documents';

/* ── The Record of Decision, for a signed paper ──────────────────────────────
   Two client-scoped reads: `get_client_commercial_document_bundle` (through
   `useClientCommercialDocument`, the same read the door itself makes) and
   `resolve_studio_identity`. A stranger's bundle comes back null, which is the
   whole of the auth story on this sheet.
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

const BUNDLE: CommercialDocumentBundle = {
  document: {
    id: 'prop-7',
    projectId: 'proj-1',
    kind: 'furnishings_authorization',
    state: 'executed',
    title: 'Furnishings authorization No. 7',
    version: 2,
    waveName: null,
    sentAt: '2026-08-04T12:00:00Z',
    executedAt: '2026-08-05T18:30:00Z',
    supersededAt: null,
    replacementProposalId: null,
    documentFingerprint: 'FEEDFACE1234'.toLowerCase() + '0'.repeat(52),
    totalAmountCents: 689000,
    depositPercent: 50,
  },
  serviceTerms: null,
  rates: [],
  parts: [],
  composed: null,
  consentSentence: null,
  executionSnapshot: null,
  signatures: [
    {
      party: 'client',
      signerName: 'Harper Vale',
      signedAt: '2026-08-05T18:30:00Z',
      consentVersion: 'v2',
      documentFingerprint: 'FEEDFACE1234'.toLowerCase() + '0'.repeat(52),
      signedOnPaper: false,
      paperSignedOn: null,
      paperScanDocumentId: null,
      consentSentence: null,
    },
  ],
  furnishings: {
    checkpointId: null,
    depositRequiredCents: 344500,
    depositPaidCents: 0,
    items: [
      {
        description: 'Sconces',
        roomName: 'Stair hall',
        quantity: 2,
        clientUnitPriceCents: 117000,
        clientLineTotalCents: 234000,
        currency: 'USD',
      },
      {
        description: 'Drapery',
        roomName: 'Living room',
        quantity: 1,
        clientUnitPriceCents: 289000,
        clientLineTotalCents: 289000,
        currency: 'USD',
      },
      {
        description: 'Runner',
        roomName: 'Stair hall',
        quantity: 1,
        clientUnitPriceCents: 166000,
        clientLineTotalCents: 166000,
        currency: 'USD',
      },
    ],
  },
  tradeScope: null,
};

async function renderPage(id = 'prop-7') {
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
  bundleHook.mockReturnValue({ data: BUNDLE, isLoading: false, isError: false });
  identityHook.mockReturnValue({
    data: { name: 'Quist Interiors', logoUrl: null },
    isLoading: false,
    isError: false,
  });
});

describe('/proposals/[id]/record — the owner', () => {
  it('prints the sheet with her typed name, the day, and the consent sentence', async () => {
    await renderPage();

    expect(screen.getByTestId('record-studio-name')).toHaveTextContent('Quist Interiors');
    expect(screen.getByTestId('record-kind')).toHaveTextContent('Record of signature');
    expect(screen.getByTestId('record-artifact-title')).toHaveTextContent(
      'Furnishings authorization No. 7',
    );
    expect(screen.getByTestId('record-edition-line')).toHaveTextContent(
      'Furnishings authorization · Edition 2 · Issued 4 August 2026',
    );
    expect(screen.getByTestId('record-signed-name')).toHaveTextContent('Harper Vale');
    expect(screen.getByTestId('record-signed-on')).toHaveTextContent(
      'Signed 5 August 2026',
    );
    expect(screen.getByTestId('record-signature')).toHaveTextContent('Signed');
    expect(screen.getByTestId('record-consent')).toHaveTextContent(
      'Signed electronically by typed name: Harper Vale.',
    );
    expect(screen.getByTestId('record-stamp')).toHaveAttribute('data-stamp-state', 'signed');
  });

  it('says what the signature released, in words', async () => {
    await renderPage();
    expect(screen.getByTestId('record-release')).toHaveTextContent(
      'It releases three pieces that were waiting on it.',
    );
  });

  it('claims no release on a paper that names no lines', async () => {
    bundleHook.mockReturnValue({
      data: { ...BUNDLE, furnishings: null },
      isLoading: false,
      isError: false,
    });
    await renderPage();
    expect(screen.queryByTestId('record-release')).not.toBeInTheDocument();
  });

  it('stands a paper-signed mark upright and says so', async () => {
    bundleHook.mockReturnValue({
      data: {
        ...BUNDLE,
        signatures: [
          {
            ...BUNDLE.signatures[0],
            signedOnPaper: true,
            // The day written on the paper, not the day the studio filed it.
            paperSignedOn: '2026-08-01',
            signedAt: '2026-08-09T12:00:00Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(screen.getByTestId('record-stamp')).toHaveAttribute(
      'data-stamp-state',
      'signed_on_paper',
    );
    expect(screen.getByTestId('record-consent')).toHaveTextContent('Signed on paper.');
    expect(screen.getByTestId('record-signed-on')).toHaveTextContent(
      'Signed 1 August 2026',
    );
  });

  it('presses twelve characters of the fingerprint, and never the whole hash', async () => {
    await renderPage();
    const mark = screen.getByTestId('record-checksum').textContent ?? '';
    expect(mark).toContain('feedface1234');
    expect(mark).not.toContain(BUNDLE.document.documentFingerprint);
  });

  it('never prints an IP address', async () => {
    const { container } = await renderPage();
    expect(container.innerHTML).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(container.innerHTML).not.toMatch(/ip address/i);
  });
});

describe('/proposals/[id]/record — anyone else', () => {
  it('shows a record that could not be found, and nothing about the paper', async () => {
    bundleHook.mockReturnValue({ data: null, isLoading: false, isError: false });
    await renderPage();

    expect(screen.getByText('This record could not be found.')).toBeInTheDocument();
    expect(screen.queryByTestId('record-sheet')).not.toBeInTheDocument();
    expect(screen.queryByText(/Furnishings authorization No\. 7/)).not.toBeInTheDocument();
  });

  it('keeps nothing of a paper that carries no signature of hers', async () => {
    bundleHook.mockReturnValue({
      data: { ...BUNDLE, signatures: [] },
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(
      screen.getByText('This paper has not been signed yet, so there is nothing to keep.'),
    ).toBeInTheDocument();
  });

  it('never prints the studio’s signature in place of hers', async () => {
    bundleHook.mockReturnValue({
      data: {
        ...BUNDLE,
        signatures: [
          { ...BUNDLE.signatures[0], party: 'studio' as const, signerName: 'Nora Quist' },
        ],
      },
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(screen.queryByText('Nora Quist')).not.toBeInTheDocument();
    expect(
      screen.getByText('This paper has not been signed yet, so there is nothing to keep.'),
    ).toBeInTheDocument();
  });

  it('says the read failed rather than claiming there is no record', async () => {
    bundleHook.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    await renderPage();

    expect(
      screen.getByText('This record could not be read just now. Refresh to try again.'),
    ).toBeInTheDocument();
  });
});

/* `W3W-R1-04`. `get_client_commercial_document_bundle` refuses a reader the
   paper is not addressed to with a 403, and React Query used to retry it
   three times — five seconds of blank page, and then "Refresh to try again"
   about a door that will never open. One answer, at once, in the sibling
   rail's words. */
describe('/proposals/[id]/record — a refusal', () => {
  it('reads as a record that could not be found, with no refresh offered', async () => {
    bundleHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { code: '42501', message: 'permission denied' },
    });
    await renderPage();

    expect(screen.getByText('This record could not be found.')).toBeInTheDocument();
    expect(screen.queryByText(/Refresh to try again/)).not.toBeInTheDocument();
  });

  it('still says a bad moment is a bad moment', async () => {
    bundleHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network'),
    });
    await renderPage();

    expect(
      screen.getByText('This record could not be read just now. Refresh to try again.'),
    ).toBeInTheDocument();
  });
});

/* ── Wave 2: what she agreed to, and the agreement as executed ───────────────
   Two additions to this sheet and nothing else. The sentence comes from her
   own signature's metadata — never `compose_agreement_consent` at read time,
   because an addendum moves the parts and a record that quietly restates
   today's terms is a record of a signature nobody gave. The frozen HTML comes
   from `agreement_execution_snapshots`, written once at countersign (R12).

   Absent, both print nothing at all: a pre-Wave-2 execution and an agreement
   with no parts read exactly as this sheet has always read. No PDF, no
   download, no "snapshot pending".
   ────────────────────────────────────────────────────────────────────────── */

const COMPOSED_LINE =
  'I agree to these design-services terms, the per-phase fee schedule, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns.';

describe('/proposals/[id]/record — the composed agreement (Wave 2)', () => {
  it('says nothing about a snapshot when the execution predates one', async () => {
    await renderPage();

    expect(screen.queryByTestId('record-executed')).not.toBeInTheDocument();
    expect(screen.queryByText('The agreement as executed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('record-executed-checksum')).not.toBeInTheDocument();
  });

  it('shows the frozen agreement the countersignature sealed, with its own mark', async () => {
    bundleHook.mockReturnValue({
      data: {
        ...BUNDLE,
        executionSnapshot: {
          html: '<h2>Services</h2><p>Interior design services.</p><h2>Per-phase fee</h2>',
          documentHash: 'a1b2c3d4e5f6' + '0'.repeat(52),
          createdAt: '2026-08-05T18:31:00Z',
        },
      },
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(screen.getByText('The agreement as executed')).toBeInTheDocument();
    const executed = screen.getByTestId('record-executed');
    expect(executed).toHaveTextContent('Services');
    expect(executed).toHaveTextContent('Per-phase fee');
    // Twelve characters of the frozen document's own hash, never the whole of
    // it — the same discipline the signature's mark keeps.
    expect(screen.getByTestId('record-executed-checksum')).toHaveTextContent(
      'Mark a1b2c3d4e5f6',
    );
    expect(screen.getByTestId('record-executed-checksum').textContent).not.toContain(
      'a1b2c3d4e5f6' + '0'.repeat(52),
    );
  });

  it('prints the sentence she ticked, beside how she signed', async () => {
    bundleHook.mockReturnValue({
      data: {
        ...BUNDLE,
        signatures: [{ ...BUNDLE.signatures[0], consentSentence: COMPOSED_LINE }],
      },
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(screen.getByTestId('record-agreed')).toHaveTextContent(COMPOSED_LINE);
    // How she signed and what she agreed to are two different facts; the sheet
    // has always carried the first and does not lose it to the second.
    expect(screen.getByTestId('record-consent')).toHaveTextContent(
      'Signed electronically by typed name: Harper Vale.',
    );
  });

  it('prints no agreed sentence for a signature written before the composer', async () => {
    await renderPage();

    expect(screen.queryByTestId('record-agreed')).not.toBeInTheDocument();
  });

  it('asks the old question of a record with no parts', async () => {
    await renderPage();

    expect(
      screen.getByText(/you authorize only the named furnishing lines/),
    ).toBeInTheDocument();
  });

  it('stops the question naming terms a composed agreement does not carry', async () => {
    bundleHook.mockReturnValue({
      data: {
        ...BUNDLE,
        document: {
          ...BUNDLE.document,
          kind: 'design_services' as const,
          title: 'Cedar Lane — Design Services',
        },
        parts: [
          {
            id: 'p1',
            position: 1,
            kind: 'schedule',
            variant: 'per_phase',
            partKey: 'patina.per_phase',
            title: 'Per-phase fee',
            payload: { phases: [{ key: 'concept', label: 'Concept', cents: 350000 }] },
            required: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(
      screen.getByText(
        'By signing, you accept the terms in “Cedar Lane — Design Services”. The agreement becomes effective only after the studio countersigns.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/signed role rates/)).not.toBeInTheDocument();
  });

  /* The snapshot is the only markup this portal sets rather than writes, and
     the strings inside it are part titles and bodies a designer typed.
     `_render_agreement_snapshot_html` escapes them — but that escaping lives in
     a database function on the far side of a deploy, and this sheet renders
     inside her signed-in session. What is pinned here is that nothing
     executable survives the set, whatever the snapshot carries. */
  it('renders a snapshot inert, whatever it carries', async () => {
    bundleHook.mockReturnValue({
      data: {
        ...BUNDLE,
        executionSnapshot: {
          html:
            '<h2>Services</h2>' +
            '<p><img src="x" onerror="globalThis.__patina_xss = true"> Interior design.</p>' +
            '<script>globalThis.__patina_xss = true;</script>' +
            '<p><a href="javascript:globalThis.__patina_xss = true">Terms</a></p>' +
            '<iframe src="https://example.invalid"></iframe>',
          documentHash: 'a1b2c3d4e5f6' + '0'.repeat(52),
          createdAt: '2026-08-05T18:31:00Z',
        },
      },
      isLoading: false,
      isError: false,
    });
    await renderPage();

    const executed = screen.getByTestId('record-executed');
    // The agreement itself still reads.
    expect(executed).toHaveTextContent('Services');
    expect(executed).toHaveTextContent('Interior design.');

    // Nothing executable is in the document.
    expect(executed.querySelectorAll('script')).toHaveLength(0);
    expect(executed.querySelectorAll('iframe')).toHaveLength(0);
    expect(executed.querySelector('img')?.getAttribute('onerror')).toBeNull();
    expect(executed.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(executed.innerHTML).not.toContain('onerror');
    expect(executed.innerHTML).not.toContain('javascript:');
    // And the script's source did not survive as visible text on the keepsake.
    expect(executed.textContent ?? '').not.toContain('__patina_xss');
  });
});

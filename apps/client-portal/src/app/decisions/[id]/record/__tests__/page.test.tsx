import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';

import type { ProjectApprovalReview } from '@patina/supabase';

/* ── The Record of Decision, for an approval ─────────────────────────────────
   The boundary is the two client-scoped reads the page makes:
   `list_my_project_decision_reviews` (through `useMyProjectApprovalReviews`)
   and `resolve_studio_identity` (through `useStudioIdentity`). The owner's
   read carries the row; a stranger's does not, because the RPC is
   caller-scoped — which is the whole of the auth story, and is why these
   tests drive the page by what the read returns rather than by a session.
   ────────────────────────────────────────────────────────────────────────── */

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useMyProjectApprovalReviews: jest.fn(),
  useStudioIdentity: jest.fn(),
}));

import { useMyProjectApprovalReviews, useStudioIdentity } from '@patina/supabase';

import DecisionRecordPage from '../page';

const reviewsHook = useMyProjectApprovalReviews as jest.Mock;
const identityHook = useStudioIdentity as jest.Mock;

const ANSWERED: ProjectApprovalReview = {
  decisionId: 'dec-1',
  projectId: 'proj-1',
  phaseId: 'ph-4',
  sectionKey: null,
  artifactKind: 'plan_issue',
  artifactId: 'art-1',
  artifactVersion: 3,
  artifactChecksum: 'A1B2C3D4E5F6'.toLowerCase() + '0'.repeat(52),
  artifactTitle: 'Library elevations',
  question: 'Do the library elevations read right to you?',
  context: null,
  why: null,
  whyAuthorName: null,
  viewerRole: 'lead',
  dueAt: '2026-08-20',
  costCentsDelta: 0,
  scheduleDaysDelta: 0,
  leadTimeDaysDelta: 0,
  lifecycleStatus: 'responded',
  outcome: 'approved',
  disposition: 'active',
  isOverdue: false,
  completedReviewCount: 1,
  requiredReviewCount: 1,
  authorityRevision: 3,
  predecessorDecisionId: null,
  successorDecisionId: null,
  clientSignature: 'Harper Vale',
  createdAt: '2026-08-01T12:00:00Z',
  sentAt: '2026-08-02T12:00:00Z',
  respondedAt: '2026-08-12T15:00:00Z',
  updatedAt: '2026-08-12T15:00:00Z',
};

/**
 * `use(params)` suspends on the first paint, so the sheet arrives a microtask
 * later. The boundary is the layout's in the app; here it is explicit, and
 * every assertion waits for the sheet rather than for a frame that has not
 * been painted yet.
 */
async function renderPage(id = 'dec-1') {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={null}>
        <DecisionRecordPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
  });
  return result;
}

beforeEach(() => {
  reviewsHook.mockReturnValue({ data: [ANSWERED], isLoading: false, isError: false });
  identityHook.mockReturnValue({
    data: { name: 'Quist Interiors', logoUrl: null },
    isLoading: false,
    isError: false,
  });
});

describe('/decisions/[id]/record — the owner', () => {
  it('prints the sheet: letterhead, edition, question, mark and consent', async () => {
    await renderPage();

    expect(screen.getByTestId('record-studio-name')).toHaveTextContent('Quist Interiors');
    expect(screen.getByTestId('record-kind')).toHaveTextContent('Record of decision');
    expect(screen.getByTestId('record-artifact-title')).toHaveTextContent(
      'Library elevations',
    );
    expect(screen.getByTestId('record-edition-line')).toHaveTextContent(
      'Edition 3 · Issued 2 August 2026',
    );
    expect(screen.getByTestId('record-question')).toHaveTextContent(
      'Do the library elevations read right to you?',
    );
    expect(screen.getByTestId('record-stamp')).toHaveAttribute(
      'data-stamp-state',
      'approved',
    );
    expect(screen.getByTestId('record-signed-name')).toHaveTextContent('Harper Vale');
    expect(screen.getByTestId('record-signed-on')).toHaveTextContent(
      'Answered 12 August 2026',
    );
    expect(screen.getByTestId('record-consent')).toHaveTextContent(
      'Signed electronically by typed name.',
    );
  });

  /**
   * P-26 asks for her typed name AND the date. The projection carries the name
   * only from 00573; an older read has none to give, and the sheet prints no
   * name rather than an empty rule where one should be. The consent sentence
   * still says the method either way.
   */
  it('prints no name for a projection older than 00573', async () => {
    const { clientSignature: _dropped, ...older } = ANSWERED;
    reviewsHook.mockReturnValue({ data: [older], isLoading: false, isError: false });
    await renderPage();

    expect(screen.queryByTestId('record-signed-name')).not.toBeInTheDocument();
  });

  it('presses the maker’s mark at the plate’s edge — twelve characters (R6)', async () => {
    await renderPage();

    const mark = screen.getByTestId('record-checksum').textContent ?? '';
    expect(mark).toContain('a1b2c3d4e5f6');
    expect(mark).not.toContain(ANSWERED.artifactChecksum);
  });

  it('says click-through on a Return, which carries no typed name', async () => {
    reviewsHook.mockReturnValue({
      // Only Approve takes a name (ruled 2026-09-05); the column is left
      // NULL on Return and Hold, so the sheet has none to print.
      data: [{ ...ANSWERED, outcome: 'changes_requested', clientSignature: null }],
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(screen.getByTestId('record-stamp')).toHaveAttribute(
      'data-stamp-state',
      'returned',
    );
    expect(screen.getByTestId('record-consent')).toHaveTextContent(
      'Confirmed by click-through.',
    );
    expect(screen.queryByTestId('record-signed-name')).not.toBeInTheDocument();
  });

  /**
   * The doorstep stamps SUPERSEDED ahead of any outcome, so a dead edition
   * never reads plainly RETURNED beside the live one. On the keepsake that
   * precedence would print SUPERSEDED over her typed name — telling her the
   * answer she gave was undone. Her outcome wins here; the later edition is
   * a line of prose under the mark.
   */
  it('keeps her outcome as the mark after a later edition replaced it', async () => {
    reviewsHook.mockReturnValue({
      data: [
        { ...ANSWERED, disposition: 'superseded', successorDecisionId: 'dec-2' },
        {
          ...ANSWERED,
          decisionId: 'dec-2',
          artifactVersion: 4,
          outcome: null,
          lifecycleStatus: 'pending',
          predecessorDecisionId: 'dec-1',
          successorDecisionId: null,
          sentAt: '2026-08-14T09:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(screen.getByTestId('record-stamp')).toHaveAttribute(
      'data-stamp-state',
      'approved',
    );
    expect(screen.getByTestId('record-stamp-note')).toHaveTextContent(
      'A later edition replaced this one on 14 August 2026.',
    );
    expect(screen.getByTestId('record-signed-name')).toHaveTextContent('Harper Vale');
    expect(screen.getByTestId('record-consent')).toHaveTextContent(
      'Signed electronically by typed name.',
    );
  });

  it('dates the supersession only from the successor’s own row', async () => {
    reviewsHook.mockReturnValue({
      // The successor is a different lead's; this read cannot see it.
      data: [{ ...ANSWERED, disposition: 'superseded', successorDecisionId: 'dec-2' }],
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(screen.getByTestId('record-stamp-note')).toHaveTextContent(
      'A later edition has since replaced this one.',
    );
    expect(screen.getByTestId('record-stamp')).toHaveAttribute(
      'data-stamp-state',
      'approved',
    );
  });

  it('says nothing about a later edition on a record that has none', async () => {
    await renderPage();
    expect(screen.queryByTestId('record-stamp-note')).not.toBeInTheDocument();
  });

  /**
   * Withdrawal is only ever possible before she answers (00465), so a record
   * with no outcome still prints the disposition's own mark.
   */
  it('presses WITHDRAWN when there is no answer to print', async () => {
    reviewsHook.mockReturnValue({
      data: [
        {
          ...ANSWERED,
          outcome: null,
          clientSignature: null,
          lifecycleStatus: 'expired',
          disposition: 'withdrawn',
          respondedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(screen.getByTestId('record-stamp')).toHaveAttribute(
      'data-stamp-state',
      'withdrawn',
    );
    expect(screen.queryByTestId('record-stamp-note')).not.toBeInTheDocument();
  });

  it('hangs the studio’s own mark on the letterhead when it has one', async () => {
    identityHook.mockReturnValue({
      data: { name: 'Quist Interiors', logoUrl: 'https://cdn.patina.test/quist.png' },
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(screen.getByTestId('record-studio-logo')).toHaveAttribute(
      'src',
      'https://cdn.patina.test/quist.png',
    );
  });

  /**
   * The signing routes record an IP (`cf-connecting-ip`). It is a fact about
   * the evening she signed, not about the agreement, and it never reaches a
   * sheet that goes in a drawer.
   */
  it('never prints an IP address', async () => {
    const { container } = await renderPage();
    expect(container.innerHTML).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(container.innerHTML).not.toMatch(/ip address/i);
  });

  it('stands the mark upright on paper and forces white', async () => {
    const { container } = await renderPage();
    const css = container.querySelector('style')?.textContent ?? '';

    expect(css).toContain('@media print');
    expect(css).toMatch(/\[data-stamp-state\]\s*\{\s*transform: none !important;/);
    expect(css).toContain('background: #FFFFFF !important');
    expect(css).toContain('box-shadow: none !important');
  });
});

describe('/decisions/[id]/record — anyone else', () => {
  /**
   * `list_my_project_decision_reviews` is caller-scoped: a stranger's read
   * simply does not carry this id. The sheet says the record could not be
   * found and never says whether the decision exists — the same shape
   * `/invoices/[id]/print` uses for an invoice that is not hers.
   */
  it('shows a record that could not be found, and nothing about it', async () => {
    reviewsHook.mockReturnValue({ data: [], isLoading: false, isError: false });
    await renderPage();

    expect(screen.getByText('This record could not be found.')).toBeInTheDocument();
    expect(screen.queryByTestId('record-sheet')).not.toBeInTheDocument();
    expect(screen.queryByText(/Library elevations/)).not.toBeInTheDocument();
  });

  it('gives a stranger’s read the same answer as an unanswered id', async () => {
    reviewsHook.mockReturnValue({ data: [ANSWERED], isLoading: false, isError: false });
    await renderPage('dec-someone-elses');

    expect(screen.getByText('This record could not be found.')).toBeInTheDocument();
  });

  it('says the read failed rather than claiming there is no record', async () => {
    reviewsHook.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    await renderPage();

    expect(
      screen.getByText('This record could not be read just now. Refresh to try again.'),
    ).toBeInTheDocument();
  });

  it('keeps nothing of an approval still standing open', async () => {
    reviewsHook.mockReturnValue({
      data: [{ ...ANSWERED, outcome: null, lifecycleStatus: 'pending' }],
      isLoading: false,
      isError: false,
    });
    await renderPage();

    expect(
      screen.getByText(
        'This approval has not been answered yet, so there is nothing to keep.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('record-sheet')).not.toBeInTheDocument();
  });
});

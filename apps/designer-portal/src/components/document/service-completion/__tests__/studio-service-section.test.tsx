import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioServiceSection } from '../studio-service-section';
import { CITATION_UNCHECKED, HOLD_NOTE, INACTIVE_NOTE, STALE_NOTE } from '../copy';

// Mocked hooks: the DB-backed walk is W6. RPC arguments and the refusal token
// contract are proven in the @patina/supabase vitest suite.
const mockObligations = jest.fn();
const mockCompletion = jest.fn();
const mockEvidence = jest.fn();
const mockCitation = jest.fn();
const mockComplete = jest.fn();
const mockResolve = jest.fn();
const mockRevoke = jest.fn();
const mockOpener = jest.fn();
const mockRole = { value: 'owner' as string };
const mockOpenerFor = jest.fn();
const mockStale = new Set(['stale_obligations', 'service_obligations_open', 'service_acceptance_condition_resolved']);
// useStaleReadingMark: the hook records it, per QueryClient, when a stale refusal lands (vitest suite).
const mockMark = { value: null as number | null };
jest.mock('@patina/supabase', () => ({
  useStudioServiceObligations: () => mockObligations(),
  useStudioServiceCompletion: () => mockCompletion(),
  useServiceConditionEvidenceOptions: () => mockEvidence(),
  useServiceConditionCitation: (_projectId: string, kind: string, id: string) => mockCitation(kind, id),
  citedReferences: (evidence: Record<string, string>) => [
    ['issue', 'issueId'], ['siteRequest', 'siteRequestId'], ['storageObject', 'storageObjectId'],
  ].flatMap(([kind, key]) => (evidence[key] ? [{ kind, id: evidence[key] }] : [])),
  useCompleteStudioService: () => ({ mutateAsync: mockComplete, isPending: false }),
  useResolveServiceAcceptanceCondition: () => ({ mutateAsync: mockResolve, isPending: false }),
  useRevokeStudioServiceCompletion: () => ({ mutateAsync: mockRevoke, isPending: false }),
  useServiceAcceptance: () => ({
    data: { projectId: 'job-1', capability: 'active', requests: [{
      requestId: 'request-1', requestNumber: 4,
      // A resolved condition leaves the derive list; its words stay on the signer's response.
      signers: [{ response: { conditions: [{ conditionId: 'condition-1', text: 'Touch up the hall' }] } }],
    }] },
  }),
  useScopeEditions: () => ({
    data: [{
      id: 'edition-1', editionNumber: 3, kind: 'baseline', status: 'active', effectiveAt: '2026-10-01T10:00:00Z',
      packages: [
        { packageKey: 'living', label: 'Living room', inclusion: 'included',
          responsibilities: { design: 'studio', purchasing: 'studio', payer: 'client', fabrication_contract: 'studio', installation: 'gc' } },
        { packageKey: 'kitchen', label: 'Kitchen', inclusion: 'excluded',
          responsibilities: { design: 'none', purchasing: 'client', payer: 'client', fabrication_contract: 'none', installation: 'client' } },
      ],
    }],
  }),
  useProjectV2: () => ({ data: { id: 'job-1', studio_id: 'studio-1' } }),
  useOrganizations: () => ({ data: [{ id: 'studio-1', membership: { role: mockRole.value } }] }),
  isServiceAcceptanceInactive: (error: { message?: string }) => /permission denied for function/.test(error?.message ?? ''),
  serviceCompletionRefusal: (error: { message?: string }) => /^([a-z][a-z0-9_]*)(?::|$)/.exec(error?.message ?? '')?.[1] ?? null,
  get STALE_SERVICE_COMPLETION_REFUSALS() { return mockStale; },
  useStaleReadingMark: () => mockMark.value,
}));
jest.mock('../../paper/unfold-bridge', () => ({ unfoldOpenerFor: (id: string) => mockOpenerFor(id) }));

const reading = (over: Record<string, unknown> = {}) => ({
  projectId: 'job-1', capability: 'active', scopeEditionId: 'edition-1', obligationHash: 'hash-1',
  blockers: [], informational: [], conditions: [],
  acceptance: { requestId: 'request-1', outcome: 'accepted', pendingRequiredSigners: 0 },
  financialHold: { openInvoiceCount: 0, balanceCents: 0, uncollectedContractCents: 0 }, readNumber: 1,
  ...over,
});
const completion =(over: Record<string, unknown> = {}) => ({
  completionId: 'completion-1', scopeEditionId: 'edition-1', acceptanceRequestId: 'request-1', state: 'completed',
  openConditionIds: [], obligationSnapshot: {}, obligationHash: 'hash-1', financialHold: {}, completedBy: 'owner-1',
  completedAt: '2026-10-27T10:00:00Z', conditionsClosedAt: null, revokedAt: null, revokedBy: null, revokeReason: null,
  ...over,
});
const record = (completions: unknown[] = [], resolutions: unknown[] = []) => ({
  data: { projectId: 'job-1', audience: 'studio', capability: 'active', completions, resolutions },
  isError: false, refetch: jest.fn(),
});
const resolution = (over: Record<string, unknown> = {}) => ({
  resolutionId: 'resolution-1', requestId: 'request-1', conditionId: 'condition-1', responseId: 'response-1',
  resolution: 'Repainted the hall', evidence: { issueId: 'issue-1' }, resolvedBy: 'owner-1',
  resolvedAt: '2026-10-28T10:00:00Z', ...over,
});
const OPTIONS = { data: [{ kind: 'issue', id: 'issue-1', label: 'Issue 3 · Kitchen set' }], isSuccess: true, isError: false };
const read = (value: unknown, over: Record<string, unknown> = {}) => ({
  data: value, isError: false, isFetching: false, dataUpdatedAt: 1, refetch: jest.fn(), ...over,
});
const CONDITION = { conditionId: 'condition-1', text: 'Touch up the hall', responseId: 'response-1', signerId: 'signer-1' };
// Each recorded citation is checked on its own (useServiceConditionCitation).
const CITED: Record<string, { available: true; label: string }> = {
  'issue:issue-1': { available: true, label: 'Issue 3 · Kitchen set' },
};
const citationRead = (kind: string, id: string) => ({
  data: CITED[`${kind}:${id}`] ?? { available: false }, isError: false, refetch: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.value = 'owner';
  mockMark.value = null;
  mockEvidence.mockReturnValue(OPTIONS);
  mockCitation.mockImplementation(citationRead);
  mockCompletion.mockReturnValue(record());
  mockOpenerFor.mockReturnValue(mockOpener);
});

const completeButton = () => screen.getByRole('button', { name: 'Complete studio service' });

describe('studio service obligations', () => {
  it('groups blockers by package, keeps informational items and the balance apart, and holds completion', () => {
    mockObligations.mockReturnValue(read(reading({
      blockers: [
        { code: 'studio_installation_open', count: 2, packageKey: 'living', label: 'server words' },
        { code: 'acceptance_not_accepted', count: 1, packageKey: null, label: 'server words' },
      ],
      informational: [{ code: 'punch_item_open', count: 1, packageKey: 'living', label: 'server words' }],
      financialHold: { openInvoiceCount: 1, balanceCents: 124000, uncollectedContractCents: 0 },
    })));
    render(<StudioServiceSection projectId="job-1" />);
    const holds = screen.getByRole('list', { name: "Holds the studio's service" });
    expect(within(holds).getByText('Living room')).toBeInTheDocument();
    expect(within(holds).getByText('Installation the studio owes is not complete (2)')).toBeInTheDocument();
    expect(within(holds).getByText('Across the job')).toBeInTheDocument();
    expect(within(holds).getByText("The client hasn't accepted the studio's services yet")).toBeInTheDocument();
    expect(within(holds).queryByText(/punch items/)).toBeNull();
    const info = screen.getByRole('list', { name: "Doesn't hold the studio's service" });
    expect(within(info).getByText(/Open install punch items/)).toBeInTheDocument();
    const hold = document.querySelector('[data-financial-hold]');
    expect(hold).toHaveTextContent(HOLD_NOTE);
    expect(hold).toHaveTextContent('$1,240 open on 1 invoice.');
    expect(holds).not.toContainElement(hold as HTMLElement);
    expect(completeButton()).toBeDisabled();
    fireEvent.click(completeButton());
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('a stale refusal retires the shown hash: Complete waits for a successful refetch, then sends the new hash', async () => {
    mockObligations.mockReturnValue(read(reading()));
    mockComplete.mockImplementationOnce(async () => {
      mockMark.value = 1;
      throw { code: 'PT409', message: 'stale_obligations' };
    });
    const { rerender } = render(<StudioServiceSection projectId="job-1" />);
    expect(screen.getByText('Nothing holds the studio\'s service.')).toBeInTheDocument();
    fireEvent.click(completeButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(STALE_NOTE);
    expect(mockComplete).toHaveBeenCalledWith({ acceptanceRequestId: 'request-1', obligationHash: 'hash-1' });
    // The refetch has not answered: the refused reading is still on screen.
    expect(completeButton()).toBeDisabled();
    fireEvent.click(completeButton());
    expect(mockComplete).toHaveBeenCalledTimes(1);
    // The refetch failed: the calm read error with Retry, and Complete stays held.
    const failedRead = read(reading(), { isError: true });
    mockObligations.mockReturnValue(failedRead);
    rerender(<StudioServiceSection projectId="job-1" />);
    expect(screen.getByText('The studio service could not be refreshed. What you have entered is kept.')).toBeInTheDocument();
    expect(completeButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry the studio service' }));
    expect(failedRead.refetch).toHaveBeenCalled();
    // A refetch succeeded and the updated list is shown: Complete sends its hash.
    mockObligations.mockReturnValue(read(reading({ obligationHash: 'hash-2', readNumber: 2 }), { dataUpdatedAt: 2 }));
    mockComplete.mockResolvedValueOnce({ completionId: 'completion-1', state: 'completed' });
    rerender(<StudioServiceSection projectId="job-1" />);
    expect(completeButton()).toBeEnabled();
    fireEvent.click(completeButton());
    await waitFor(() => expect(mockComplete).toHaveBeenLastCalledWith({ acceptanceRequestId: 'request-1', obligationHash: 'hash-2' }));
  });

  it('R1: a read begun before the refusal never re-enables Complete, even one that answered after the click', async () => {
    mockObligations.mockReturnValue(read(reading()));
    let refuse: (reason: unknown) => void = () => undefined;
    mockComplete.mockImplementationOnce(() => new Promise((_, reject) => { refuse = reject; }));
    const { rerender } = render(<StudioServiceSection projectId="job-1" />);
    fireEvent.click(completeButton());
    expect(mockComplete).toHaveBeenCalledWith({ acceptanceRequestId: 'request-1', obligationHash: 'hash-1' });
    // A background read succeeds between the click and the refusal, still with the old hash.
    mockObligations.mockReturnValue(read(reading({ readNumber: 2 }), { dataUpdatedAt: 2 }));
    rerender(<StudioServiceSection projectId="job-1" />);
    // The server refuses: reads 1 and 2 had begun, and the refresh starts read 3.
    mockMark.value = 2;
    refuse({ code: 'PT409', message: 'stale_obligations' });
    expect(await screen.findByRole('alert')).toHaveTextContent(STALE_NOTE);
    expect(completeButton()).toBeDisabled();
    fireEvent.click(completeButton());
    expect(mockComplete).toHaveBeenCalledTimes(1);
    // The read begun after the refusal answers with the new hash: Complete sends it.
    mockObligations.mockReturnValue(read(reading({ obligationHash: 'hash-2', readNumber: 3 }), { dataUpdatedAt: 3 }));
    mockComplete.mockResolvedValueOnce({ completionId: 'completion-1', state: 'completed' });
    rerender(<StudioServiceSection projectId="job-1" />);
    expect(completeButton()).toBeEnabled();
    fireEvent.click(completeButton());
    await waitFor(() => expect(mockComplete).toHaveBeenLastCalledWith({ acceptanceRequestId: 'request-1', obligationHash: 'hash-2' }));
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it('F1: Complete held by a stale mark with no read coming offers "Check the list again", which reads afresh', () => {
    const checkAgain = () => screen.queryByRole('button', { name: 'Check the list again' });
    // A read is in flight: it will answer, so nothing is offered.
    mockMark.value = 1;
    mockObligations.mockReturnValue(read(reading(), { isFetching: true }));
    const { rerender } = render(<StudioServiceSection projectId="job-1" />);
    expect(completeButton()).toBeDisabled();
    expect(checkAgain()).toBeNull();
    // No read in flight and none failed: Complete is held with a way out.
    const settled = read(reading());
    mockObligations.mockReturnValue(settled);
    rerender(<StudioServiceSection projectId="job-1" />);
    expect(completeButton()).toBeDisabled();
    expect(checkAgain()).toBeInTheDocument();
    fireEvent.click(checkAgain() as HTMLElement);
    expect(settled.refetch).toHaveBeenCalledTimes(1);
    // A failed read keeps the section's own Retry instead.
    mockObligations.mockReturnValue(read(reading(), { isError: true }));
    rerender(<StudioServiceSection projectId="job-1" />);
    expect(screen.getByRole('button', { name: 'Retry the studio service' })).toBeInTheDocument();
    expect(checkAgain()).toBeNull();
    // A reading begun after the mark releases Complete and the action goes.
    mockObligations.mockReturnValue(read(reading({ readNumber: 2 })));
    rerender(<StudioServiceSection projectId="job-1" />);
    expect(completeButton()).toBeEnabled();
    expect(checkAgain()).toBeNull();
  });

  it('reads a permission denial as the calm switched-off note, not an error', async () => {
    mockObligations.mockReturnValue(read(reading()));
    mockComplete.mockRejectedValueOnce({ code: '42501', message: 'permission denied for function complete_studio_service' });
    render(<StudioServiceSection projectId="job-1" />);
    expect(screen.queryByText(INACTIVE_NOTE)).toBeNull();
    fireEvent.click(completeButton());
    expect(await screen.findByRole('status')).toHaveTextContent("Studio service completion isn't switched on for this studio.");
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the switched-off note in place of the inactive blocker and keeps completion held', () => {
    mockObligations.mockReturnValue(read(reading({
      capability: 'inactive',
      blockers: [{ code: 'scope_editions_inactive', count: 1, packageKey: null, label: 'Scope editions are not active' }],
    })));
    render(<StudioServiceSection projectId="job-1" />);
    expect(screen.getByText(INACTIVE_NOTE)).toBeInTheDocument();
    expect(screen.queryByText('Scope editions are not active')).toBeNull();
    expect(completeButton()).toBeDisabled();
  });
});

describe('conditions (K3 option A)', () => {
  it('completes with conditions open, resolves one with a reference, and reads complete once the last closes', async () => {
    mockObligations.mockReturnValue(read(reading({
      conditions: [CONDITION], acceptance: { requestId: 'request-1', outcome: 'accepted_with_conditions', pendingRequiredSigners: 0 },
    })));
    const { rerender } = render(<StudioServiceSection projectId="job-1" />);
    expect(screen.getByText(/completed with conditions until each one below is resolved/)).toBeInTheDocument();
    mockComplete.mockResolvedValueOnce({ completionId: 'completion-1', state: 'completed_with_conditions' });
    fireEvent.click(completeButton());
    await waitFor(() => expect(mockComplete).toHaveBeenCalled());

    mockCompletion.mockReturnValue(record([completion({ state: 'completed_with_conditions', openConditionIds: ['condition-1'] })]));
    rerender(<StudioServiceSection projectId="job-1" />);
    expect(document.querySelector('[data-studio-service-state]')).toHaveAttribute('data-studio-service-state', 'completed_with_conditions');
    expect(screen.getByText(/^Completed with conditions/)).toBeInTheDocument();
    expect(screen.getByText('Touch up the hall · Open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resolve this condition' }));
    const form = screen.getByRole('form', { name: 'Resolve: Touch up the hall' });
    fireEvent.change(within(form).getByLabelText('How it was resolved'), { target: { value: 'Repainted the hall' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Record the resolution' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('choose one reference');
    expect(mockResolve).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('What shows it'), { target: { value: 'issue:issue-1' } });
    mockResolve.mockResolvedValueOnce({ resolutionId: 'resolution-1', replayed: false });
    fireEvent.click(within(form).getByRole('button', { name: 'Record the resolution' }));
    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith({
      requestId: 'request-1', conditionId: 'condition-1', resolution: 'Repainted the hall', evidence: { issueId: 'issue-1' },
    }));

    mockObligations.mockReturnValue(read(reading({ conditions: [] })));
    mockCompletion.mockReturnValue(record(
      [completion({ state: 'completed', conditionsClosedAt: '2026-10-28T10:00:00Z' })], [resolution()],
    ));
    rerender(<StudioServiceSection projectId="job-1" />);
    expect(document.querySelector('[data-studio-service-state]')).toHaveAttribute('data-studio-service-state', 'completed');
    expect(screen.getByText(/^Studio service complete/)).toBeInTheDocument();
    const resolved = document.querySelector('[data-resolved-condition="condition-1"]') as HTMLElement;
    expect(resolved).toHaveTextContent('Touch up the hall · Resolved');
    expect(resolved).toHaveTextContent('Cited: Issue 3 · Kitchen set');
  });

  it('refuses an unreadable reference with one calm message', async () => {
    mockObligations.mockReturnValue(read(reading({ conditions: [CONDITION] })));
    mockCompletion.mockReturnValue(record([completion({ state: 'completed_with_conditions', openConditionIds: ['condition-1'] })]));
    mockResolve.mockRejectedValueOnce({ code: '23514', message: 'service_acceptance_evidence_unbound' });
    render(<StudioServiceSection projectId="job-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve this condition' }));
    fireEvent.change(screen.getByLabelText('How it was resolved'), { target: { value: 'Done' } });
    fireEvent.change(screen.getByLabelText('What shows it'), { target: { value: 'issue:issue-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record the resolution' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That reference isn't available to cite.");
  });

  it('reads a citation that no longer resolves as no longer available, never as an error', () => {
    mockObligations.mockReturnValue(read(reading()));
    mockCompletion.mockReturnValue(record([completion()], [resolution({ evidence: { issueId: 'issue-gone' } })]));
    render(<StudioServiceSection projectId="job-1" />);
    expect(document.querySelector('[data-resolved-condition="condition-1"]')).toHaveTextContent('Cited: no longer available');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resolve this condition' })).toBeNull();
  });

  it('decides each citation by its own check, never by what the picker listed', () => {
    // The picker read a first page that does not hold this nested document.
    mockEvidence.mockReturnValue(OPTIONS);
    CITED['storageObject:object-deep'] = { available: true, label: 'site/2026/walkthrough.pdf' };
    mockObligations.mockReturnValue(read(reading()));
    mockCompletion.mockReturnValue(record([completion()], [resolution({ evidence: { storageObjectId: 'object-deep' } })]));
    render(<StudioServiceSection projectId="job-1" />);
    expect(mockCitation).toHaveBeenCalledWith('storageObject', 'object-deep');
    const resolved = document.querySelector('[data-resolved-condition="condition-1"]') as HTMLElement;
    expect(resolved).toHaveTextContent('Cited: site/2026/walkthrough.pdf');
    expect(resolved).not.toHaveTextContent('no longer available');
    delete CITED['storageObject:object-deep'];
  });

  it('tells a citation still being checked from one whose check failed, and offers Retry', () => {
    mockEvidence.mockReturnValue({ data: undefined, isSuccess: false, isError: true, refetch: jest.fn() });
    const failed = { data: undefined, isError: true, refetch: jest.fn() };
    mockCitation.mockReturnValue(failed);
    mockObligations.mockReturnValue(read(reading()));
    mockCompletion.mockReturnValue(record([completion()], [resolution()]));
    const { rerender } = render(<StudioServiceSection projectId="job-1" />);
    const resolved = () => document.querySelector('[data-resolved-condition="condition-1"]') as HTMLElement;
    expect(resolved()).toHaveTextContent("Cited: this reference couldn't be checked just now. The resolution stands.");
    expect(resolved()).not.toHaveTextContent('reading…');
    expect(resolved()).not.toHaveTextContent('no longer available');
    // Calm, and the condition stays resolved: no alert, no way to resolve it again.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resolve this condition' })).toBeNull();
    fireEvent.click(within(resolved()).getByRole('button', { name: 'Check the reference again' }));
    expect(failed.refetch).toHaveBeenCalled();
    mockCitation.mockReturnValue({ data: undefined, isError: false, refetch: jest.fn() });
    rerender(<StudioServiceSection projectId="job-1" />);
    expect(resolved()).toHaveTextContent('Cited: reading…');
  });

  it.each([
    ['no longer available', { available: false }],
    ['available', { available: true, label: 'Issue 3 · Kitchen set' }],
  ])('R2: a failed re-check reads failed with Retry over a cached "%s" answer', (_label, cached) => {
    const failed = { data: cached, isError: true, refetch: jest.fn() };
    mockCitation.mockReturnValue(failed);
    mockObligations.mockReturnValue(read(reading()));
    mockCompletion.mockReturnValue(record([completion()], [resolution()]));
    render(<StudioServiceSection projectId="job-1" />);
    const cited = document.querySelector('[data-citation="issue:issue-1"]') as HTMLElement;
    expect(cited).toHaveAttribute('data-citation-state', 'unchecked');
    expect(cited).toHaveTextContent(`Cited: ${CITATION_UNCHECKED}`);
    expect(cited).not.toHaveTextContent('no longer available');
    expect(cited).not.toHaveTextContent('Kitchen set');
    fireEvent.click(within(cited).getByRole('button', { name: 'Check the reference again' }));
    expect(failed.refetch).toHaveBeenCalled();
  });
});

describe('revoke', () => {
  it('needs a reason, and sends it with the completion', async () => {
    mockObligations.mockReturnValue(read(reading()));
    mockCompletion.mockReturnValue(record([completion()]));
    render(<StudioServiceSection projectId="job-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this completion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give a reason for revoking.');
    expect(mockRevoke).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Why it is revoked'), { target: { value: 'Recorded on the wrong edition' } });
    mockRevoke.mockResolvedValueOnce({ completionId: 'completion-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith({
      completionId: 'completion-1', reason: 'Recorded on the wrong edition',
    }));
  });

  it('is offered only to a studio owner or admin, and keeps revoked completions in the history', () => {
    mockRole.value = 'member';
    mockObligations.mockReturnValue(read(reading()));
    mockCompletion.mockReturnValue(record([
      completion(),
      completion({ completionId: 'completion-0', revokedAt: '2026-10-26T10:00:00Z', revokeReason: 'Wrong edition' }),
    ]));
    render(<StudioServiceSection projectId="job-1" />);
    expect(screen.queryByRole('button', { name: 'Revoke this completion' })).toBeNull();
    expect(document.querySelector('[data-earlier-completion="completion-0"]')).toHaveTextContent('Revoked');
    expect(document.querySelector('[data-earlier-completion="completion-0"]')).toHaveTextContent('Wrong edition');
  });

  it('offers revoke on every live earlier completion, with the same reason rule and role gate', async () => {
    mockObligations.mockReturnValue(read(reading({ scopeEditionId: 'edition-2' })));
    const records = [
      completion({ completionId: 'completion-live-old', completedAt: '2026-09-01T10:00:00Z' }),
      completion({ completionId: 'completion-0', revokedAt: '2026-10-26T10:00:00Z', revokeReason: 'Wrong edition' }),
    ];
    mockCompletion.mockReturnValue(record(records));
    const { unmount } = render(<StudioServiceSection projectId="job-1" />);
    const live = document.querySelector('[data-earlier-completion="completion-live-old"]') as HTMLElement;
    const revoked = document.querySelector('[data-earlier-completion="completion-0"]') as HTMLElement;
    expect(within(revoked).queryByRole('button', { name: /^Revoke/ })).toBeNull();
    fireEvent.click(within(live).getByRole('button', { name: /^Revoke the completion of / }));
    const form = within(live).getByRole('form');
    fireEvent.click(within(form).getByRole('button', { name: 'Revoke' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Give a reason for revoking.');
    expect(mockRevoke).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('Why it is revoked'), { target: { value: 'Superseded by edition 2' } });
    mockRevoke.mockResolvedValueOnce({ completionId: 'completion-live-old' });
    fireEvent.click(within(form).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith({
      completionId: 'completion-live-old', reason: 'Superseded by edition 2',
    }));
    unmount();
    // A member sees the history without the act; the server stays the authority.
    mockRole.value = 'member';
    render(<StudioServiceSection projectId="job-1" />);
    expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
  });
});

describe('care references (A23)', () => {
  it('names the edition and responsible parties and unfolds the specification back to Closeout', () => {
    mockObligations.mockReturnValue(read(reading()));
    mockCompletion.mockReturnValue(record([completion()]));
    render(<StudioServiceSection projectId="job-1" />);
    const care = document.querySelector('[data-care-references]') as HTMLElement;
    expect(care).toHaveTextContent('scope edition 3');
    expect(care).toHaveTextContent('accepted on request 4');
    expect(care).toHaveTextContent("It doesn't reopen the studio service.");
    expect(within(care).getByText(/Living room: bought by the studio, installed by the general contractor/)).toBeInTheDocument();
    expect(within(care).queryByText(/Kitchen/)).toBeNull();
    const link = within(care).getByRole('link', { name: 'Open the specification' });
    expect(link).toHaveAttribute('href', '/doc/job-1?unfold=pieces&lens=spec');
    fireEvent.click(link);
    expect(mockOpenerFor).toHaveBeenCalledWith('job-1');
    expect(mockOpener).toHaveBeenCalledWith(
      { kind: 'pieces', lens: 'spec', room: null, line: null },
      { documentId: 'job-1', chapter: 'closeout', lens: 'spec' },
      link,
    );
  });
});

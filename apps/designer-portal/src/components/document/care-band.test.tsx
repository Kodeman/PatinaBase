import { fireEvent, render, screen } from '@testing-library/react';

const useAuth = jest.fn();
const useCloseProject = jest.fn();
const useProjectV2 = jest.fn();
const useProjectPhases = jest.fn();
const useCoordinationItems = jest.fn();
const useScopeChangeRequests = jest.fn();
const useProjectFFEItems = jest.fn();
const useFfeInvoiceCoverage = jest.fn();
const useProjectPaymentMilestones = jest.fn();
const useProjectInvoices = jest.fn();
const closeMutate = jest.fn();

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuth() }));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useCloseProject: () => useCloseProject(),
}));
jest.mock('@patina/supabase', () => ({
  useProjectV2: (id: string) => useProjectV2(id),
  useProjectPhases: (id: string) => useProjectPhases(id),
  useCoordinationItems: (id: string) => useCoordinationItems(id),
  useScopeChangeRequests: (id: string) => useScopeChangeRequests(id),
  useProjectFFEItems: (id: string) => useProjectFFEItems(id),
  useFfeInvoiceCoverage: (id: string) => useFfeInvoiceCoverage(id),
  useProjectPaymentMilestones: (id: string) => useProjectPaymentMilestones(id),
  useProjectInvoices: (id: string) => useProjectInvoices(id),
}));
jest.mock('./strata-mark', () => ({
  StrataMark: () => <span data-testid="strata-mark" />,
}));
jest.mock('./document-action', () => ({
  DocumentAction: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DocumentActionRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CareBand } from './care-band';

const settled = (data: unknown) => ({ data, isError: false });

beforeEach(() => {
  closeMutate.mockReset();
  useAuth.mockReturnValue({
    user: { id: 'owner-1' },
    isLoading: false,
  });
  useCloseProject.mockReturnValue({
    mutate: closeMutate,
    isPending: false,
  });
  useProjectV2.mockReturnValue(
    settled({
      id: 'project-1',
      name: 'Prairie House',
      status: 'active',
      current_phase: 'installation',
      designer_id: 'owner-1',
      designer: { full_name: 'Olivia Owner' },
      total_amount_cents: 0,
      start_date: null,
    }),
  );
  useProjectPhases.mockReturnValue(settled([]));
  useCoordinationItems.mockReturnValue(settled([]));
  useScopeChangeRequests.mockReturnValue(settled([]));
  useProjectFFEItems.mockReturnValue(settled([]));
  useFfeInvoiceCoverage.mockReturnValue(settled({}));
  useProjectPaymentMilestones.mockReturnValue(settled([]));
  useProjectInvoices.mockReturnValue(settled([]));
});

describe('CareBand closeout authority', () => {
  it('shows collaborators a calm exact-owner state without a doomed close action', () => {
    useAuth.mockReturnValue({
      user: { id: 'collaborator-1' },
      isLoading: false,
    });

    render(<CareBand projectId="project-1" />);

    expect(screen.getByRole('region', { name: 'Project closeout ownership' })).toHaveTextContent(
      'Only Olivia Owner can close the book',
    );
    expect(screen.queryByRole('button', { name: 'Close the book' })).not.toBeInTheDocument();
  });

  it('keeps the owner action visible but blocks it on unfinished runtime work', () => {
    useProjectPhases.mockReturnValue(settled([{ id: 'phase-1', status: 'delayed' }]));
    useCoordinationItems.mockReturnValue(settled([{ id: 'decision-1', status: 'pending' }]));
    useScopeChangeRequests.mockReturnValue(
      settled([{ id: 'change-1', status: 'approved', applied_at: null }]),
    );

    render(<CareBand projectId="project-1" />);

    expect(screen.getByText(/1 project phase not completed/)).toBeInTheDocument();
    expect(screen.getByText(/1 coordination item unresolved/)).toBeInTheDocument();
    expect(screen.getByText(/1 scope change unresolved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close the book' })).toBeDisabled();
  });

  // A3-L7 — the care rest state ("Everything is settled." / CLOSE THE BOOK) is
  // gated on this band's own closure answer; without this wire the page can
  // never pass `closureReady` and one of the seven rest states is unreachable.
  // D-B9 — and the CHECKLIST with it: the ladder's care stop prints
  // `N OF M CLOSED OUT` off this one report, because nothing else on the page
  // can state the pair without repeating the eight closeout reads.
  it("publishes its closure answer, and its count, to the page", () => {
    const onCloseoutReady = jest.fn();

    render(<CareBand projectId="project-1" onCloseoutReady={onCloseoutReady} />);

    expect(onCloseoutReady).toHaveBeenCalledWith({
      ready: false,
      closed: 1,
      total: 6,
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Final walkthrough completed with client',
      }),
    );
    expect(onCloseoutReady).toHaveBeenLastCalledWith({
      ready: false,
      closed: 2,
      total: 6,
    });
  });

  it('prints the checklist anchor the guide\'s care act names', () => {
    const { container } = render(<CareBand projectId="project-1" />);

    expect(container.querySelector('#closing-the-book')).not.toBeNull();
  });

  it('does not ask the owner to fake a pre-close review request', () => {
    render(<CareBand projectId="project-1" />);

    expect(screen.queryByText('Client review request sent')).not.toBeInTheDocument();
    expect(screen.getByText('Final walkthrough completed with client')).toBeInTheDocument();
  });

  it('surfaces a server-side blocker that arrives after the ready preflight', () => {
    closeMutate.mockImplementation(
      (
        _input: unknown,
        callbacks: { onError: (error: unknown) => void },
      ) => {
        callbacks.onError({
          message:
            'project cannot close: 1 coordination/decision item(s) are unresolved',
        });
      },
    );

    render(<CareBand projectId="project-1" />);

    for (const label of [
      'Final walkthrough completed with client',
      'All punch list items resolved',
      'Professional photography scheduled',
      'Final project photos on file (for portfolio)',
      'Project case study written for portfolio',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Close the book' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'project cannot close: 1 coordination/decision item(s) are unresolved',
    );
  });
});

describe('CareBand fold', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('forces the band open on install phases even with a remembered fold', () => {
    window.localStorage.setItem('patina:doc-fold:project-1:care', '1');

    render(<CareBand projectId="project-1" />);

    expect(screen.getByRole('button', { name: 'Close the book' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /closing the book/i })).not.toBeInTheDocument();
  });

  it('keeps a non-install-phase band open when the remembered choice says so', () => {
    useProjectV2.mockReturnValue(
      settled({
        id: 'project-1',
        name: 'Prairie House',
        status: 'active',
        current_phase: 'design_development',
        designer_id: 'owner-1',
        designer: { full_name: 'Olivia Owner' },
        total_amount_cents: 0,
        start_date: null,
      }),
    );
    window.localStorage.setItem('patina:doc-fold:project-1:care', '0');

    render(<CareBand projectId="project-1" />);

    expect(screen.getByRole('button', { name: 'Close the book' })).toBeInTheDocument();
  });

  it('arrives OPEN on a non-install phase with no remembered choice — the default quiets a stop, it never folds it', () => {
    // R127 OD-10 (W3-L5). This case read "defaults folded to a quiet seam on a
    // non-install phase with no remembered choice". `care` is a STOP key, so a
    // derived default is DENSITY now, not a fold: with no remembered choice the
    // band arrives open and quiet, its head and its leader on the paper.
    useProjectV2.mockReturnValue(
      settled({
        id: 'project-1',
        name: 'Prairie House',
        status: 'active',
        current_phase: 'design_development',
        designer_id: 'owner-1',
        designer: { full_name: 'Olivia Owner' },
        total_amount_cents: 0,
        start_date: null,
      }),
    );

    render(<CareBand projectId="project-1" />);

    expect(document.querySelector('[data-fold-seam]')).toBeNull();
    expect(document.querySelector('[data-region-head]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close the book' })).toBeInTheDocument();
  });

  it('folds to a quiet seam on a non-install phase when she folded it herself, and round-trips', () => {
    // The seam's claims, kept whole under the one cause a stop can still have:
    // her own remembered choice (OD-10). The round trip back to the body is
    // unchanged.
    useProjectV2.mockReturnValue(
      settled({
        id: 'project-1',
        name: 'Prairie House',
        status: 'active',
        current_phase: 'design_development',
        designer_id: 'owner-1',
        designer: { full_name: 'Olivia Owner' },
        total_amount_cents: 0,
        start_date: null,
      }),
    );
    window.localStorage.setItem('patina:doc-fold:project-1:care', '1');

    render(<CareBand projectId="project-1" />);

    expect(screen.queryByRole('button', { name: 'Close the book' })).not.toBeInTheDocument();
    const seam = screen.getByRole('button', { name: /closing the book/i });
    expect(seam).toBeInTheDocument();

    fireEvent.click(seam);
    expect(screen.getByRole('button', { name: 'Close the book' })).toBeInTheDocument();
  });
});

describe('CareBand running index root (W2 C-2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('is absent from the non-owner branch when indexRoot is not set', () => {
    useAuth.mockReturnValue({
      user: { id: 'collaborator-1' },
      isLoading: false,
    });

    const { container } = render(<CareBand projectId="project-1" />);

    expect(container.querySelector('[data-index-region="care"]')).toBeNull();
  });

  it('marks the non-owner branch as the care root when indexRoot is set', () => {
    useAuth.mockReturnValue({
      user: { id: 'collaborator-1' },
      isLoading: false,
    });

    const { container } = render(<CareBand projectId="project-1" indexRoot />);

    const root = container.querySelector('[data-index-region="care"]');
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('id', 'care-region-heading');
    expect(
      screen.getByRole('region', { name: 'Project closeout ownership' }),
    ).toBe(root);
  });

  it('is absent from the open branch when indexRoot is not set', () => {
    const { container } = render(<CareBand projectId="project-1" />);

    expect(screen.getByRole('button', { name: 'Close the book' })).toBeInTheDocument();
    expect(container.querySelector('[data-index-region="care"]')).toBeNull();
  });

  it('marks the open branch as the care root when indexRoot is set', () => {
    const { container } = render(<CareBand projectId="project-1" indexRoot />);

    expect(screen.getByRole('button', { name: 'Close the book' })).toBeInTheDocument();
    const root = container.querySelector('[data-index-region="care"]');
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('id', 'care-region-heading');
  });

  it('marks the folded (quiet seam) branch as the care root when indexRoot is set', () => {
    useProjectV2.mockReturnValue(
      settled({
        id: 'project-1',
        name: 'Prairie House',
        status: 'active',
        current_phase: 'design_development',
        designer_id: 'owner-1',
        designer: { full_name: 'Olivia Owner' },
        total_amount_cents: 0,
        start_date: null,
      }),
    );
    // After OD-10 a stop reaches the seam branch only through her own fold; the
    // branch itself, and the root it must still carry, are unchanged.
    window.localStorage.setItem('patina:doc-fold:project-1:care', '1');

    const { container } = render(<CareBand projectId="project-1" indexRoot />);

    expect(screen.getByRole('button', { name: /closing the book/i })).toBeInTheDocument();
    const root = container.querySelector('[data-index-region="care"]');
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('id', 'care-region-heading');
  });

  // C-04 — the `care` stop is declared on every project spread. A completed
  // project used to render nothing at all, so the ladder printed a stop with
  // no root: no scroll, no heading, a press onto nothing.
  it('marks the completed branch as the care root when indexRoot is set', () => {
    useProjectV2.mockReturnValue(
      settled({
        id: 'project-1',
        name: 'Prairie House',
        status: 'completed',
        current_phase: 'installation',
        designer_id: 'owner-1',
        designer: { full_name: 'Olivia Owner' },
        total_amount_cents: 0,
        start_date: null,
      }),
    );

    const { container } = render(<CareBand projectId="project-1" indexRoot />);

    const root = container.querySelector('[data-index-region="care"]');
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('id', 'care-region-heading');
    expect(screen.getByText(/The book is closed\./)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close the book' }),
    ).not.toBeInTheDocument();
  });

  // C-07 / L-10 — `scrollToRegion` focuses `regionHeadingId('care')`, and
  // `.focus()` on an element that cannot take focus is a silent no-op: the
  // reader lands on the region with focus still in the rail.
  it('gives the care root a focus destination the jump can land on', () => {
    const { container } = render(<CareBand projectId="project-1" indexRoot />);

    const root = container.querySelector<HTMLElement>(
      '[data-index-region="care"]',
    ) as HTMLElement;
    expect(root).toHaveAttribute('tabindex', '-1');
    root.focus();
    expect(document.activeElement).toBe(root);
  });

  it('marks the closed (post-close confirmation) branch as the care root when indexRoot is set', () => {
    closeMutate.mockImplementation(
      (
        _input: unknown,
        callbacks: { onSuccess: () => void },
      ) => {
        callbacks.onSuccess();
      },
    );

    const { container } = render(<CareBand projectId="project-1" indexRoot />);

    for (const label of [
      'Final walkthrough completed with client',
      'All punch list items resolved',
      'Professional photography scheduled',
      'Final project photos on file (for portfolio)',
      'Project case study written for portfolio',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Close the book' }));

    expect(screen.getByText(/The book is closed\./)).toBeInTheDocument();
    const root = container.querySelector('[data-index-region="care"]');
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('id', 'care-region-heading');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockProject: Record<string, unknown> | undefined;
// A shared spy (reset in beforeEach) so the D5 date-vitals tests can assert
// on the writes `VitalDate` sends through `save()`, unlike the fresh-fn
// factory the pre-existing suite above never needed to inspect.
let mockMutateAsync: jest.Mock;

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: mockProject }),
}));

jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutateAsync: mockMutateAsync }),
}));

// The Folio is house-mocked — this suite asserts LetterheadVitals wires
// FolioCalendar's SET (onCommit) and the clear affordance into `save()`
// correctly, not the Folio's own grid/preset behavior (covered by the
// date/__tests__ suites).
jest.mock('@/components/document/date', () => ({
  FolioPopover: ({
    children,
    onClose,
  }: {
    children: React.ReactNode;
    onClose: () => void;
  }) => (
    <div data-testid="folio-popover">
      {children}
      {/* Stands in for Esc/outside-click — a dismissal, not a commit. */}
      <button type="button" onClick={onClose}>
        close-popover
      </button>
    </div>
  ),
  FolioCalendar: ({
    onCommit,
  }: {
    onCommit: (selection: { kind: 'day'; date: string }) => void;
  }) => (
    <button type="button" onClick={() => onCommit({ kind: 'day', date: '2026-09-21' })}>
      commit-picked-date
    </button>
  ),
}));

import { LetterheadTitle, LetterheadVitals } from './letterhead-vitals';

beforeEach(() => {
  mockMutateAsync = jest.fn().mockResolvedValue(undefined);
});

const baseProject = {
  current_phase: 'design_development',
  start_date: null,
  target_end_date: null,
  budget_min: null,
  budget_max: null,
  total_amount_cents: null,
};

describe('LetterheadVitals prints only what is real (D-6, amended by D-B7)', () => {
  it('prints no figure and no placeholder when nothing is recorded — only the acts', () => {
    mockProject = { ...baseProject };
    const { container } = render(<LetterheadVitals projectId="project-1" />);

    // No placeholders in the live-figure register.
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Target')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('—');
    expect(container).not.toHaveTextContent('$');
    expect(screen.queryByText('Band')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Budget band minimum (dollars)'),
    ).not.toBeInTheDocument();

    // D-B7 — the write path survives the suppression: one act per unset
    // vital, and the two empty dates share the single `Set dates` door.
    expect(screen.getByRole('button', { name: 'Set dates' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Set start' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Set target' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Set a budget band' }),
    ).toBeVisible();

    // The phase word is the one fact this project carries, so the row stays.
    expect(screen.getByText('Design Development')).toBeVisible();
  });

  it('still offers both acts when the project carries none of the vitals', () => {
    mockProject = { ...baseProject, current_phase: null };
    render(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByRole('button', { name: 'Set dates' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Set a budget band' }),
    ).toBeVisible();
  });

  it('`Set dates` opens the start editor rather than printing a placeholder', () => {
    mockProject = { ...baseProject };
    render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Set dates' }));
    expect(screen.getByTestId('folio-popover')).toBeInTheDocument();
  });

  it('`Set a budget band` reveals the band editors in place', () => {
    mockProject = { ...baseProject };
    render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Set a budget band' }));

    const min = screen.getByLabelText('Budget band minimum (dollars)');
    expect(min).toBeVisible();
    expect(min).toHaveFocus();
    expect(screen.getByLabelText('Budget band maximum (dollars)')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Set a budget band' }),
    ).not.toBeInTheDocument();
  });

  it('prints a date only once it has one — never `NO DATE YET`', () => {
    mockProject = { ...baseProject, start_date: '2026-01-15' };
    const { container } = render(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByLabelText('Start')).toHaveTextContent('Jan 15');
    // The set date prints its value and no act; its unset sibling names itself.
    expect(
      screen.queryByRole('button', { name: 'Set start' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Target')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set target' })).toBeVisible();
    expect(container).not.toHaveTextContent(/NO DATE YET/i);
    expect(container).not.toHaveTextContent(/NOT KNOWN YET/i);
  });

  it('carries no Phases toggle and no per-phase hours table', () => {
    mockProject = {
      ...baseProject,
      start_date: '2026-01-15',
      budget_min: 5_000_00,
      total_amount_cents: 7_500_00,
    };
    const { container } = render(<LetterheadVitals projectId="project-1" />);

    expect(screen.queryByText(/Phases/)).not.toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
    expect(
      screen.queryByRole('button', { expanded: false }),
    ).not.toBeInTheDocument();
  });

  it('states no total when the contract amount is zero rather than a bare $0', () => {
    mockProject = { ...baseProject, total_amount_cents: 0 };
    const { container } = render(<LetterheadVitals projectId="project-1" />);

    expect(container).not.toHaveTextContent('$0');
  });

  it('states a sub-dollar total to the cent rather than rounding it into $0', () => {
    mockProject = { ...baseProject, total_amount_cents: 49 };
    render(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByText('$0.49')).toBeVisible();
  });

  it('keeps the sign on a credit rather than hiding the figure', () => {
    mockProject = { ...baseProject, total_amount_cents: -7_500_00 };
    render(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByText('−$7,500')).toBeVisible();
  });

  it('renders the band and the total normally once either is recorded', () => {
    mockProject = {
      ...baseProject,
      budget_min: 5_000_00,
      budget_max: 9_000_00,
      total_amount_cents: 7_500_00,
    };
    render(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByLabelText('Budget band minimum (dollars)')).toHaveValue('5000');
    expect(screen.getByText('$7,500')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Set a budget band' }),
    ).not.toBeInTheDocument();
  });
});

describe('LetterheadVitals date vitals — the Calendar Folio (D5)', () => {
  it('SET on the Folio saves the picked date — never a blur commit', async () => {
    mockProject = { ...baseProject, start_date: '2026-01-15' };
    render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByLabelText('Start'));
    fireEvent.click(screen.getByText('commit-picked-date'));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ start_date: '2026-09-21' }),
    );
  });

  it('the clear affordance belongs to the field that has a value', () => {
    mockProject = { ...baseProject, start_date: '2026-01-15' };
    render(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByLabelText('Clear start')).toBeVisible();
    expect(screen.queryByLabelText('Clear target')).not.toBeInTheDocument();
  });

  it('clicking the clear affordance saves null for the field it belongs to', async () => {
    mockProject = { ...baseProject, start_date: '2026-01-15', target_end_date: '2026-03-01' };
    render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByLabelText('Clear target'));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ target_end_date: null }),
    );
    expect(mockMutateAsync).not.toHaveBeenCalledWith({ start_date: null });
  });

  it('a server echo while the popover is open does not clobber the trigger', () => {
    mockProject = { ...baseProject, start_date: '2026-01-15' };
    const { rerender } = render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByLabelText('Start'));
    expect(screen.getByLabelText('Start')).toHaveTextContent('Jan 15');

    // A refetch lands a different value while the popover is still up.
    mockProject = { ...baseProject, start_date: '2026-02-01' };
    rerender(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByLabelText('Start')).toHaveTextContent('Jan 15');
  });

  it('the × hands focus to the act that replaces the field — never to <body>', async () => {
    mockProject = { ...baseProject, start_date: '2026-01-15', target_end_date: '2026-03-01' };
    render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByLabelText('Clear start'));

    const act = screen.getByRole('button', { name: 'Set start' });
    expect(act).toBeVisible();
    // Enabled even mid-save: a disabled button cannot hold focus.
    expect(act).toBeEnabled();
    expect(act).toHaveFocus();
    expect(document.body).not.toHaveFocus();
    // The cleared field prints its act, never a dash in the figure register.
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ start_date: null }),
    );
  });

  it('flushes a pending echo once the popover closes without a pick', () => {
    mockProject = { ...baseProject, start_date: '2026-01-15' };
    const { rerender } = render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByLabelText('Start'));

    // An echo lands while the popover is up — must not clobber it live.
    mockProject = { ...baseProject, start_date: '2026-05-01' };
    rerender(<LetterheadVitals projectId="project-1" />);
    expect(screen.getByLabelText('Start')).toHaveTextContent('Jan 15');

    // Dismiss (Esc/outside-click stand-in) WITHOUT picking a date.
    fireEvent.click(screen.getByText('close-popover'));

    // The display must now show what the server actually has — not stay
    // stuck at the value the popover opened with.
    expect(screen.getByLabelText('Start')).toHaveTextContent('May 1');
  });
});

// ── D-B48 — the paper's name wraps, and never clips ──────────────────────
describe('LetterheadTitle (D-B48)', () => {
  const NAME = 'Aspen Loft — the long paper';

  beforeEach(() => {
    mockMutateAsync = jest.fn().mockResolvedValue(undefined);
    mockProject = { id: 'project-1', name: NAME };
  });

  const renderTitle = () =>
    render(<LetterheadTitle projectId="project-1" serverTitle={NAME} />);

  it('prints the WHOLE name at rest, as text, with no input in the DOM', () => {
    renderTitle();
    // An `<input>` cannot wrap: at 390 this name printed
    // `Aspen Loft — the long p`, and the spec's `scrollWidth === clientWidth`
    // witness was satisfied BY the overflow.
    const button = screen.getByRole('button', { name: 'Rename the project' });
    expect(button).toHaveTextContent(NAME);
    expect(screen.queryByLabelText('Project title')).not.toBeInTheDocument();
    expect(button.className).toContain('break-words');
  });

  it('swaps the input in on a press, carrying the server title, and focuses it', async () => {
    renderTitle();
    fireEvent.click(
      screen.getByRole('button', { name: 'Rename the project' }),
    );
    const input = screen.getByLabelText('Project title') as HTMLInputElement;
    expect(input.value).toBe(NAME);
    await waitFor(() => expect(input).toHaveFocus());
    expect(
      screen.queryByRole('button', { name: 'Rename the project' }),
    ).not.toBeInTheDocument();
  });

  it('Enter saves once and swaps back, with focus on the button', async () => {
    renderTitle();
    fireEvent.click(screen.getByRole('button', { name: 'Rename the project' }));
    const input = screen.getByLabelText('Project title');
    fireEvent.change(input, { target: { value: 'Aspen Loft' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Aspen Loft' }),
    );
    const button = await screen.findByRole('button', {
      name: 'Rename the project',
    });
    await waitFor(() => expect(button).toHaveFocus());
  });

  it('Escape restores the server title and saves NOTHING', async () => {
    renderTitle();
    fireEvent.click(screen.getByRole('button', { name: 'Rename the project' }));
    const input = screen.getByLabelText('Project title');
    fireEvent.change(input, { target: { value: 'something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // It used to BLUR, and blur commits — so the one key that means "leave it
    // alone" saved.
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Rename the project' }),
    ).toHaveTextContent(NAME);
  });

  it('never saves a blank name', () => {
    renderTitle();
    fireEvent.click(screen.getByRole('button', { name: 'Rename the project' }));
    const input = screen.getByLabelText('Project title');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('keeps the heading an <h1> across the swap', () => {
    const { container } = renderTitle();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Rename the project' }));
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });
});

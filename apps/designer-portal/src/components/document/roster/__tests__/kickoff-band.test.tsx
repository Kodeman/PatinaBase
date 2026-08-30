/**
 * The kickoff band's two "add someone" doorways (FIX 2 — kickoff/instrument
 * open modes). Both now dispatch `document:open-call-sheet` directly (the
 * same event ⌘K and the letterhead instrument use) with a mode that
 * pre-addresses the sheet: FROM THE ROLODEX -> 'picker', NEW PERSON -> 'add'.
 * LATER's existing dismissal behavior is left untouched by that change but is
 * still asserted here so a future edit can't silently break it alongside.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ProjectRosterRow } from '@patina/supabase';
import { KickoffBand, kickoffNoteKey } from '../kickoff-band';
import { hasMarginNoteBeenSeen } from '../../margin-note';

let mockFlagValue = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: mockFlagValue, isLoading: false }),
}));

function row(over: Partial<ProjectRosterRow> = {}): ProjectRosterRow {
  return {
    roster_id: `r-${Math.random().toString(36).slice(2)}`,
    source: 'party',
    project_id: 'proj-1',
    kind: 'sub',
    display_name: 'Someone',
    company_name: null,
    email: null,
    phone: null,
    trade: null,
    job_title: null,
    staff_role: null,
    studio_contact_id: null,
    profile_id: null,
    show_to_client: false,
    has_active_field_link: false,
    sms_consent_status: 'not_asked',
    updated_at: null,
    ...over,
  };
}

beforeEach(() => {
  mockFlagValue = true;
  window.localStorage.clear();
});

describe('KickoffBand — the two roster doorways', () => {
  it('takes the one region gap on its root — it stands between two stops', () => {
    // B7: the kickoff band sits between the care stop and the Record, so every
    // block-to-block gap on that path is the same 24px token. Top edge only —
    // a bottom margin here would double the gap into the Record.
    const { container } = render(
      <KickoffBand projectId="proj-1" rows={[row({ kind: 'team', display_name: 'Leah' })]} />,
    );

    const root = container.querySelector<HTMLElement>('[data-kickoff-band]')!;
    expect(root).not.toBeNull();
    expect(root).toHaveClass('mt-[var(--doc-region-gap)]');
    expect(
      root.className.split(/\s+/).filter((cls) => /^m[trblxy]?-/.test(cls)),
    ).toEqual(['mt-[var(--doc-region-gap)]']);
  });

  it('FROM THE ROLODEX dispatches document:open-call-sheet with mode "picker"', async () => {
    const opened = jest.fn();
    window.addEventListener('document:open-call-sheet', opened);

    render(<KickoffBand projectId="proj-1" rows={[row({ kind: 'team', display_name: 'Leah' })]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'From the rolodex' }));
    });

    expect(opened).toHaveBeenCalledTimes(1);
    expect((opened.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ mode: 'picker' });
    window.removeEventListener('document:open-call-sheet', opened);
  });

  it('NEW PERSON dispatches document:open-call-sheet with mode "add"', async () => {
    const opened = jest.fn();
    window.addEventListener('document:open-call-sheet', opened);

    render(<KickoffBand projectId="proj-1" rows={[row({ kind: 'team', display_name: 'Leah' })]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New person' }));
    });

    expect(opened).toHaveBeenCalledTimes(1);
    expect((opened.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ mode: 'add' });
    window.removeEventListener('document:open-call-sheet', opened);
  });

  it('LATER marks the note seen and hides the band without dispatching anything', async () => {
    const opened = jest.fn();
    window.addEventListener('document:open-call-sheet', opened);

    render(<KickoffBand projectId="proj-1" rows={[row({ kind: 'team', display_name: 'Leah' })]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    });

    expect(opened).not.toHaveBeenCalled();
    expect(screen.queryByText(/Who else is on the job/)).not.toBeInTheDocument();
    expect(hasMarginNoteBeenSeen(kickoffNoteKey('proj-1'))).toBe(true);
    window.removeEventListener('document:open-call-sheet', opened);
  });

  it('renders nothing when the call-sheet flag is off', async () => {
    mockFlagValue = false;
    render(<KickoffBand projectId="proj-1" rows={[row({ kind: 'team', display_name: 'Leah' })]} />);
    // The reveal effect still runs, but the flag gate returns null before it.
    expect(screen.queryByText(/Who else is on the job/)).not.toBeInTheDocument();
  });
});

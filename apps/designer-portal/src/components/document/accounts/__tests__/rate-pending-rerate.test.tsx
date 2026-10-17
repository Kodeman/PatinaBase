/**
 * K8 (amends P-4) — once an owner/admin saves a member's rate, the hours that
 * member logged with no rate are offered for pricing at the row the save wrote,
 * by an explicit act. Counted in hours, never entries; a save alone re-rates
 * nothing. The composer's "Set <name>'s rate" lands on this field.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudioRateRows } from '../../account/studio-rate-rows';
import type { StudioMemberRate } from '@patina/supabase';

const mockSetRate = jest.fn();
const mockRerate = jest.fn();
let mockRerateError: unknown = null;

jest.mock('@patina/supabase', () => ({
  useSetStudioMemberRate: () => ({ mutate: mockSetRate, isPending: false }),
  useRerateRatePendingHours: () => ({
    mutate: mockRerate,
    reset: jest.fn(),
    isPending: false,
    error: mockRerateError,
  }),
}));

const LINE = /hours were logged before this rate/;

const row = (over: Partial<StudioMemberRate> = {}): StudioMemberRate => ({
  id: 'rate-1',
  studio_id: 'studio-1',
  user_id: 'maria',
  hourly_rate_cents: 15_000,
  effective_from: '2026-09-01',
  effective_to: null,
  created_by: 'leah',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  ...over,
});

const SAVED = row({
  id: 'rate-new',
  hourly_rate_cents: 17_500,
  effective_from: '2026-10-16',
});

const rows = (props: Partial<Parameters<typeof StudioRateRows>[0]> = {}) => (
  <StudioRateRows
    studioId="studio-1"
    userId="maria"
    memberLabel="Maria Obi"
    rates={[row()]}
    {...props}
  />
);

const saveRate = () =>
  fireEvent.blur(screen.getByLabelText('Hourly rate for Maria Obi'), {
    target: { value: '175' },
  });

beforeEach(() => {
  mockRerateError = null;
  mockRerate.mockReset();
  mockSetRate
    .mockReset()
    .mockImplementation((_input, options: { onSuccess: (r: StudioMemberRate) => void }) =>
      options.onSuccess(SAVED),
    );
});

describe('StudioRateRows · re-rate pending hours (K8)', () => {
  it('offers nothing after a save when the member has no pending hours', () => {
    render(rows({ pendingMinutes: 0 }));
    saveRate();

    expect(mockSetRate).toHaveBeenCalled();
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Price them' })).not.toBeInTheDocument();
  });

  it('offers nothing before a save, however many hours are pending', () => {
    render(rows({ pendingMinutes: 90 }));

    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it('counts the pending hours in hours to one decimal, at the rate the save wrote', () => {
    // Three entries of 30, 30 and 35 minutes reach here as their sum.
    render(rows({ pendingMinutes: 95 }));
    saveRate();

    expect(
      screen.getByText('1.6 hours were logged before this rate. Price them at $175.00/hr?'),
    ).toBeInTheDocument();
  });

  it('SQ-1113: prints whole hours without a trailing .0, and keeps a real fraction', () => {
    render(rows({ pendingMinutes: 180 }));
    saveRate();
    expect(
      screen.getByText('3 hours were logged before this rate. Price them at $175.00/hr?'),
    ).toBeInTheDocument();
  });

  it('SQ-1113: a save that raises the offer moves focus to Price them', async () => {
    render(
      <>
        {rows({ pendingMinutes: 90 })}
        <input aria-label="Next rate field" />
      </>,
    );
    const next = screen.getByLabelText('Next rate field');
    next.focus();
    saveRate();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Price them' })).toHaveFocus());
  });

  it('SQ-1113: a save that raises no offer leaves focus in the next field', async () => {
    render(
      <>
        {rows({ pendingMinutes: 0 })}
        <input aria-label="Next rate field" />
      </>,
    );
    const next = screen.getByLabelText('Next rate field');
    next.focus();
    saveRate();

    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
    });
    expect(next).toHaveFocus();
  });

  it('prices only on the act, at the saved row, then says it priced them', () => {
    render(rows({ pendingMinutes: 90 }));
    saveRate();
    expect(mockRerate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Price them' }));
    expect(mockRerate).toHaveBeenCalledWith(
      { rateId: 'rate-new', expectedRateCents: 17_500 },
      expect.anything(),
    );

    const [, options] = mockRerate.mock.calls[0] as [unknown, { onSuccess: (n: number) => void }];
    act(() => options.onSuccess(2));

    expect(screen.getByRole('status')).toHaveTextContent('Priced the hours logged before this rate.');
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it("SQ-1090: says nothing was priced when the server priced no hours, whatever the estimate said", () => {
    render(rows({ pendingMinutes: 90 }));
    saveRate();
    fireEvent.click(screen.getByRole('button', { name: 'Price them' }));

    const [, options] = mockRerate.mock.calls[0] as [unknown, { onSuccess: (n: number) => void }];
    act(() => options.onSuccess(0));

    expect(screen.getByRole('status')).toHaveTextContent('No hours were waiting for this rate.');
    expect(screen.getByRole('status')).not.toHaveTextContent(/Priced/);
  });

  it('never offers the line on a row whose writes would price nothing (HT-3-e(2))', () => {
    render(rows({ pendingMinutes: 90, selfAuthoredInert: true }));

    // No field, so no save, so nothing to price at.
    expect(screen.queryByLabelText('Hourly rate for Maria Obi')).not.toBeInTheDocument();
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Price them' })).not.toBeInTheDocument();
  });

  it("prints the server's refusal in its own words", () => {
    // 00797's text, verbatim: its function's name and the row's id lead it.
    mockRerateError = {
      code: '23514',
      message:
        "rerate_pending_time_entries: rate 6f1c2a9e-0000-4000-8000-000000000001 has been superseded and is not this member's current rate",
    };
    render(rows({ pendingMinutes: 90 }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'This rate has been superseded and is not this member’s current rate.',
    );
    expect(alert).not.toHaveTextContent('rerate_pending_time_entries');
    expect(alert).not.toHaveTextContent('6f1c2a9e');
  });

  it('says a rate corrected since the save must be saved again, in the server’s words (40001)', () => {
    mockRerateError = {
      code: '40001',
      message:
        'rerate_pending_time_entries: the rate changed since you saved it; save it again to price these hours',
    };
    render(rows({ pendingMinutes: 90 }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'The rate changed since you saved it; save it again to price these hours.',
    );
    expect(alert).not.toHaveTextContent('rerate_pending_time_entries');
    expect(alert).not.toHaveTextContent('40001');
  });

  it("lands focus on the field when the composer's Set rate sent her here", async () => {
    render(rows({ focusOnMount: true }));

    await waitFor(() =>
      expect(screen.getByLabelText('Hourly rate for Maria Obi')).toHaveFocus(),
    );
  });
});

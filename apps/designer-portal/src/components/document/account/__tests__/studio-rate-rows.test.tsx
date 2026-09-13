/**
 * The studio rate field (HT-3) and the one row it must NOT offer (HT-3-e(2)).
 *
 * 00615 prices a `studio_member_rates` row whose `created_by` IS its own
 * `user_id` only where that person is the studio's owner. So for an admin's own
 * row the field would save, show its dated history, and leave her hours reading
 * "rate pending" with nothing on screen to say why — the one surface that could
 * explain it instead inviting the inert write.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { StudioRateRows } from '../studio-rate-rows';
import type { StudioMemberRate } from '@patina/supabase';

const setRate = jest.fn();

jest.mock('@patina/supabase', () => ({
  useSetStudioMemberRate: () => ({ mutate: setRate, isPending: false }),
}));

const rate = (over: Partial<StudioMemberRate> = {}): StudioMemberRate => ({
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

beforeEach(() => setRate.mockReset());

describe('StudioRateRows', () => {
  it('takes a rate on blur for a teammate', () => {
    render(
      <StudioRateRows
        studioId="studio-1"
        userId="maria"
        memberLabel="Maria Obi"
        rates={[rate()]}
      />,
    );

    const field = screen.getByLabelText('Hourly rate for Maria Obi');
    fireEvent.blur(field, { target: { value: '175' } });
    expect(setRate).toHaveBeenCalledWith(
      { studioId: 'studio-1', userId: 'maria', hourlyRateCents: 17_500 },
      expect.anything(),
    );
  });

  it('offers no field on the acting admin’s own row, and says why', () => {
    render(
      <StudioRateRows
        studioId="studio-1"
        userId="maria"
        memberLabel="Maria Obi"
        rates={[rate({ created_by: 'maria' })]}
        selfAuthoredInert
      />,
    );

    expect(
      screen.queryByLabelText('Hourly rate for Maria Obi'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/does not price your own hours/),
    ).toBeInTheDocument();
    // The row she wrote is named as the reason, not reported as a rate in force.
    expect(screen.getByText(/written by you/)).toBeInTheDocument();
  });

  it('keeps the history readable, and calls a studio-written rate what it is', () => {
    render(
      <StudioRateRows
        studioId="studio-1"
        userId="maria"
        memberLabel="Maria Obi"
        rates={[rate()]}
        selfAuthoredInert
      />,
    );

    expect(screen.getByText(/written for you by the studio/)).toBeInTheDocument();
    expect(screen.getByText(/from Sep 1, 2026/)).toBeInTheDocument();
  });
});

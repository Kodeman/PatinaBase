/**
 * "Log who was told" — the inline band (SPEC §5.6 #8).
 *
 * Never a modal, always a disclosure whose trigger names its panel, and never
 * a name that has already been told about this change.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NoticeLog } from '../notice-log';

const logToldMutate = jest.fn();
/** CRM-23 — the durable half of "Log who was told". */
const recordNoticeMutate = jest.fn();

jest.mock('@patina/supabase', () => ({
  useLogSiteAccessTold: () => ({ mutateAsync: logToldMutate, isPending: false }),
  useRecordNotice: () => ({ mutateAsync: recordNoticeMutate, isPending: false }),
  asNoticeError: (e: unknown) =>
    e instanceof Error ? e.message : String(e ?? ''),
}));

const SEATS = [
  { seatId: 'seat-luis', name: 'Luis Ochoa' },
  { seatId: 'seat-ngozi', name: 'Ngozi Eze' },
  { seatId: 'seat-joe', name: 'Joe Wozniak' },
];

beforeEach(() => {
  logToldMutate.mockReset().mockResolvedValue({});
  recordNoticeMutate.mockReset().mockResolvedValue({
    id: 'touch-1',
    what: 'The way in changed.',
    recorded_at: '2026-09-15T00:00:00Z',
    recorded_by: 'Leah',
    told_names: ['Luis Ochoa'],
  });
});

describe('NoticeLog', () => {
  it('pairs aria-expanded with aria-controls on the band', () => {
    render(
      <NoticeLog projectId="okonkwo" seats={SEATS} told={[]} panelId="notice-panel" />,
    );
    const act = screen.getByRole('button', { name: /Log who was told/ });
    expect(act).toHaveAttribute('aria-expanded', 'false');
    expect(act).toHaveAttribute('aria-controls', 'notice-panel');
    fireEvent.click(act);
    expect(act).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers only the names nobody has told yet', () => {
    render(
      <NoticeLog
        projectId="okonkwo"
        seats={SEATS}
        told={['seat-luis']}
        panelId="notice-panel"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Log who was told/ }));
    expect(screen.queryByRole('checkbox', { name: 'Luis Ochoa' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ngozi Eze' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Joe Wozniak' })).toBeInTheDocument();
  });

  it('writes every name picked, in one act', async () => {
    render(
      <NoticeLog projectId="okonkwo" seats={SEATS} told={[]} panelId="notice-panel" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Log who was told/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ngozi Eze' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Joe Wozniak' }));
    fireEvent.click(screen.getByRole('button', { name: /Save this note/ }));
    expect(logToldMutate).toHaveBeenCalledWith({
      projectId: 'okonkwo',
      seatIds: ['seat-ngozi', 'seat-joe'],
    });
    await screen.findByText('2 more names are on the notice.');
  });

  /* ── CRM-23 — the durable record beside the card's own list ──────────── */

  it('writes the notice with the fact the card passed and the names picked', async () => {
    render(
      <NoticeLog
        projectId="okonkwo"
        seats={SEATS}
        told={[]}
        panelId="notice-panel"
        fact="The way in changed 12 Sep 2026. Lockbox, version 3."
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Log who was told/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ngozi Eze' }));
    fireEvent.click(screen.getByRole('button', { name: /Save this note/ }));
    await waitFor(() =>
      expect(recordNoticeMutate).toHaveBeenCalledWith({
        projectId: 'okonkwo',
        what: 'The way in changed 12 Sep 2026. Lockbox, version 3.',
        told: ['seat-ngozi'],
      }),
    );
  });

  it('writes the card first, so the list the phone reads always lands', async () => {
    const order: string[] = [];
    logToldMutate.mockImplementation(async () => {
      order.push('card');
      return {};
    });
    recordNoticeMutate.mockImplementation(async () => {
      order.push('notice');
      return { id: 'touch-1' };
    });
    render(
      <NoticeLog projectId="okonkwo" seats={SEATS} told={[]} panelId="notice-panel" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Log who was told/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ngozi Eze' }));
    fireEvent.click(screen.getByRole('button', { name: /Save this note/ }));
    await waitFor(() => expect(order).toEqual(['card', 'notice']));
  });

  it('says the names landed AND that the record did not, when it did not', async () => {
    recordNoticeMutate.mockRejectedValue(new Error('notice_not_authorized'));
    render(
      <NoticeLog projectId="okonkwo" seats={SEATS} told={[]} panelId="notice-panel" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Log who was told/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ngozi Eze' }));
    fireEvent.click(screen.getByRole('button', { name: /Save this note/ }));
    const note = await screen.findByText(/One more name is on the notice\./);
    expect(note).toHaveTextContent('The record of the change did not save');
  });

  it('never writes a notice when the card refused the names', async () => {
    logToldMutate.mockRejectedValue(
      new Error('There is no site access card on this job yet.'),
    );
    render(
      <NoticeLog projectId="okonkwo" seats={SEATS} told={[]} panelId="notice-panel" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Log who was told/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ngozi Eze' }));
    fireEvent.click(screen.getByRole('button', { name: /Save this note/ }));
    await screen.findByText('There is no site access card on this job yet.');
    expect(recordNoticeMutate).not.toHaveBeenCalled();
  });

  it('says so when everyone on the job has been told', () => {
    render(
      <NoticeLog
        projectId="okonkwo"
        seats={SEATS}
        told={SEATS.map((s) => s.seatId)}
        panelId="notice-panel"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Log who was told/ }));
    expect(screen.getByText('– Everyone on the job has been told.')).toBeInTheDocument();
  });
});

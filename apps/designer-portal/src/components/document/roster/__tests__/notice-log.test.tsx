/**
 * "Log who was told" — the inline band (SPEC §5.6 #8).
 *
 * Never a modal, always a disclosure whose trigger names its panel, and never
 * a name that has already been told about this change.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { NoticeLog } from '../notice-log';

const logToldMutate = jest.fn();

jest.mock('@patina/supabase', () => ({
  useLogSiteAccessTold: () => ({ mutateAsync: logToldMutate, isPending: false }),
}));

const SEATS = [
  { seatId: 'seat-luis', name: 'Luis Ochoa' },
  { seatId: 'seat-ngozi', name: 'Ngozi Eze' },
  { seatId: 'seat-joe', name: 'Joe Wozniak' },
];

beforeEach(() => {
  logToldMutate.mockReset().mockResolvedValue({});
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

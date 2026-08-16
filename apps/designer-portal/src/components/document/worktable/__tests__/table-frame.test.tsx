/**
 * The frame is the only thing the flag changes. What it must do: print the
 * children and nothing else when there is no table; name the table it composes;
 * print the turn line only when the derivation has moved, and turn on the
 * press; print Intake's honest seams; and print no empty slot.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TableFrame } from '../table-frame';
import type { TableComposition } from '@/lib/document/table-derivation';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const DELIVERY: TableComposition = {
  table: 'delivery',
  section: 'project',
  setting: 'procurement',
};
const INTAKE: TableComposition = { table: 'intake', section: 'discovery' };
const SPECCING: TableComposition = { table: 'speccing', section: 'direction' };

function frame(props: Partial<React.ComponentProps<typeof TableFrame>> = {}) {
  return render(
    <TableFrame
      composition={DELIVERY}
      pending={null}
      onTurn={jest.fn()}
      sealTurn={null}
      slots={{}}
      {...props}
    >
      <p data-spread>the spread</p>
    </TableFrame>,
  );
}

describe('TableFrame', () => {
  it('prints only the spread when there is no table (the flag is off)', () => {
    const { container } = frame({ composition: null });

    expect(container.querySelector('[data-spread]')).not.toBeNull();
    expect(container.querySelector('[data-table]')).toBeNull();
    expect(container.querySelector('[data-table-turn]')).toBeNull();
  });

  it('names the table and its setting', () => {
    const { container } = frame();

    const table = container.querySelector('[data-table]')!;
    expect(table.getAttribute('data-table')).toBe('delivery');
    expect(table.getAttribute('data-table-setting')).toBe('procurement');
    expect(table.querySelector('[data-spread]')).not.toBeNull();
  });

  it('says nothing while the derivation agrees', () => {
    const { container } = frame({ pending: null });

    expect(container.querySelector('[data-table-turn]')).toBeNull();
  });

  it('arms one line when the derivation has moved, and turns on the press', async () => {
    const onTurn = jest.fn();
    const { container } = frame({ pending: INTAKE, onTurn });

    expect(container.querySelectorAll('[data-table-turn]')).toHaveLength(1);
    expect(screen.getByText('The table is ready to turn —')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /turn it/i }));

    expect(onTurn).toHaveBeenCalledTimes(1);
  });

  it('prints the seal’s note on the Delivery table, and only there', () => {
    const withNote = frame({ sealTurn: { signedDate: 'Mar 4' } });
    expect(
      withNote.container.querySelector('[data-seal-turn-note]')?.textContent,
    ).toBe('This proposal was signed Mar 4 and continued as the project document.');
    withNote.unmount();

    const elsewhere = frame({
      composition: SPECCING,
      sealTurn: { signedDate: 'Mar 4' },
    });
    expect(elsewhere.container.querySelector('[data-seal-turn-note]')).toBeNull();
  });

  it('drops the date clause rather than guessing it', () => {
    const { container } = frame({ sealTurn: { signedDate: null } });

    expect(container.querySelector('[data-seal-turn-note]')?.textContent).toBe(
      'This proposal was signed and continued as the project document.',
    );
  });

  it('prints the future seams on the Intake table only', () => {
    const intake = frame({ composition: INTAKE });
    expect(intake.container.querySelectorAll('[data-future-seam]')).toHaveLength(3);
    expect(screen.getByText('Opens with the Direction')).toBeInTheDocument();
    intake.unmount();

    const delivery = frame();
    expect(delivery.container.querySelector('[data-future-seam]')).toBeNull();
  });

  it('prints nothing for an unfilled Speccing slot, and a root for a filled one', () => {
    const empty = frame({ composition: SPECCING });
    expect(empty.container.querySelector('[data-table-slot]')).toBeNull();
    empty.unmount();

    const filled = frame({
      composition: SPECCING,
      slots: { scheme: <p>the loose scheme</p> },
    });
    const slots = Array.from(
      filled.container.querySelectorAll('[data-table-slot]'),
    ).map((el) => el.getAttribute('data-table-slot'));
    expect(slots).toEqual(['scheme']);
  });
});

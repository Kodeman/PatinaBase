import { fireEvent, render, screen } from '@testing-library/react';
import {
  ALL_STAFF_ROLES,
  STAFF_ROLE_LABELS,
  STAFF_ROLE_DEFAULT_TIER,
} from '@patina/types';
import { TitlePicker, findStaffRoleByLabel } from '../title-picker';

describe('TitlePicker', () => {
  it('lists all nine curated titles plus Custom title…', () => {
    expect(ALL_STAFF_ROLES).toHaveLength(9);

    render(
      <TitlePicker value={null} onPick={jest.fn()} onClose={jest.fn()} />,
    );

    for (const role of ALL_STAFF_ROLES) {
      expect(
        screen.getByRole('option', { name: new RegExp(STAFF_ROLE_LABELS[role]) }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText('Custom title…')).toBeInTheDocument();
  });

  it('shows the right-aligned mono tier hint beside each title by default', () => {
    render(
      <TitlePicker value={null} onPick={jest.fn()} onClose={jest.fn()} />,
    );

    for (const role of ALL_STAFF_ROLES) {
      expect(
        screen.getAllByText(STAFF_ROLE_DEFAULT_TIER[role]).length,
      ).toBeGreaterThan(0);
    }
  });

  it('hides tier hints when showTierHints is false', () => {
    render(
      <TitlePicker
        value={null}
        onPick={jest.fn()}
        onClose={jest.fn()}
        showTierHints={false}
      />,
    );

    expect(screen.queryByText('owner')).not.toBeInTheDocument();
    expect(screen.queryByText('member')).not.toBeInTheDocument();
  });

  it('picking a curated title calls onPick with its label and default tier', () => {
    const onPick = jest.fn();
    render(<TitlePicker value={null} onPick={onPick} onClose={jest.fn()} />);

    fireEvent.click(
      screen.getByRole('option', { name: /Senior Designer/ }),
    );

    expect(onPick).toHaveBeenCalledWith(
      STAFF_ROLE_LABELS.senior_designer,
      STAFF_ROLE_DEFAULT_TIER.senior_designer,
    );
  });

  it('swaps Custom title… for an underline input, and submits free text with no suggested tier', () => {
    const onPick = jest.fn();
    render(<TitlePicker value={null} onPick={onPick} onClose={jest.fn()} />);

    fireEvent.click(screen.getByText('Custom title…'));
    const input = screen.getByPlaceholderText('Custom title');
    fireEvent.change(input, { target: { value: 'Head of Sourcing' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPick).toHaveBeenCalledWith('Head of Sourcing');
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('does not submit an empty/whitespace-only custom title', () => {
    const onPick = jest.fn();
    render(<TitlePicker value={null} onPick={onPick} onClose={jest.fn()} />);

    fireEvent.click(screen.getByText('Custom title…'));
    const input = screen.getByPlaceholderText('Custom title');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onPick).not.toHaveBeenCalled();
  });

  it('always shows the permissions hint', () => {
    render(
      <TitlePicker value={null} onPick={jest.fn()} onClose={jest.fn()} />,
    );

    expect(
      screen.getByText('Changing a title never changes permissions.'),
    ).toBeInTheDocument();
  });

  it('marks the current value selected via aria-selected', () => {
    render(
      <TitlePicker
        value={STAFF_ROLE_LABELS.bookkeeper}
        onPick={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('option', { name: /Bookkeeper/ }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(<TitlePicker value={null} onPick={jest.fn()} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on an outside click', () => {
    const onClose = jest.fn();
    render(
      <div>
        <button type="button">outside</button>
        <TitlePicker value={null} onPick={jest.fn()} onClose={onClose} />
      </div>,
    );

    fireEvent.pointerDown(screen.getByText('outside'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a click inside the panel', () => {
    const onClose = jest.fn();
    render(<TitlePicker value={null} onPick={jest.fn()} onClose={onClose} />);

    fireEvent.pointerDown(screen.getByRole('listbox'));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('findStaffRoleByLabel', () => {
  it('reverse-maps every curated label back to its role key', () => {
    for (const role of ALL_STAFF_ROLES) {
      expect(findStaffRoleByLabel(STAFF_ROLE_LABELS[role])).toBe(role);
    }
  });

  it('returns undefined for free text', () => {
    expect(findStaffRoleByLabel('Head of Sourcing')).toBeUndefined();
  });
});

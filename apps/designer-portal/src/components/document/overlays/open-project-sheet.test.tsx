import { fireEvent, render, screen } from '@testing-library/react';
import { OpenProjectSheet } from './open-project-sheet';

const mutate = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/use-project-lifecycle', () => ({
  useOpenProjectDirect: () => ({ mutate, isPending: false }),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => <button type="button">Choose household</button>,
}));

// The Folio-backed trigger is proven in its own suite (date-text-input.test.tsx);
// here we only need a controlled stand-in so the sheet's own plumbing (default,
// change, clear) can be exercised directly.
jest.mock('../date-text-input', () => ({
  DateTextInput: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
    ariaLabel?: string;
  }) => (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
    />
  ),
}));

describe('OpenProjectSheet date validity', () => {
  beforeEach(() => {
    mutate.mockReset();
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => 'project-1'),
    });
  });

  it('opens a project with no start date when the date is cleared', () => {
    render(<OpenProjectSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Lake house refresh' },
    });

    // The Folio can only ever commit a whole calendar date or clear to
    // nothing — an impossible date like Feb 30 has no pathway into state at
    // all, so the case worth proving is that clearing opens the project with
    // no start date rather than blocking it.
    const start = screen.getByLabelText('Start date');
    fireEvent.change(start, { target: { value: '' } });
    expect(start).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: /open the project/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: 'Lake house refresh', startDate: null }),
    );
  });

  it('carries a real start date through to the mutation', () => {
    render(<OpenProjectSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Lake house refresh' },
    });
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2027-03-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /open the project/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ startDate: '2027-03-01' }),
    );
  });
});

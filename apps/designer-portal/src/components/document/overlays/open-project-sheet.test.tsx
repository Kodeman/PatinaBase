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

describe('OpenProjectSheet date validity', () => {
  beforeEach(() => {
    mutate.mockReset();
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => 'project-1'),
    });
  });

  it('never opens a project on an impossible calendar date', () => {
    render(<OpenProjectSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Lake house refresh' },
    });

    // Feb 30 does not exist; the native date control refuses it rather than
    // letting it through as a start date the project would be opened on.
    const start = screen.getByLabelText('Start date');
    fireEvent.change(start, { target: { value: '2027-02-30' } });
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

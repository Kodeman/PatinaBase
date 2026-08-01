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

  it('does not open a project while the direct-entry date is invalid', () => {
    render(<OpenProjectSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Lake house refresh' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Start date' }), {
      target: { value: '02/30/2027' },
    });
    fireEvent.click(screen.getByRole('button', { name: /open the project/i }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /open the project/i })).toBeDisabled();
  });
});

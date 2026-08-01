import { fireEvent, render, screen, within } from '@testing-library/react';
import { DocSheet } from './doc-sheet';

describe('DocSheet dismissal', () => {
  it('puts an operable close control inside the dialog', () => {
    const onClose = jest.fn();

    render(
      <DocSheet open onClose={onClose} title="The household">
        <p>Household details</p>
      </DocSheet>,
    );

    const dialog = screen.getByRole('dialog', { name: 'The household' });
    const close = within(dialog).getByRole('button', { name: 'Close sheet' });

    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses from the visible backdrop without changing the dialog target', () => {
    const onClose = jest.fn();

    render(
      <DocSheet open onClose={onClose} title="The household">
        <p>Household details</p>
      </DocSheet>,
    );

    fireEvent.pointerDown(screen.getByTestId('doc-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

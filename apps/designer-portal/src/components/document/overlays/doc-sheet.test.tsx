import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocSheet } from './doc-sheet';

function StatefulSheet({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open household
      </button>
      <button type="button" data-testid="outside-action">
        Outside action
      </button>
      <DocSheet open={open} onClose={() => setOpen(false)} title="The household">
        <p>Household details</p>
        <button type="button">First sheet action</button>
        <button type="button">Last sheet action</button>
      </DocSheet>
    </div>
  );
}

describe('DocSheet modal behavior', () => {
  it('dismisses from its visible close control and restores focus to the opener', async () => {
    const user = userEvent.setup();
    render(<StatefulSheet />);

    const opener = screen.getByRole('button', { name: 'Open household' });
    await act(async () => {
      await user.click(opener);
    });

    const dialog = screen.getByRole('dialog', { name: 'The household' });
    await act(async () => {
      await user.click(within(dialog).getByRole('button', { name: 'Close sheet' }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'The household' })).not.toBeInTheDocument();
      expect(document.body.style.pointerEvents).toBe('');
    });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('dismisses from the visible backdrop', async () => {
    const user = userEvent.setup();
    render(<StatefulSheet initiallyOpen />);

    expect(screen.getByRole('dialog', { name: 'The household' })).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getByTestId('doc-sheet-backdrop'));
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'The household' })).not.toBeInTheDocument();
    });
  });

  it('gives Escape to the modal before an underlying document shortcut', async () => {
    const user = userEvent.setup();
    const underlyingEscape = jest.fn();
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') underlyingEscape();
    };
    document.addEventListener('keydown', onDocumentKeyDown);

    try {
      render(<StatefulSheet initiallyOpen />);
      await act(async () => {
        await user.keyboard('{Escape}');
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'The household' })).not.toBeInTheDocument();
      });
      expect(underlyingEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', onDocumentKeyDown);
    }
  });

  it('contains forward and reverse Tab navigation inside the modal', async () => {
    const user = userEvent.setup();
    render(<StatefulSheet initiallyOpen />);

    const dialog = screen.getByRole('dialog', { name: 'The household' });
    const close = within(dialog).getByRole('button', { name: 'Close sheet' });
    const last = within(dialog).getByRole('button', { name: 'Last sheet action' });

    last.focus();
    await act(async () => {
      await user.tab();
    });
    expect(close).toHaveFocus();

    await act(async () => {
      await user.tab({ shift: true });
    });
    expect(last).toHaveFocus();
    expect(screen.getByTestId('outside-action')).not.toHaveFocus();
  });

  it('hides the outside tree and disables outside pointer interaction while open', async () => {
    render(<StatefulSheet initiallyOpen />);

    const outside = screen.getByTestId('outside-action');
    await waitFor(() => {
      expect(outside.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(document.body.style.pointerEvents).toBe('none');
    });
    const dialog = screen.getByRole('dialog', { name: 'The household' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveStyle({ pointerEvents: 'auto' });
  });
});

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { DocSheet } from './doc-sheet';

jest.mock('@/lib/help-system/open-help', () => ({
  openHelp: jest.fn(),
}));

function SheetHarness({ icon = false }: { icon?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open orders
      </button>
      <DocSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Order review"
        icon={icon ? FileText : undefined}
      >
        <button type="button" hidden>
          Hidden action
        </button>
        <button type="button">First action</button>
        <input aria-label="Order note" />
        <button type="button">Last action</button>
      </DocSheet>
    </>
  );
}

describe('DocSheet', () => {
  it('labels the dialog, isolates scroll, and restores its opener after backdrop close', async () => {
    render(<SheetHarness />);
    const opener = screen.getByRole('button', { name: 'Open orders' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Order review' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-doc-sheet-panel');
    expect(dialog).toHaveClass('doc-sheet-panel');
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(dialog).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Order review' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(opener).toHaveFocus());
    expect(document.body.style.overflow).toBe('');
  });

  it('cycles Tab and Shift+Tab inside the sheet', async () => {
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open orders' }));

    const dialog = screen.getByRole('dialog', { name: 'Order review' });
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });
    await waitFor(() => expect(dialog).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    expect(screen.getByText('Hidden action')).not.toHaveFocus();

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('closes on Escape and exposes a visible labelled title when it owns the head', async () => {
    const onClose = jest.fn();
    render(
      <DocSheet open onClose={onClose} title="Order review" icon={FileText}>
        <p>Three orders need review.</p>
      </DocSheet>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Order review' });
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId ?? '')).toHaveTextContent(
      'Order review',
    );
    expect(screen.getByRole('button', { name: 'Put back · Esc' })).toHaveClass(
      'min-h-11',
      'doc-type-meta',
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

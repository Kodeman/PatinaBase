import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { DocSheet } from './doc-sheet';

jest.mock('@/lib/help-system/open-help', () => ({
  openHelp: jest.fn(),
}));

function SheetHarness({
  icon = false,
  tall = false,
  wide = false,
}: {
  icon?: boolean;
  tall?: boolean;
  wide?: boolean;
}) {
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
        wide={wide}
      >
        <button type="button" hidden>
          Hidden action
        </button>
        <button type="button">First action</button>
        <input aria-label="Order note" />
        {tall ? (
          <div data-testid="tall-sheet-body" className="h-[1200px]">
            The order ledger continues.
          </div>
        ) : null}
        <button type="button">Last action</button>
      </DocSheet>
    </>
  );
}

function NestedSheetHarness() {
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOuterOpen(true)}>
        Open outer sheet
      </button>
      <DocSheet
        open={outerOpen}
        onClose={() => setOuterOpen(false)}
        title="Outer review"
        icon={FileText}
      >
        <button type="button" onClick={() => setInnerOpen(true)}>
          Open nested sheet
        </button>
      </DocSheet>
      <DocSheet
        open={innerOpen}
        onClose={() => setInnerOpen(false)}
        title="Nested review"
      >
        <p>The nested decision.</p>
        <button type="button">First nested action</button>
        <button type="button">Last nested action</button>
      </DocSheet>
    </>
  );
}

describe('DocSheet', () => {
  it('labels the dialog, isolates scroll, and restores its opener after visible close', async () => {
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


  it('dismisses from the visible backdrop without trapping pointer state', async () => {
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open orders' }));

    expect(screen.getByRole('dialog', { name: 'Order review' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('doc-sheet-backdrop'));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Order review' }),
      ).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('cycles Tab and Shift+Tab inside the sheet', async () => {
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open orders' }));

    const dialog = screen.getByRole('dialog', { name: 'Order review' });
    const close = screen.getByRole('button', { name: 'Close sheet' });
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });
    await waitFor(() => expect(dialog).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
    expect(first).not.toHaveFocus();
    expect(screen.getByText('Hidden action')).not.toHaveFocus();

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('keeps the head reachable and makes the paper the bounded scroll region', async () => {
    render(<SheetHarness icon tall />);
    fireEvent.click(screen.getByRole('button', { name: 'Open orders' }));

    const dialog = screen.getByRole('dialog', { name: 'Order review' });
    const layer = dialog.closest('[data-doc-sheet-layer]');
    expect(layer).toHaveClass(
      'items-start',
      'overflow-hidden',
      'pt-[var(--doc-sheet-inset-top)]',
      'pb-[var(--doc-sheet-inset-bottom)]',
      'pl-[var(--doc-sheet-inset-left)]',
      'pr-[var(--doc-sheet-inset-right)]',
    );
    expect(dialog).toHaveAttribute('data-doc-sheet-scroll-region');
    expect(dialog).toHaveClass(
      'my-auto',
      'max-h-[calc(100dvh_-_var(--doc-sheet-inset-top)_-_var(--doc-sheet-inset-bottom))]',
      'overflow-y-auto',
      'overscroll-contain',
    );
    expect(dialog).toContainElement(screen.getByText('Order review'));
    expect(dialog).toContainElement(
      screen.getByRole('button', { name: 'Put back · Esc' }),
    );
    expect(dialog).toContainElement(screen.getByTestId('tall-sheet-body'));
    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it('keeps narrow sheets fluid and wide ledgers capped at their existing width', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <DocSheet open onClose={onClose} title="Narrow review">
        <p>Narrow paper</p>
      </DocSheet>,
    );

    const narrow = screen.getByRole('dialog', { name: 'Narrow review' });
    expect(narrow).toHaveClass('min-w-0', 'w-full', 'max-w-[640px]');

    rerender(
      <DocSheet open wide onClose={onClose} title="Wide ledger">
        <p>Wide paper</p>
      </DocSheet>,
    );
    const wide = screen.getByRole('dialog', { name: 'Wide ledger' });
    expect(wide).toHaveClass('min-w-0', 'w-full', 'max-w-[760px]');
    expect(wide).not.toHaveClass('max-w-[640px]');
  });

  it('gives keyboard ownership to the top sheet and keeps scroll locked until both close', async () => {
    render(<NestedSheetHarness />);
    const opener = screen.getByRole('button', { name: 'Open outer sheet' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.body.style.overflow).toBe('hidden');

    const nestedOpener = screen.getByRole('button', {
      name: 'Open nested sheet',
    });
    nestedOpener.focus();
    fireEvent.click(nestedOpener);
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2);
    expect(document.body.style.overflow).toBe('hidden');
    const inner = screen.getByRole('dialog', { name: 'Nested review' });
    const coveredOuter = screen.getByRole('dialog', {
      name: 'Outer review',
      hidden: true,
    });
    expect(coveredOuter).not.toHaveAttribute('aria-modal');
    expect(coveredOuter.closest('[data-doc-sheet-layer]')).toHaveAttribute(
      'data-doc-sheet-stack-state',
      'covered',
    );
    expect(coveredOuter.closest('[data-doc-sheet-layer]')).toHaveAttribute(
      'inert',
    );
    expect(inner).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(inner).toHaveFocus());

    const nestedClose = screen.getByRole('button', { name: 'Close sheet' });
    const firstNested = screen.getByRole('button', {
      name: 'First nested action',
    });
    const lastNested = screen.getByRole('button', {
      name: 'Last nested action',
    });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(nestedClose).toHaveFocus();
    expect(firstNested).not.toHaveFocus();
    lastNested.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(nestedClose).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
    expect(
      screen.queryByRole('dialog', { name: 'Nested review' }),
    ).not.toBeInTheDocument();
    const restoredOuter = screen.getByRole('dialog', {
      name: 'Outer review',
    });
    expect(restoredOuter).toHaveAttribute('aria-modal', 'true');
    expect(restoredOuter.closest('[data-doc-sheet-layer]')).toHaveAttribute(
      'data-doc-sheet-stack-state',
      'top',
    );
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(nestedOpener).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe('');
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('closes on Escape and exposes a visible labelled title when it owns the head', async () => {
    const onClose = jest.fn();
    render(
      <DocSheet
        open
        onClose={onClose}
        title="Order review"
        icon={FileText}
        pageLabel="Ledger"
      >
        <p>Three orders need review.</p>
      </DocSheet>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Order review' });
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId ?? '')).toHaveTextContent(
      'Order review',
    );
    expect(dialog.querySelector('[data-doc-sheet-page-label]')).toHaveClass(
      'hidden',
      'sm:inline',
    );
    expect(
      dialog.querySelector('[data-doc-sheet-title-line]'),
    ).toHaveTextContent('Order review');
    const putBack = screen.getByRole('button', { name: 'Put back · Esc' });
    expect(putBack).toHaveClass('min-h-11', 'doc-type-meta');
    expect(putBack.querySelector('.sm\\:hidden')).toHaveTextContent('Close');
    expect(putBack.querySelector('.sm\\:inline')).toHaveTextContent(
      'Put back · Esc',
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { useEffect, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FullScreenViewerShell } from './full-screen-viewer-shell';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

function ChildKeyListener({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEscape]);

  return <button type="button">Last viewer control</button>;
}

function ViewerHarness({
  onClose,
  onChildEscape,
}: {
  onClose: () => void;
  onChildEscape: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open floor plan
      </button>
      {open ? (
        <FullScreenViewerShell
          title="Ground floor plan"
          meta="PDF · Jul 31"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <ChildKeyListener onEscape={onChildEscape} />
        </FullScreenViewerShell>
      ) : null}
    </>
  );
}

afterEach(() => {
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

describe('FullScreenViewerShell', () => {
  it('labels and contains the viewer, closes once on Escape, unlocks scroll, and restores focus', async () => {
    const onClose = jest.fn();
    const onChildEscape = jest.fn();
    render(
      <ViewerHarness
        onClose={onClose}
        onChildEscape={onChildEscape}
      />,
    );

    const opener = screen.getByRole('button', { name: 'Open floor plan' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', {
      name: 'Ground floor plan',
    });
    const back = screen.getByRole('button', {
      name: 'Back to the document',
    });
    const last = screen.getByRole('button', {
      name: 'Last viewer control',
    });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-overlay-viewer-shell');
    expect(dialog).toHaveClass('h-[100dvh]', 'motion-reduce:animate-none');
    expect(back).toHaveClass('min-h-[44px]');
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(dialog).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(back).toHaveFocus();
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(back).toHaveFocus();
    back.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(last, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChildEscape).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Ground floor plan' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(opener).toHaveFocus());
    expect(document.body.style.overflow).toBe('');
  });
});

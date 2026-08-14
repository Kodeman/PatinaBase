import { fireEvent, render, screen } from '@testing-library/react';
import { FolioPopover } from '../date/folio-popover';
import { DocSheet } from '../overlays/doc-sheet';
import { PaperFolioSheet } from '../overlays/paper-folio-sheet';
import { topDismissiblePopover } from '../overlays/active-dialog';

/** A DocSheet/confirm-strip stand-in: the bubble-phase document listener the
 *  panel's capture-phase Esc must reach first and silence. */
function watchDocumentKeydown() {
  const seen = jest.fn();
  document.addEventListener('keydown', seen);
  return {
    seen,
    stop: () => document.removeEventListener('keydown', seen),
  };
}

describe('FolioPopover', () => {
  it('dismisses on an outside pointerdown and stays on an inside one', () => {
    const onClose = jest.fn();
    render(
      <div>
        <button type="button">outside</button>
        <div className="relative">
          <FolioPopover onClose={onClose} aria-label="Date">
            <button type="button">inside</button>
          </FolioPopover>
        </div>
      </div>,
    );

    fireEvent.pointerDown(screen.getByText('inside'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByText('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('swallows the click that dismissed it — one press, one act', () => {
    const onClose = jest.fn();
    const outsideClick = jest.fn();
    render(
      <div>
        <button type="button" onClick={outsideClick}>
          Hold the window
        </button>
        <div className="relative">
          <FolioPopover onClose={onClose} aria-label="Date">
            <span>panel</span>
          </FolioPopover>
        </div>
      </div>,
    );

    const target = screen.getByText('Hold the window');
    fireEvent.pointerDown(target);
    fireEvent.click(target);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outsideClick).not.toHaveBeenCalled();

    // The shield is one-shot: the next press acts normally.
    fireEvent.click(target);
    expect(outsideClick).toHaveBeenCalledTimes(1);
  });

  it('gives Esc to the topmost panel only', () => {
    const closeLower = jest.fn();
    const closeUpper = jest.fn();
    render(
      <div>
        <div className="relative">
          <FolioPopover onClose={closeLower} aria-label="Lower">
            <span>lower</span>
          </FolioPopover>
        </div>
        <div className="relative">
          <FolioPopover onClose={closeUpper} aria-label="Upper">
            <span>upper</span>
          </FolioPopover>
        </div>
      </div>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(closeUpper).toHaveBeenCalledTimes(1);
    expect(closeLower).not.toHaveBeenCalled();
  });

  it('keeps Esc away from an enclosing document listener', () => {
    const docSheet = watchDocumentKeydown();
    const onClose = jest.fn();
    render(
      <div className="relative">
        <FolioPopover onClose={onClose} aria-label="Date">
          <span>panel</span>
        </FolioPopover>
      </div>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(docSheet.seen).not.toHaveBeenCalled();

    docSheet.stop();
  });

  it('holds Esc back from a surface that consults the dismissible-popover guard', () => {
    // The margin rail's compact sheet, to the letter: a document CAPTURE
    // listener registered BEFORE the panel opens, so it runs first and the
    // panel's own stopImmediatePropagation can never reach it. Only the guard
    // can keep it still.
    const railClose = jest.fn();
    const railKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (topDismissiblePopover()) return;
      railClose();
    };
    document.addEventListener('keydown', railKey, true);

    const onClose = jest.fn();
    const { unmount } = render(
      <div className="relative">
        <FolioPopover onClose={onClose} aria-label="Date">
          <span>panel</span>
        </FolioPopover>
      </div>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(railClose).not.toHaveBeenCalled();

    unmount();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(railClose).toHaveBeenCalledTimes(1);

    document.removeEventListener('keydown', railKey, true);
  });

  it('wears no role=dialog — the confirm strip defers its Esc to that role', () => {
    render(
      <div className="relative">
        <FolioPopover onClose={jest.fn()} aria-label="Date">
          <span>panel</span>
        </FolioPopover>
      </div>,
    );

    expect(document.querySelector('[data-dismissible-popover]')).not.toHaveAttribute('role');
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });

  it('closes alone inside a DocSheet, and never inerts the sheet around it', () => {
    const closeSheet = jest.fn();
    const closeFolio = jest.fn();
    render(
      <DocSheet open onClose={closeSheet} title="Received">
        <div className="relative">
          <FolioPopover onClose={closeFolio} aria-label="Date">
            <button type="button">a day</button>
          </FolioPopover>
        </div>
      </DocSheet>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(closeFolio).toHaveBeenCalledTimes(1);
    expect(closeSheet).not.toHaveBeenCalled();

    // A Folio is not a modal dialog and must not be registered as one: the
    // sheet would mark itself covered and go inert, freezing the very panel
    // living inside its subtree.
    const layer = document.querySelector('[data-doc-sheet-layer]');
    expect(layer).toHaveAttribute('data-doc-sheet-stack-state', 'top');
    expect(layer).not.toHaveAttribute('inert');

    // …and the sheet's Tab trap still holds, Folio included.
    const panel = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!;
    screen.getByText('a day').focus();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('closes alone inside a PaperFolioSheet', () => {
    const closeSheet = jest.fn();
    const closeFolio = jest.fn();
    render(
      <PaperFolioSheet open onClose={closeSheet} title="Invoice">
        <div className="relative">
          <FolioPopover onClose={closeFolio} aria-label="Received">
            <span>panel</span>
          </FolioPopover>
        </div>
      </PaperFolioSheet>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(closeFolio).toHaveBeenCalledTimes(1);
    expect(closeSheet).not.toHaveBeenCalled();
  });

  it('leaves nothing listening after it unmounts', () => {
    const docSheet = watchDocumentKeydown();
    const onClose = jest.fn();
    const { unmount } = render(
      <div>
        <button type="button">outside</button>
        <div className="relative">
          <FolioPopover onClose={onClose} aria-label="Date">
            <span>panel</span>
          </FolioPopover>
        </div>
      </div>,
    );

    unmount();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.pointerDown(document.body);

    expect(onClose).not.toHaveBeenCalled();
    // …and the surface underneath hears its own keys again.
    expect(docSheet.seen).toHaveBeenCalledTimes(1);

    docSheet.stop();
  });
});

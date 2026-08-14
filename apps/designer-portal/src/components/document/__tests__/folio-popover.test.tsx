import { fireEvent, render, screen } from '@testing-library/react';
import { FolioPopover } from '../date/folio-popover';

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

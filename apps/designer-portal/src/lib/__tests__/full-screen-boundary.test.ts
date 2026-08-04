import { focusableWithin, lockBodyScroll, trapTabWithin } from '../full-screen-boundary';

describe('full-screen boundary', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  it('keeps scroll locked until the outermost room or overlay releases it', () => {
    document.body.style.overflow = 'auto';
    document.body.style.paddingRight = '3px';
    const releaseRoom = lockBodyScroll();
    const releaseNestedOverlay = lockBodyScroll();

    expect(document.body.style.overflow).toBe('hidden');
    releaseNestedOverlay();
    expect(document.body.style.overflow).toBe('hidden');
    releaseRoom();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.paddingRight).toBe('3px');
  });

  it('wraps Tab within the room and ignores a portalled nested modal', () => {
    const room = document.createElement('main');
    room.tabIndex = -1;
    const first = document.createElement('button');
    first.textContent = 'First';
    const last = document.createElement('button');
    last.textContent = 'Last';
    room.append(first, last);
    document.body.append(room);
    expect(focusableWithin(room)).toEqual([first, last]);

    last.focus();
    const forward = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    expect(trapTabWithin(forward, room)).toBe(true);
    expect(forward.defaultPrevented).toBe(true);
    expect(first).toHaveFocus();

    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const modalButton = document.createElement('button');
    modal.append(modalButton);
    document.body.append(modal);
    modalButton.focus();
    const nested = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    expect(trapTabWithin(nested, room)).toBe(false);
    expect(nested.defaultPrevented).toBe(false);
    expect(modalButton).toHaveFocus();
  });
});

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

  it('wraps from a non-tabbable heading inside the boundary instead of leaving it', () => {
    const outside = document.createElement('button');
    outside.textContent = 'Behind';
    const sheet = document.createElement('aside');
    const head = document.createElement('p');
    head.tabIndex = -1;
    head.textContent = 'Tools';
    const first = document.createElement('button');
    const last = document.createElement('button');
    sheet.append(head, first, last);
    document.body.append(outside, sheet);

    head.focus();
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    expect(trapTabWithin(back, sheet)).toBe(true);
    expect(back.defaultPrevented).toBe(true);
    expect(last).toHaveFocus();

    // Forward from the heading the browser already lands on the first tabbable.
    head.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    expect(trapTabWithin(forward, sheet)).toBe(false);
    expect(forward.defaultPrevented).toBe(false);

    // A non-tabbable after the last tabbable wraps forward to the first.
    const tail = document.createElement('p');
    tail.tabIndex = -1;
    sheet.append(tail);
    tail.focus();
    const past = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    expect(trapTabWithin(past, sheet)).toBe(true);
    expect(first).toHaveFocus();
  });
});

/**
 * D-B19 — the one owner of `data-lens-state`.
 *
 * jsdom can prove all of it: the attribute is a string on a node, the priority
 * is a pure ordering, `matchMedia` is installed per test, and `focusin` /
 * `focusout` are real events. What it cannot prove — that the freeze actually
 * stops a density commit — belongs to `use-lens-density.test.tsx`, which owns
 * the commit; here the only claim is that `freeze` is CALLED, with what, when.
 */

import { act, render } from '@testing-library/react';
import { useLensState } from '../use-lens-state';

/** The global mock is false for everything; these tests need a real answer. */
function installMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  // Assigned, not redefined: `jest.setup.js` installs a non-configurable
  // `matchMedia` (writable, so this lands).
  window.matchMedia = jest.fn(() => media) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      media.matches = next;
      for (const cb of Array.from(listeners)) cb();
    },
  };
}

function Harness({ freeze }: { freeze?: (frozen: boolean) => void }) {
  const { shellRef, onPinChange } = useLensState({ freeze });
  return (
    <div ref={shellRef} data-document-shell data-testid="shell">
      <button type="button" onClick={() => onPinChange(true)}>
        pin
      </button>
      <button type="button" onClick={() => onPinChange(false)}>
        unpin
      </button>
      <main data-document-paper>
        <input aria-label="a field" />
        <div contentEditable aria-label="a note" />
        <button type="button">not a field</button>
        {/* W4-C5: the controls the paper is full of — a checklist tick, a
            closure tick, an FF&E line control. Focus PERSISTS on them after a
            click, so treating them as `editing` froze the lens for the rest of
            the session. */}
        <input type="checkbox" aria-label="a tick" />
        <input type="radio" aria-label="a choice" />
        <select aria-label="a picker">
          <option>one</option>
        </select>
        <input type="submit" aria-label="a submit" value="go" />
        <input type="number" aria-label="a quantity" />
        <div contentEditable="plaintext-only" aria-label="a plain note" />
      </main>
      <input aria-label="off the paper" />
    </div>
  );
}

function shell() {
  return document.querySelector('[data-document-shell]') as HTMLElement;
}

function state() {
  return shell().getAttribute('data-lens-state');
}

describe('useLensState', () => {
  it('publishes `rest` on the shell as soon as the ref attaches', () => {
    installMatchMedia(false);
    render(<Harness />);
    expect(state()).toBe('rest');
  });

  it('turns to `reading` when the band reports its pin, and back on release', () => {
    installMatchMedia(false);
    const { getByText } = render(<Harness />);
    act(() => {
      getByText('pin').click();
    });
    expect(state()).toBe('reading');
    act(() => {
      getByText('unpin').click();
    });
    expect(state()).toBe('rest');
  });

  it('publishes `mobile` below 1180 and follows the media query', () => {
    const media = installMatchMedia(true);
    render(<Harness />);
    expect(state()).toBe('mobile');
    act(() => {
      media.set(false);
    });
    expect(state()).toBe('rest');
  });

  it('`editing` outranks both the pin and mobile, and ends on blur', () => {
    installMatchMedia(true);
    const { getByText, getByLabelText } = render(<Harness />);
    act(() => {
      getByText('pin').click();
    });
    expect(state()).toBe('mobile');

    act(() => {
      getByLabelText('a field').focus();
    });
    expect(state()).toBe('editing');

    act(() => {
      getByLabelText('a field').blur();
    });
    expect(state()).toBe('mobile');
  });

  it('counts a contenteditable on the paper as editing, and a button as not', () => {
    installMatchMedia(false);
    const { getByLabelText, getByText } = render(<Harness />);

    act(() => {
      getByLabelText('a note').focus();
    });
    expect(state()).toBe('editing');

    act(() => {
      getByText('not a field').focus();
    });
    expect(state()).toBe('rest');
  });

  it.each([
    ['a tick', 'checkbox'],
    ['a choice', 'radio'],
    ['a picker', 'select'],
    ['a submit', 'submit button'],
  ])('never enters editing for %s (a %s is a choice, not a field)', (label) => {
    installMatchMedia(false);
    const { getByLabelText } = render(<Harness />);
    act(() => {
      getByLabelText(label).focus();
    });
    expect(state()).toBe('rest');
  });

  it('never freezes the lens for a checkbox, at any point in the gesture', () => {
    installMatchMedia(false);
    const freeze = jest.fn();
    const { getByLabelText } = render(<Harness freeze={freeze} />);
    act(() => {
      getByLabelText('a tick').focus();
    });
    act(() => {
      getByLabelText('a tick').blur();
    });
    expect(freeze).not.toHaveBeenCalled();
  });

  it.each([
    ['a quantity', 'a number field'],
    ['a plain note', 'a plaintext-only contenteditable'],
  ])('enters editing for %s (%s IS text entry)', (label) => {
    installMatchMedia(false);
    const { getByLabelText } = render(<Harness />);
    act(() => {
      getByLabelText(label).focus();
    });
    expect(state()).toBe('editing');
  });

  it('ignores an editable that is not on the paper', () => {
    installMatchMedia(false);
    const { getByLabelText } = render(<Harness />);
    act(() => {
      getByLabelText('off the paper').focus();
    });
    expect(state()).toBe('rest');
  });

  it('holds `editing` while focus moves between two fields on the paper', () => {
    installMatchMedia(false);
    const { getByLabelText } = render(<Harness />);
    const field = getByLabelText('a field');
    const note = getByLabelText('a note');

    act(() => {
      field.focus();
    });
    expect(state()).toBe('editing');

    // A real tab: focusout on the first carries the second as relatedTarget.
    act(() => {
      field.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: note }),
      );
      note.focus();
    });
    expect(state()).toBe('editing');
  });

  it('freezes the density commit on the way into editing and thaws on the way out', () => {
    installMatchMedia(false);
    const freeze = jest.fn();
    const { getByLabelText } = render(<Harness freeze={freeze} />);
    expect(freeze).not.toHaveBeenCalled();

    act(() => {
      getByLabelText('a field').focus();
    });
    expect(freeze).toHaveBeenCalledTimes(1);
    expect(freeze).toHaveBeenLastCalledWith(true);

    act(() => {
      getByLabelText('a field').blur();
    });
    expect(freeze).toHaveBeenCalledTimes(2);
    expect(freeze).toHaveBeenLastCalledWith(false);
  });

  it('thaws on unmount if it comes down mid-edit', () => {
    installMatchMedia(false);
    const freeze = jest.fn();
    const { getByLabelText, unmount } = render(<Harness freeze={freeze} />);
    act(() => {
      getByLabelText('a field').focus();
    });
    expect(freeze).toHaveBeenLastCalledWith(true);
    unmount();
    expect(freeze).toHaveBeenLastCalledWith(false);
  });
});

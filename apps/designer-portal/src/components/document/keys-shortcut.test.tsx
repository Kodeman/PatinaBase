/**
 * The `?` doorway (onboarding Wave 1, task L5 — decision 8).
 *
 * The first bare single-key global outside the `g`-chord family, so the
 * guards are the point of this suite: it must not fire while typing, while a
 * dialog is open, or under a modifier.
 */
import { fireEvent, render } from '@testing-library/react';

// Trap 2 (patina-testing): registry-shortcuts.tsx — where the two guards come
// from — imports ./overlays/post-sheet, which reaches @patina/help-system's
// barrel and its @portabletext/react ESM. Mock the direct relative importer,
// exactly as command-bar.test.tsx does; none of its behavior is under test.
jest.mock('./overlays/post-sheet', () => ({ openPost: jest.fn() }));

import { KeysShortcut } from './keys-shortcut';
import { KEYS_SHEET_EVENT } from './overlays/keys-sheet';

function listen() {
  const seen: string[] = [];
  const handler = (event: Event) => {
    seen.push((event as CustomEvent<{ source: string }>).detail?.source ?? '');
  };
  window.addEventListener(KEYS_SHEET_EVENT, handler);
  return {
    seen,
    stop: () => window.removeEventListener(KEYS_SHEET_EVENT, handler),
  };
}

describe('KeysShortcut', () => {
  it('opens the keys sheet when ? is pressed on the body', () => {
    render(<KeysShortcut />);
    const heard = listen();
    fireEvent.keyDown(window, { key: '?', target: document.body });
    expect(heard.seen).toEqual(['key']);
    heard.stop();
  });

  it('stays quiet while typing into a field', () => {
    const { container } = render(
      <>
        <KeysShortcut />
        <input aria-label="note" />
      </>,
    );
    const input = container.querySelector('input')!;
    const heard = listen();
    fireEvent.keyDown(input, { key: '?' });
    expect(heard.seen).toEqual([]);
    heard.stop();
  });

  it('stays quiet while a dialog is open', () => {
    render(
      <>
        <KeysShortcut />
        <div role="dialog" aria-label="a sheet" />
      </>,
    );
    const heard = listen();
    fireEvent.keyDown(window, { key: '?', target: document.body });
    expect(heard.seen).toEqual([]);
    heard.stop();
  });

  it('stays quiet under a modifier', () => {
    render(<KeysShortcut />);
    const heard = listen();
    fireEvent.keyDown(window, { key: '?', metaKey: true, target: document.body });
    fireEvent.keyDown(window, { key: '?', ctrlKey: true, target: document.body });
    fireEvent.keyDown(window, { key: '?', altKey: true, target: document.body });
    expect(heard.seen).toEqual([]);
    heard.stop();
  });

  it('ignores every other key', () => {
    render(<KeysShortcut />);
    const heard = listen();
    fireEvent.keyDown(window, { key: '/', target: document.body });
    fireEvent.keyDown(window, { key: 'g', target: document.body });
    expect(heard.seen).toEqual([]);
    heard.stop();
  });
});

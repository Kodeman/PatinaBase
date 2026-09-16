/**
 * The bare `t` (W3).
 *
 * The guard worth a suite is the collision: `g` `t` is The Post's chord, and
 * both handlers sit on `window`. Without `chordIsArmed()` the second key of
 * that chord would open the Post AND this form, and nothing else in the tree
 * would notice. The other three guards (typing, an open dialog, a modifier)
 * are the `?` doorway's, reused rather than re-derived.
 */
import { fireEvent, render } from '@testing-library/react';

// Trap 2 (patina-testing) — registry-shortcuts.tsx reaches @portabletext/react
// through the Post sheet. Mock the direct relative importer.
jest.mock('./overlays/post-sheet', () => ({ openPost: jest.fn() }));

import { LogTimeShortcut } from './log-time-shortcut';
import { RegistryShortcuts } from './registry-shortcuts';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function listen() {
  const seen: number[] = [];
  const handler = () => seen.push(1);
  window.addEventListener('document:open-log-time', handler);
  return {
    seen,
    stop: () => window.removeEventListener('document:open-log-time', handler),
  };
}

describe('LogTimeShortcut', () => {
  it('opens the log-time form when t is pressed on the body', () => {
    render(<LogTimeShortcut />);
    const heard = listen();
    fireEvent.keyDown(window, { key: 't', target: document.body });
    expect(heard.seen).toHaveLength(1);
    heard.stop();
  });

  it('yields to the g-chord — g then t is The Post, not this form', () => {
    render(
      <>
        <RegistryShortcuts />
        <LogTimeShortcut />
      </>,
    );
    const heard = listen();
    fireEvent.keyDown(window, { key: 'g', target: document.body });
    fireEvent.keyDown(window, { key: 't', target: document.body });
    expect(heard.seen).toHaveLength(0);
    heard.stop();
  });

  it('is a bare t again once the chord window is spent', () => {
    render(
      <>
        <RegistryShortcuts />
        <LogTimeShortcut />
      </>,
    );
    const heard = listen();
    fireEvent.keyDown(window, { key: 'g', target: document.body });
    fireEvent.keyDown(window, { key: 't', target: document.body });
    fireEvent.keyDown(window, { key: 't', target: document.body });
    expect(heard.seen).toHaveLength(1);
    heard.stop();
  });

  it('stays quiet while typing into a field', () => {
    const { container } = render(
      <>
        <LogTimeShortcut />
        <input aria-label="note" />
      </>,
    );
    const heard = listen();
    fireEvent.keyDown(container.querySelector('input')!, { key: 't' });
    expect(heard.seen).toHaveLength(0);
    heard.stop();
  });

  it('stays quiet while a dialog is open, and under a modifier', () => {
    render(
      <>
        <LogTimeShortcut />
        <div role="dialog" aria-label="a sheet" />
      </>,
    );
    const heard = listen();
    fireEvent.keyDown(window, { key: 't', target: document.body });
    expect(heard.seen).toHaveLength(0);
    heard.stop();

    const modified = listen();
    fireEvent.keyDown(window, { key: 't', metaKey: true, target: document.body });
    expect(modified.seen).toHaveLength(0);
    modified.stop();
  });
});

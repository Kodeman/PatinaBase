import { render } from '@testing-library/react';

import { resetScrollLock, useScrollLock } from '../use-scroll-lock';

function Sheet({ open }: { open: boolean }) {
  useScrollLock(open);
  return null;
}

beforeEach(() => {
  resetScrollLock();
  document.body.style.overflow = '';
});

describe('useScrollLock — one lock, counted', () => {
  it('holds the page still while a sheet is down', () => {
    const view = render(<Sheet open />);
    expect(document.body.style.overflow).toBe('hidden');

    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('does not strand the page locked when two sheets close in the other order', () => {
    // The papers sheet and the details sheet mount in the same wrapper. Two
    // independent capture/restore pairs left the second one writing back
    // "hidden" — the page behind locked with no overlay on screen.
    const first = render(<Sheet open />);
    const second = render(<Sheet open />);
    expect(document.body.style.overflow).toBe('hidden');

    first.unmount();
    expect(document.body.style.overflow).toBe('hidden');

    second.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('takes no lock while it is not active', () => {
    render(<Sheet open={false} />);
    expect(document.body.style.overflow).toBe('');
  });
});

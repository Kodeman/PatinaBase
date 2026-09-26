import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { holdTeaching, releaseTeaching } from '@/lib/teaching/hold-registry';
import { SETTLE_MS } from '@/lib/teaching/constants';
import type { TeachingSlot } from '@/lib/teaching/types';
import { useTeachingAtRest } from './use-teaching-at-rest';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

function renderRest(host: HTMLElement | null = null, slot: TeachingSlot = 'desk') {
  return renderHook(
    ({ h }: { h: HTMLElement | null }) => useTeachingAtRest({ surfaceKey: 'desk', host: h, slot }),
    { wrapper, initialProps: { h: host } },
  );
}

function addDialog(parent: HTMLElement = document.body): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  parent.appendChild(dialog);
  return dialog;
}

afterEach(() => {
  document.body.innerHTML = '';
  releaseTeaching('test-hold');
  jest.useRealTimers();
});

describe('useTeachingAtRest', () => {
  it('is at rest on a quiet Desk, with no settle for the desk slot', () => {
    const { result } = renderRest();
    expect(result.current).toBe(true);
  });

  it('rule 1: a pending mutation blocks', async () => {
    const { result } = renderHook(
      () => ({
        rest: useTeachingAtRest({ surfaceKey: 'desk', host: null, slot: 'desk' }),
        save: useMutation({ mutationFn: () => new Promise<void>(() => {}) }),
      }),
      { wrapper },
    );
    expect(result.current.rest).toBe(true);
    act(() => result.current.save.mutate());
    await waitFor(() => expect(result.current.rest).toBe(false));
  });

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
    [
      '[contenteditable]',
      () => {
        const el = document.createElement('div');
        el.setAttribute('contenteditable', 'true');
        el.tabIndex = 0;
        return el;
      },
    ],
  ])('rule 2: a focused %s blocks until focus leaves', async (_name, make) => {
    const composer = make();
    document.body.appendChild(composer);
    const { result } = renderRest();
    expect(result.current).toBe(true);

    act(() => composer.focus());
    await waitFor(() => expect(result.current).toBe(false));

    act(() => composer.blur());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('rule 2: focus on a button is not a composer', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const { result } = renderRest();
    act(() => button.focus());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current).toBe(true);
  });

  it('rule 3: on the Desk (host null) any open dialog blocks', async () => {
    const { result } = renderRest();
    let dialog!: HTMLElement;
    act(() => {
      dialog = addDialog();
    });
    await waitFor(() => expect(result.current).toBe(false));
    act(() => dialog.remove());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('rule 3: the hosting dialog does not block its own note; one stacked on it does', async () => {
    const host = addDialog();
    const { result } = renderRest(host, 'desk');
    expect(result.current).toBe(true);

    let above!: HTMLElement;
    act(() => {
      above = addDialog();
    });
    await waitFor(() => expect(result.current).toBe(false));

    act(() => above.remove());
    await waitFor(() => expect(result.current).toBe(true));

    // A dialog opened inside the host is stacked above it.
    act(() => {
      addDialog(host);
    });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('rule 3: a covered (aria-hidden, inert) sheet is not an open dialog', () => {
    const covered = addDialog();
    covered.setAttribute('aria-hidden', 'true');
    covered.setAttribute('inert', '');
    const host = addDialog();
    const { result } = renderRest(host);
    expect(result.current).toBe(true);
  });

  it('rule 4: a registered hold blocks until it is released', () => {
    const { result } = renderRest();
    act(() => holdTeaching('test-hold'));
    expect(result.current).toBe(false);
    act(() => releaseTeaching('test-hold'));
    expect(result.current).toBe(true);
  });

  it('rule 5: an anchor slot is at rest only after 1.5 s of stillness, and a hold restarts it', () => {
    jest.useFakeTimers();
    const { result } = renderRest(null, 'anchor');
    expect(result.current).toBe(false);

    act(() => jest.advanceTimersByTime(SETTLE_MS - 1));
    expect(result.current).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe(true);

    act(() => holdTeaching('test-hold'));
    expect(result.current).toBe(false);
    act(() => releaseTeaching('test-hold'));
    expect(result.current).toBe(false);
    act(() => jest.advanceTimersByTime(SETTLE_MS));
    expect(result.current).toBe(true);
  });

  it('rule 5: the act slot settles too', () => {
    jest.useFakeTimers();
    const { result } = renderRest(null, 'act');
    expect(result.current).toBe(false);
    act(() => jest.advanceTimersByTime(SETTLE_MS));
    expect(result.current).toBe(true);
  });
});

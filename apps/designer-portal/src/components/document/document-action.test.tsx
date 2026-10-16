import { act, fireEvent, render, screen } from '@testing-library/react';
import { DocumentAction } from './document-action';

describe('held DocumentAction focus cue', () => {
  it('cues the focused fixer after mouse activation', async () => {
    jest.useFakeTimers();
    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 0);
    try {
      render(
        <>
          <DocumentAction
            actionKey="held"
            held
            disabled
            onHeldActivate={() => document.getElementById('fixer')?.focus()}
          >
            Held action
          </DocumentAction>
          <button id="fixer">Fix it</button>
        </>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Held action' }), { detail: 1 });
      act(() => jest.advanceTimersByTime(0));
      expect(screen.getByRole('button', { name: 'Fix it' })).toHaveAttribute('data-held-focus-cue', '');
    } finally {
      jest.useRealTimers();
      globalThis.requestAnimationFrame = raf;
    }
  });

  it('leaves keyboard focus styling to the normal focus-visible path', () => {
    jest.useFakeTimers();
    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 0);
    try {
      render(
        <>
          <DocumentAction
            actionKey="held"
            held
            disabled
            onHeldActivate={() => document.getElementById('fixer')?.focus()}
          >
            Held action
          </DocumentAction>
          <button id="fixer">Fix it</button>
        </>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Held action' }), { detail: 0 });
      act(() => jest.advanceTimersByTime(0));
      expect(screen.getByRole('button', { name: 'Fix it' })).not.toHaveAttribute('data-held-focus-cue');
    } finally {
      jest.useRealTimers();
      globalThis.requestAnimationFrame = raf;
    }
  });
  it('restarts the cue window on a second mouse press', () => {
    jest.useFakeTimers();
    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 0);
    try {
      render(
        <>
          <DocumentAction actionKey="held" held disabled onHeldActivate={() => document.getElementById('fixer')?.focus()}>
            Held action
          </DocumentAction>
          <button id="fixer">Fix it</button>
        </>,
      );
      const held = screen.getByRole('button', { name: 'Held action' });
      const fixer = screen.getByRole('button', { name: 'Fix it' });
      fireEvent.click(held, { detail: 1 });
      act(() => jest.advanceTimersByTime(0));
      act(() => jest.advanceTimersByTime(600));
      fireEvent.click(held, { detail: 1 });
      act(() => jest.advanceTimersByTime(0));
      act(() => jest.advanceTimersByTime(400));
      expect(fixer).toHaveAttribute('data-held-focus-cue', '');
      act(() => jest.advanceTimersByTime(500));
      expect(fixer).not.toHaveAttribute('data-held-focus-cue');
    } finally {
      jest.useRealTimers();
      globalThis.requestAnimationFrame = raf;
    }
  });
});

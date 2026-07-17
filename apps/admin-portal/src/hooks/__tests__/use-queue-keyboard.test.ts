import React from 'react';
import { renderHook } from '@testing-library/react';
import { CommandPaletteProvider } from '@/contexts/command-palette-context';
import {
  resolveQueueAction,
  useQueueKeyboard,
  type QueueKeyboardHandlers,
} from '@/hooks/use-queue-keyboard';
import { isEditableTarget } from '@/hooks/use-inbox-keyboard';

// ─── pure resolver ───────────────────────────────────────────────────────────
describe('resolveQueueAction', () => {
  const base = { metaKey: false, ctrlKey: false, altKey: false, target: null };

  it.each([
    ['j', 'next'],
    ['ArrowDown', 'next'],
    ['k', 'prev'],
    ['ArrowUp', 'prev'],
    ['Enter', 'open'],
    ['n', 'note'],
    ['x', 'exception'],
  ])('maps %s -> %s', (key, action) => {
    expect(resolveQueueAction({ ...base, key })).toBe(action);
  });

  it('returns null for unmapped keys', () => {
    expect(resolveQueueAction({ ...base, key: 'z' })).toBeNull();
    expect(resolveQueueAction({ ...base, key: 'Escape' })).toBeNull();
    expect(resolveQueueAction({ ...base, key: 'a' })).toBeNull();
  });

  it('bails when a modifier is held (so Cmd/Ctrl/Alt shortcuts pass through)', () => {
    expect(resolveQueueAction({ ...base, key: 'n', metaKey: true })).toBeNull();
    expect(resolveQueueAction({ ...base, key: 'n', ctrlKey: true })).toBeNull();
    expect(resolveQueueAction({ ...base, key: 'n', altKey: true })).toBeNull();
  });

  it('bails when the target is editable (reuses isEditableTarget from use-inbox-keyboard)', () => {
    const input = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;
    const textarea = { tagName: 'TEXTAREA', isContentEditable: false } as unknown as EventTarget;
    const editable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget;
    expect(resolveQueueAction({ ...base, key: 'n', target: input })).toBeNull();
    expect(resolveQueueAction({ ...base, key: 'n', target: textarea })).toBeNull();
    expect(resolveQueueAction({ ...base, key: 'n', target: editable })).toBeNull();
    expect(isEditableTarget(input)).toBe(true);
  });
});

// ─── hook wiring ─────────────────────────────────────────────────────────────
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(CommandPaletteProvider, null, children);

function makeHandlers(): jest.Mocked<QueueKeyboardHandlers> {
  return {
    onNext: jest.fn(),
    onPrev: jest.fn(),
    onOpen: jest.fn(),
    onNote: jest.fn(),
    onException: jest.fn(),
  };
}

function pressOn(target: EventTarget, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('useQueueKeyboard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('dispatches the mapped handler for a plain key on window', () => {
    const handlers = makeHandlers();
    renderHook(() => useQueueKeyboard(handlers), { wrapper });

    pressOn(window, 'j');
    expect(handlers.onNext).toHaveBeenCalledTimes(1);

    pressOn(window, 'k');
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);

    pressOn(window, 'Enter');
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);

    pressOn(window, 'n');
    expect(handlers.onNote).toHaveBeenCalledTimes(1);

    pressOn(window, 'x');
    expect(handlers.onException).toHaveBeenCalledTimes(1);
  });

  it('supports full j/k traversal through many key presses', () => {
    const handlers = makeHandlers();
    renderHook(() => useQueueKeyboard(handlers), { wrapper });

    pressOn(window, 'j');
    pressOn(window, 'j');
    pressOn(window, 'j');
    pressOn(window, 'k');
    expect(handlers.onNext).toHaveBeenCalledTimes(3);
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
  });

  it('ignores keys while suspended (the note drawer owns the keyboard)', () => {
    const handlers = makeHandlers();
    renderHook(() => useQueueKeyboard({ ...handlers, suspended: true }), { wrapper });

    pressOn(window, 'n');
    pressOn(window, 'j');
    expect(handlers.onNote).not.toHaveBeenCalled();
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it('ignores keys when the event originates from an input', () => {
    const handlers = makeHandlers();
    renderHook(() => useQueueKeyboard(handlers), { wrapper });

    const input = document.createElement('input');
    document.body.appendChild(input);
    pressOn(input, 'n');

    expect(handlers.onNote).not.toHaveBeenCalled();
  });

  it('is inert when enabled is false', () => {
    const handlers = makeHandlers();
    renderHook(() => useQueueKeyboard({ ...handlers, enabled: false }), { wrapper });

    pressOn(window, 'j');
    expect(handlers.onNext).not.toHaveBeenCalled();
  });
});

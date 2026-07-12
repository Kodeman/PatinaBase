import React from 'react';
import { renderHook } from '@testing-library/react';
import { CommandPaletteProvider } from '@/contexts/command-palette-context';
import {
  resolveInboxAction,
  isEditableTarget,
  useInboxKeyboard,
  type InboxKeyboardHandlers,
} from '@/hooks/use-inbox-keyboard';

// ─── pure resolver ───────────────────────────────────────────────────────────
describe('resolveInboxAction', () => {
  const base = { metaKey: false, ctrlKey: false, altKey: false, target: null };

  it.each([
    ['j', 'next'],
    ['ArrowDown', 'next'],
    ['k', 'prev'],
    ['ArrowUp', 'prev'],
    ['Enter', 'toggle'],
    ['a', 'approve'],
    ['r', 'reject'],
    ['e', 'edit'],
  ])('maps %s -> %s', (key, action) => {
    expect(resolveInboxAction({ ...base, key })).toBe(action);
  });

  it('returns null for unmapped keys', () => {
    expect(resolveInboxAction({ ...base, key: 'x' })).toBeNull();
    expect(resolveInboxAction({ ...base, key: 'Escape' })).toBeNull();
  });

  it('bails when a modifier is held (so Cmd/Ctrl/Alt shortcuts pass through)', () => {
    expect(resolveInboxAction({ ...base, key: 'a', metaKey: true })).toBeNull();
    expect(resolveInboxAction({ ...base, key: 'a', ctrlKey: true })).toBeNull();
    expect(resolveInboxAction({ ...base, key: 'a', altKey: true })).toBeNull();
  });

  it('bails when the target is editable', () => {
    const input = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;
    const textarea = { tagName: 'TEXTAREA', isContentEditable: false } as unknown as EventTarget;
    const editable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget;
    expect(resolveInboxAction({ ...base, key: 'a', target: input })).toBeNull();
    expect(resolveInboxAction({ ...base, key: 'a', target: textarea })).toBeNull();
    expect(resolveInboxAction({ ...base, key: 'a', target: editable })).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('treats input/textarea/select/[contenteditable] as editable', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

// ─── hook wiring ─────────────────────────────────────────────────────────────
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(CommandPaletteProvider, null, children);

function makeHandlers(): jest.Mocked<InboxKeyboardHandlers> {
  return {
    onNext: jest.fn(),
    onPrev: jest.fn(),
    onToggleExpand: jest.fn(),
    onApprove: jest.fn(),
    onReject: jest.fn(),
    onEdit: jest.fn(),
  };
}

function pressOn(target: EventTarget, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('useInboxKeyboard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('dispatches the mapped handler for a plain key on window', () => {
    const handlers = makeHandlers();
    renderHook(() => useInboxKeyboard(handlers), { wrapper });

    pressOn(window, 'j');
    expect(handlers.onNext).toHaveBeenCalledTimes(1);

    pressOn(window, 'a');
    expect(handlers.onApprove).toHaveBeenCalledTimes(1);

    pressOn(window, 'r');
    expect(handlers.onReject).toHaveBeenCalledTimes(1);

    pressOn(window, 'e');
    expect(handlers.onEdit).toHaveBeenCalledTimes(1);
  });

  it('ignores keys while suspended (popover/drawer open)', () => {
    const handlers = makeHandlers();
    renderHook(() => useInboxKeyboard({ ...handlers, suspended: true }), { wrapper });

    pressOn(window, 'a');
    pressOn(window, 'j');
    expect(handlers.onApprove).not.toHaveBeenCalled();
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it('ignores keys when the event originates from an input', () => {
    const handlers = makeHandlers();
    renderHook(() => useInboxKeyboard(handlers), { wrapper });

    const input = document.createElement('input');
    document.body.appendChild(input);
    pressOn(input, 'a');

    expect(handlers.onApprove).not.toHaveBeenCalled();
  });

  it('is inert when enabled is false', () => {
    const handlers = makeHandlers();
    renderHook(() => useInboxKeyboard({ ...handlers, enabled: false }), { wrapper });

    pressOn(window, 'j');
    expect(handlers.onNext).not.toHaveBeenCalled();
  });
});

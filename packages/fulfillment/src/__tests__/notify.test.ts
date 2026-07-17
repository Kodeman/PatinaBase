import { describe, it, expect } from 'vitest';
import {
  resolveNoteDrawerSendAction,
  resolveNoteSendMode,
  transitionForDerivedStatus,
} from '../notify';

describe('transitionForDerivedStatus', () => {
  it.each([
    ['intake', 'confirmed'],
    ['split', 'confirmed'],
    ['transmitted', 'confirmed'],
    ['acknowledged', 'in_production'],
    ['in_production', 'in_production'],
    ['shipped', 'shipped'],
    ['delivered', 'delivered'],
    ['settled', 'delivered'],
    ['needs_mapping', 'eta_change'],
    ['exception', 'eta_change'],
  ])('%s (no open exceptions) -> %s', (derivedStatus, expected) => {
    expect(transitionForDerivedStatus(derivedStatus, 0)).toBe(expected);
  });

  it('an open exception always overrides to eta_change, regardless of stage', () => {
    expect(transitionForDerivedStatus('shipped', 1)).toBe('eta_change');
    expect(transitionForDerivedStatus('intake', 2)).toBe('eta_change');
    expect(transitionForDerivedStatus('delivered', 1)).toBe('eta_change');
  });

  it('falls back to confirmed for an unrecognized status (never throws)', () => {
    expect(transitionForDerivedStatus('some_future_status', 0)).toBe('confirmed');
  });
});

describe('resolveNoteSendMode', () => {
  it('unedited body (byte-identical) -> fast', () => {
    expect(resolveNoteSendMode('Hello there.', 'Hello there.')).toBe('fast');
  });

  it('whitespace-only difference -> still fast (trim-insensitive)', () => {
    expect(resolveNoteSendMode('Hello there.', '  Hello there.  \n')).toBe('fast');
  });

  it('any real text change -> edited', () => {
    expect(resolveNoteSendMode('Hello there.', 'Hello there, Priya.')).toBe('edited');
  });
});

describe('resolveNoteDrawerSendAction', () => {
  const noMods = { metaKey: false, ctrlKey: false };

  it('fast mode: bare n or Enter sends', () => {
    expect(resolveNoteDrawerSendAction({ key: 'n', ...noMods }, 'fast')).toBe('send');
    expect(resolveNoteDrawerSendAction({ key: 'Enter', ...noMods }, 'fast')).toBe('send');
  });

  it('fast mode: Cmd/Ctrl+Enter also sends (still the fast path, just also matches the edited shortcut)', () => {
    expect(resolveNoteDrawerSendAction({ key: 'Enter', metaKey: true, ctrlKey: false }, 'fast')).toBe('send');
  });

  it('fast mode: unrelated keys do nothing', () => {
    expect(resolveNoteDrawerSendAction({ key: 'x', ...noMods }, 'fast')).toBeNull();
    expect(resolveNoteDrawerSendAction({ key: 'Escape', ...noMods }, 'fast')).toBeNull();
  });

  it('edited mode: bare n or Enter do NOT send (presumed text entry)', () => {
    expect(resolveNoteDrawerSendAction({ key: 'n', ...noMods }, 'edited')).toBeNull();
    expect(resolveNoteDrawerSendAction({ key: 'Enter', ...noMods }, 'edited')).toBeNull();
  });

  it('edited mode: only Cmd/Ctrl+Enter sends (the explicit-action demotion)', () => {
    expect(resolveNoteDrawerSendAction({ key: 'Enter', metaKey: true, ctrlKey: false }, 'edited')).toBe('send');
    expect(resolveNoteDrawerSendAction({ key: 'Enter', metaKey: false, ctrlKey: true }, 'edited')).toBe('send');
  });
});

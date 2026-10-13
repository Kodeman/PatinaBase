import { act, render, screen } from '@testing-library/react';
import { KeysSheet, KEYS_SHEET_EVENT } from './keys-sheet';

jest.mock('@/lib/help-system/open-help', () => ({
  openHelp: jest.fn(),
}));

describe('KeysSheet', () => {
  it('titles the dialog "Keyboard shortcuts" (SQ-752)', () => {
    render(<KeysSheet />);
    act(() => {
      window.dispatchEvent(new CustomEvent(KEYS_SHEET_EVENT));
    });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('prints keys as text rows, never keycap boxes (US-28 S6)', () => {
    render(<KeysSheet />);
    act(() => {
      window.dispatchEvent(new CustomEvent(KEYS_SHEET_EVENT));
    });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const keys = Array.from(dialog.querySelectorAll('kbd'));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toHaveClass('keycap');
      expect(key.className).not.toMatch(/\bborder\b|\brounded/);
    }
    // Each reference group is a head over its rows.
    expect(dialog.querySelectorAll('.sec-head .eb').length).toBeGreaterThan(0);
    expect(dialog.querySelectorAll('dl.rows').length).toBeGreaterThan(0);
  });
});

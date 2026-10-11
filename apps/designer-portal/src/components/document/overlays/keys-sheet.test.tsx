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
});

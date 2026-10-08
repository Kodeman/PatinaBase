/**
 * US-19 FR4 Fix 11 (`one-voice`) — Esc inside the ClaimActs resolve form is
 * Cancel: the form closes, focus goes back to the claim's `Mark resolved`,
 * and the key is taken (`defaultPrevented`) so the paper's put-down does not
 * fire. Mid-save the form stays. With the flag off, Esc is not handled here.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClaimActs } from '../claim-acts';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

let mockPending = false;
jest.mock('@patina/supabase', () => ({
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: mockPending }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('../inspection-photo-strip', () => ({ InspectionPhotoStrip: () => null }));

let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'one-voice' && mockOneVoice, isLoading: false }),
}));

const CLAIMS = [{ id: 'claim-1', state: 'vendor_notified' }];

function openForm() {
  render(<ClaimActs claims={CLAIMS} />);
  const opener = screen.getByRole('button', { name: /Mark resolved/ });
  fireEvent.click(opener);
  const notes = screen.getByRole('textbox', { name: 'Resolution notes' });
  notes.focus();
  return { opener, notes };
}

beforeEach(() => {
  mockOneVoice = true;
  mockPending = false;
});

describe('ClaimActs resolve form — Esc is Cancel (FR4 Fix 11)', () => {
  it('closes the form, takes the key, and returns focus to Mark resolved', async () => {
    const { opener, notes } = openForm();
    expect(opener).toHaveAttribute('aria-expanded', 'true');

    let notTaken = true;
    act(() => {
      notTaken = fireEvent.keyDown(notes, { key: 'Escape' });
    });
    expect(notTaken).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'Resolution notes' })).toBeNull();
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('never reaches a document Esc listener (the paper stays up)', () => {
    const { notes } = openForm();
    const putDown = jest.fn();
    document.addEventListener('keydown', putDown);
    fireEvent.keyDown(notes, { key: 'Escape' });
    document.removeEventListener('keydown', putDown);
    expect(putDown).not.toHaveBeenCalled();
  });

  it('mid-save, Esc closes nothing', () => {
    mockPending = true;
    const { notes } = openForm();
    fireEvent.keyDown(notes, { key: 'Escape' });
    expect(screen.getByRole('textbox', { name: 'Resolution notes' })).toBeInTheDocument();
  });

  it('flag off: Esc is not handled by the form', () => {
    mockOneVoice = false;
    const { notes } = openForm();
    expect(fireEvent.keyDown(notes, { key: 'Escape' })).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Resolution notes' })).toBeInTheDocument();
  });
});

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
const mockUpdateClaim = jest.fn();
const mockInvalidate = jest.fn();
jest.mock('@patina/supabase', () => ({
  useProcurementDrafts: () => ({ data: [] }),
  useUpdateDamageClaim: () => ({ mutateAsync: mockUpdateClaim, isPending: mockPending }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
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
  mockUpdateClaim.mockReset().mockResolvedValue({});
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

// US-19 F6-8 (D16) — the line's claim landing (ffe-section's FFE_ACT_CONTROL
// keys on the action key) names the maker under one-voice; off, vendor.
describe('ClaimActs — the drafted claim’s act names the maker', () => {
  const DRAFTED = [{ id: 'claim-1', state: 'drafted' }];

  it('one-voice: Notify the maker, on the control the claim landing keys on', () => {
    render(<ClaimActs claims={DRAFTED} />);
    expect(screen.getByRole('button', { name: 'Notify the maker' })).toHaveAttribute(
      'data-action-key',
      'notify-vendor-of-ffe-claim',
    );
  });

  it('flag off: Notify vendor, as today', () => {
    mockOneVoice = false;
    render(<ClaimActs claims={DRAFTED} />);
    expect(screen.getByRole('button', { name: 'Notify vendor' })).toBeInTheDocument();
  });
});


describe('ClaimActs — close without filing', () => {
  function openClose() {
    render(<ClaimActs claims={[{ id: 'claim-draft', state: 'drafted' }]} />);
    const opener = screen.getByRole('button', { name: 'Close without filing' });
    expect(opener).toHaveClass('da-tertiary');
    fireEvent.click(opener);
    return opener;
  }

  it('requires a short reason and resolves with a Not filed note', async () => {
    openClose();
    const save = screen.getAllByRole('button', { name: 'Close without filing' })[1];
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for not filing' }), { target: { value: '   ' } });
    fireEvent.click(save);
    expect(mockUpdateClaim).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for not filing' }), { target: { value: '  Studio accepted the mark  ' } });
    fireEvent.click(save);
    await waitFor(() => expect(mockUpdateClaim).toHaveBeenCalledWith({ id: 'claim-draft', state: 'resolved', resolution_notes: 'Not filed: Studio accepted the mark' }));
    await waitFor(() => expect(screen.getByText('Closed without filing — folded into the record.')).toBeInTheDocument());
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['document-state'] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['project-ffe-items'] });
  });

  it('keeps the reason and shows an inline failure when closing fails', async () => {
    mockUpdateClaim.mockRejectedValueOnce(new Error('Could not save'));
    openClose();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for not filing' }), { target: { value: 'Accepted' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Close without filing' })[1]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('textbox', { name: 'Reason for not filing' })).toHaveValue('Accepted');
  });

  it('returns focus to Close without filing on Escape', async () => {
    const opener = openClose();
    const reason = screen.getByRole('textbox', { name: 'Reason for not filing' });
    reason.focus();
    fireEvent.keyDown(reason, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
    expect(screen.queryByRole('textbox', { name: 'Reason for not filing' })).not.toBeInTheDocument();
  });
});

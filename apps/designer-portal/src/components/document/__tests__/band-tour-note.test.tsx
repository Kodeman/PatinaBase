/**
 * US-19 D8 — the one-note tour (§3 2-7). Re-cut from the once-only margin note
 * (R131) on its own versioned key: one sentence under the band and the single
 * act `Understood`. Shown once per person per version; never modal, never
 * focused; absent while `one-voice` is off.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { BAND_TOUR_NOTE_KEY, BandTourNote } from '../margin-note';

let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { wayfinding: { marginNote: jest.fn() } },
}));

const SENTENCE = 'The band says what’s next on this job. Press it.';
const STORED = `patina:margin-note:${BAND_TOUR_NOTE_KEY}`;

beforeEach(() => {
  mockOneVoice = true;
  window.localStorage.clear();
});

describe('the one-note tour (D8, 2-7)', () => {
  it('rides a new versioned key', () => {
    expect(BAND_TOUR_NOTE_KEY).toBe('band-tour-v1');
  });

  it('shows on a first open: the sentence and the single act, no count, no ×', () => {
    render(<BandTourNote />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(SENTENCE);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Understood' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss note' })).toBeNull();
    expect(note.textContent).not.toMatch(/\d/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not take focus', () => {
    render(<BandTourNote />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('`Understood` dismisses it, and it stays dismissed on every later open', () => {
    const first = render(<BandTourNote />);
    fireEvent.click(screen.getByRole('button', { name: 'Understood' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(window.localStorage.getItem(STORED)).not.toBeNull();
    first.unmount();

    render(<BandTourNote />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('shows again on a later open until it is understood', () => {
    const first = render(<BandTourNote />);
    first.unmount();
    render(<BandTourNote />);
    expect(screen.getByRole('note')).toHaveTextContent(SENTENCE);
  });

  it('flag off: absent, and nothing is written', () => {
    mockOneVoice = false;
    render(<BandTourNote />);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText(SENTENCE)).toBeNull();
    expect(window.localStorage.getItem(STORED)).toBeNull();
  });
});

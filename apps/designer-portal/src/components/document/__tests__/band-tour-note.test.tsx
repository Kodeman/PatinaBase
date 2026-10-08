/**
 * US-19 D8 — the one-note tour (§3 2-7). Re-cut from the once-only margin note
 * (R131) on its own versioned key: one sentence under the band and the single
 * act `Understood`. Shown once per person per version; never modal, never
 * focused; absent while `one-voice` is off.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { deriveLensBand } from '@/lib/document/lens-band-derivation';
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
    render(<BandTourNote hasAct />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(SENTENCE);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Understood' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss note' })).toBeNull();
    expect(note.textContent).not.toMatch(/\d/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not take focus', () => {
    render(<BandTourNote hasAct />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('`Understood` dismisses it, and it stays dismissed on every later open', () => {
    const first = render(<BandTourNote hasAct />);
    fireEvent.click(screen.getByRole('button', { name: 'Understood' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(window.localStorage.getItem(STORED)).not.toBeNull();
    first.unmount();

    render(<BandTourNote hasAct />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('shows again on a later open until it is understood', () => {
    const first = render(<BandTourNote hasAct />);
    first.unmount();
    render(<BandTourNote hasAct />);
    expect(screen.getByRole('note')).toHaveTextContent(SENTENCE);
  });

  // FR2 F2-16 — the rule is the label's: `da-score-hover` draws its hairline
  // 3px under the element that wears it, and on the 44px box that left the
  // underline ~20px below `Understood` at 390.
  it('`Understood` wears its rule on the label, inside a 44px target', () => {
    render(<BandTourNote hasAct />);
    const act = screen.getByRole('button', { name: 'Understood' });
    expect(act).toHaveClass('min-h-11');
    expect(act).not.toHaveClass('da-score-hover');
    const label = act.querySelector('.da-score-hover');
    expect(label).not.toBeNull();
    expect(label).toHaveTextContent(/^Understood$/);
  });

  it('flag off: absent, and nothing is written', () => {
    mockOneVoice = false;
    render(<BandTourNote hasAct />);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText(SENTENCE)).toBeNull();
    expect(window.localStorage.getItem(STORED)).toBeNull();
  });
});

// FR3 F3-16 — "Press it" needs something to press: the note mounts only on a
// band with an act, never on a held (Harrow) or closed (Lindqvist) paper.
describe('the tour note only on a band with an act (F3-16)', () => {
  const band = (projectStatus: string | null) =>
    deriveLensBand({
      spreadKind: projectStatus === 'completed' ? 'care' : 'project',
      ticket: [],
      needs: [],
      guide: null,
      tier: 'full',
      household: 'Client User',
      jobName: 'Harrow Road Flat',
      stageWord: 'Project',
      stageIndex: null,
      installDate: null,
      moneyFigure: null,
      proposalInvestment: null,
      sentDate: null,
      projectStatus,
      ownAct: {
        key: 'own:pieces',
        label: 'Open the pieces',
        targetId: 'document-act-pieces-head',
        tier: 'scored',
        sentence: null,
        onAct: jest.fn(),
      },
    });
  const mount = (projectStatus: string | null) =>
    render(<BandTourNote hasAct={band(projectStatus).voice.next !== null} />);

  it('mounts on a band whose Next has an act', () => {
    mount('active');
    expect(screen.getByRole('note')).toHaveTextContent(SENTENCE);
  });

  it('is absent on a held paper (Harrow), and nothing is written', () => {
    mount('on_hold');
    expect(screen.queryByRole('note')).toBeNull();
    expect(window.localStorage.getItem(STORED)).toBeNull();
  });

  it('is absent on a closed paper (Lindqvist)', () => {
    mount('completed');
    expect(screen.queryByRole('note')).toBeNull();
  });
});

/**
 * US-19 FR5 F5-8 / SQ-552 (ruling 529-6) — the log-time offer takes Esc only
 * when it is the innermost open thing: focus inside the strip, or focus on
 * <body> with nothing else open. Everywhere else it yields the key untouched,
 * and a hidden offer (one that does not own the edge) never takes a key — its
 * entry is already written, so a stray discard deletes time the designer never
 * saw.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { LogStrip } from '../log-strip';

const mockLogOffer = jest.fn().mockResolvedValue(undefined);
const mockDiscardOffer = jest.fn().mockResolvedValue(undefined);
let mockOwnsEdge = true;

const offer = {
  projectId: 'aspen-project',
  projectName: 'Aspen residence',
  suggestedMinutes: 26,
  rawSeconds: 1560,
  idleSeconds: 0,
  billable: false,
  hourlyRateCents: null,
  rateSource: 'none',
  rateRole: null,
  ratedAmountCents: null,
};

jest.mock('@patina/supabase', () => ({
  useMyRateRoles: () => ({ data: ['lead_designer'] }),
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    offer,
    offerOwnsEdge: mockOwnsEdge,
    logOffer: mockLogOffer,
    discardOffer: mockDiscardOffer,
  }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    logStripActed: jest.fn(),
  },
}));

/** A stand-in for the Message composer: a dialog whose note is a textarea
 *  that takes Esc as Cancel (preventDefault + stopPropagation, story log #6). */
const composerEsc = jest.fn();
function Composer() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Message the client">
      <textarea
        aria-label="Note"
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          composerEsc(e.defaultPrevented);
          setOpen(false);
        }}
      />
    </div>
  );
}

/** A stand-in for the letterhead's inline Message composer as it ships: no
 *  dialog role, a plain block that takes Esc as Cancel on its own keydown
 *  (letterhead-instruments.tsx), with Send and Cancel buttons. */
const inlineComposerEsc = jest.fn();
function InlineComposer() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div
      data-testid="inline-composer"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        inlineComposerEsc();
        setOpen(false);
      }}
    >
      <textarea aria-label="Quick note" defaultValue="Checking in" />
      <button type="button">Send</button>
      <button type="button">Cancel</button>
    </div>
  );
}

describe('LogStrip — Esc yields to the innermost open thing (FR5 F5-8)', () => {
  beforeEach(() => {
    mockOwnsEdge = true;
    mockDiscardOffer.mockClear();
    composerEsc.mockClear();
    inlineComposerEsc.mockClear();
  });

  it('hidden chained-out offer (does not own the edge) + Esc on body: nothing is discarded (SQ-552)', () => {
    mockOwnsEdge = false;
    render(<LogStrip />);
    // The strip paints nothing on this paper.
    expect(screen.queryByRole('region', { name: 'Log time offer' })).toBeNull();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    const notCanceled = fireEvent.keyDown(document.body, { key: 'Escape' });

    // The written entry survives: discardOffer (which deletes it) never runs,
    // and the key is not taken.
    expect(mockDiscardOffer).not.toHaveBeenCalled();
    expect(notCanceled).toBe(true);
  });

  it('hidden chained-out offer + Esc on a button elsewhere: nothing is discarded (SQ-552)', () => {
    mockOwnsEdge = false;
    render(
      <>
        <LogStrip />
        <button type="button">Elsewhere</button>
      </>,
    );
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();

    const notCanceled = fireEvent.keyDown(elsewhere, { key: 'Escape' });

    expect(mockDiscardOffer).not.toHaveBeenCalled();
    expect(notCanceled).toBe(true);
  });

  it('visible offer + the inline composer\'s Send button focused: Esc reaches the composer and the offer stays (SQ-552)', () => {
    render(
      <>
        <LogStrip />
        <InlineComposer />
      </>,
    );
    const send = screen.getByRole('button', { name: 'Send' });
    send.focus();
    expect(send).toHaveFocus();

    fireEvent.keyDown(send, { key: 'Escape' });

    expect(inlineComposerEsc).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('inline-composer')).toBeNull();
    expect(mockDiscardOffer).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Log time offer' })).toBeInTheDocument();
  });

  it('visible offer + focus on body while a dialog is open: the strip yields (SQ-552)', () => {
    render(
      <>
        <LogStrip />
        <div role="dialog" aria-modal="true" aria-label="A sheet">
          <p>Open sheet</p>
        </div>
      </>,
    );
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    const notCanceled = fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(mockDiscardOffer).not.toHaveBeenCalled();
    expect(notCanceled).toBe(true);
  });

  it('visible offer + Discard button focused (inside the strip): Esc discards (SQ-552)', () => {
    render(<LogStrip />);
    const discard = screen.getByRole('button', { name: 'Discard' });
    discard.focus();

    const notCanceled = fireEvent.keyDown(discard, { key: 'Escape' });

    expect(mockDiscardOffer).toHaveBeenCalledTimes(1);
    expect(notCanceled).toBe(false);
  });

  it('offer open + composer textarea focused: Esc reaches the composer and the offer stays', () => {
    render(
      <>
        <LogStrip />
        <Composer />
      </>,
    );
    const note = screen.getByRole('textbox', { name: 'Note' });
    note.focus();
    expect(note).toHaveFocus();

    const notCanceled = fireEvent.keyDown(note, { key: 'Escape' });

    // The composer's handler ran and took the key.
    expect(composerEsc).toHaveBeenCalledTimes(1);
    expect(composerEsc).toHaveBeenCalledWith(true);
    expect(notCanceled).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Message the client' })).toBeNull();
    // The offer was not discarded and is still on the page.
    expect(mockDiscardOffer).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Log time offer' })).toBeInTheDocument();
  });

  it('offer open + focus on body: Esc discards the offer', () => {
    render(<LogStrip />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    const notCanceled = fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(mockDiscardOffer).toHaveBeenCalledTimes(1);
    expect(notCanceled).toBe(false);
  });

  it('offer open + focus inside the strip (its minutes input): Esc discards the offer', () => {
    render(
      <>
        <LogStrip />
        <Composer />
      </>,
    );
    const minutes = screen.getByRole('spinbutton', { name: 'Minutes to log' });
    minutes.focus();

    fireEvent.keyDown(minutes, { key: 'Escape' });

    expect(mockDiscardOffer).toHaveBeenCalledTimes(1);
    expect(composerEsc).not.toHaveBeenCalled();
  });
});

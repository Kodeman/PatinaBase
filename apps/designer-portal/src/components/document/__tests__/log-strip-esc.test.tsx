/**
 * US-19 FR5 F5-8 (ruling 529-6) — the log-time offer yields Esc to a newer
 * open thing. Esc closes the innermost open thing: a composer opened above the
 * offer takes the key (and calls preventDefault, story log #6), and the offer
 * stays; with focus on <body> or inside the strip, Esc discards the offer.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { LogStrip } from '../log-strip';

const mockLogOffer = jest.fn().mockResolvedValue(undefined);
const mockDiscardOffer = jest.fn().mockResolvedValue(undefined);

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
    offerOwnsEdge: true,
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

describe('LogStrip — Esc yields to the innermost open thing (FR5 F5-8)', () => {
  beforeEach(() => {
    mockDiscardOffer.mockClear();
    composerEsc.mockClear();
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

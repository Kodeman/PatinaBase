import { render, screen } from '@testing-library/react';
import { TheNote } from '../the-note';

const NOTE = {
  id: 'n1',
  body: 'Dave — the drawings are in.',
  sentAt: '2026-09-08T14:00:00.000Z',
  enclosures: [],
};

it('R8 — a frozen byline signs the note, not the live studio name', () => {
  render(
    <TheNote
      note={{ ...NOTE, byline: 'Leah Hartwell · Middle West Studio · 8 September' }}
      earlier={[]}
      enclosures={[]}
      // The studio renamed itself after the letter went. The note must not
      // silently relabel itself.
      authorName="Hartwell & Co."
      studioName="Hartwell & Co."
      today={new Date('2026-09-09T00:00:00.000Z')}
    />,
  );
  expect(screen.getByTestId('note-signature')).toHaveTextContent(
    'Leah Hartwell · Middle West Studio · 8 September',
  );
  expect(screen.getByTestId('note-signature').textContent).not.toContain('Hartwell & Co.');
});

it('falls back to live resolution for every note written before the letter', () => {
  render(
    <TheNote
      note={NOTE}
      earlier={[]}
      enclosures={[]}
      authorName="Local Dev Studio"
      studioName="Local Dev Studio"
      today={new Date('2026-09-09T00:00:00.000Z')}
    />,
  );
  // signatureOf signs once, not twice, when the author and studio share a
  // name (the-note.test.tsx: "signs once when the studio and the hand carry
  // the same name"), and spells the year via legalDate.
  expect(screen.getByTestId('note-signature')).toHaveTextContent(
    'Local Dev Studio · 8 September 2026',
  );
});

it('a blank byline is no byline — it never prints an empty signature', () => {
  render(
    <TheNote
      note={{ ...NOTE, byline: '   ' }}
      earlier={[]}
      enclosures={[]}
      authorName={null}
      studioName={null}
      today={new Date('2026-09-09T00:00:00.000Z')}
    />,
  );
  expect(screen.queryByTestId('note-signature')).toBeNull();
});

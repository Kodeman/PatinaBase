import { render, screen } from '@testing-library/react';

import { Previously } from '@/components/threshold/previously';
import { TheNote } from '@/components/threshold/the-note';
import type { EditionMeta } from '@/lib/editorial/types';

import { EditionLine, EditionNotice, editionLine } from '../edition-notice';

const NOTICE =
  'The page now opens on your sideboard; the workshop sent photographs on 15 October. Everything else is where it was.';

const EDITION: EditionMeta = {
  id: 'e0000000-0000-0000-0000-0000000ed002',
  seq: 2,
  approvedAt: '2026-10-21T12:00:00Z',
  approvedBy: 'studio',
  notice: NOTICE,
};

const NOTE = {
  id: 'note-1',
  body: 'The walnut for the sideboard came in a shade darker than your sample.',
  sentAt: '2026-10-11T12:00:00Z',
  byline: null,
  enclosures: [],
};

describe('the notice', () => {
  it('is the opening sentence of the letter, in its italic lead', () => {
    render(
      <TheNote
        note={NOTE as never}
        earlier={[]}
        enclosures={[]}
        authorName="Maren Holt"
        studioName="Birchwood Studio"
        today={new Date('2026-10-21T12:00:00Z')}
        notice={NOTICE}
      />,
    );
    const lead = screen.getByTestId('edition-notice');
    expect(lead).toHaveTextContent(NOTICE);
    expect(lead).toHaveClass('font-heading', 'italic');
    const letter = document.querySelector('#note blockquote')!;
    expect(letter.firstElementChild).toBe(lead);
    expect(lead.compareDocumentPosition(screen.getByTestId('note-body')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says nothing when the edition has no notice, and the letter is unchanged', () => {
    for (const notice of [null, undefined, '', '   ']) {
      const { unmount } = render(
        <TheNote note={NOTE as never} earlier={[]} enclosures={[]} notice={notice} />,
      );
      expect(screen.queryByTestId('edition-notice')).toBeNull();
      expect(document.querySelector('#note blockquote')!.firstElementChild).toBe(screen.getByTestId('note-body'));
      unmount();
    }
    expect(render(<EditionNotice notice={null} />).container).toBeEmptyDOMElement();
  });

  it('is the whole letter with no standing note: the notice alone, in the studio voice, nothing invented', () => {
    render(
      <TheNote
        note={null}
        earlier={[]}
        enclosures={[]}
        authorName="Maren Holt"
        studioName="Birchwood Studio"
        today={new Date('2026-10-21T12:00:00Z')}
        notice={NOTICE}
      />,
    );
    const letter = document.querySelector('#note')!;
    expect(letter).toHaveAttribute('data-threshold-unit', 'note');
    expect(letter).toHaveAttribute('aria-label', 'A note from the studio');
    const lead = screen.getByTestId('edition-notice');
    expect(lead).toHaveTextContent(NOTICE);
    expect(letter.querySelector('blockquote')!.firstElementChild).toBe(lead);
    // No note was sent: no body, no dateline, no signature, no author named.
    for (const id of ['note-body', 'note-dateline', 'note-signature']) expect(screen.queryByTestId(id)).toBeNull();
    expect(letter).not.toHaveTextContent('Maren Holt');
    expect(letter.textContent).toBe(NOTICE);
  });

  it('prints nothing with neither a note nor a notice', () => {
    for (const notice of [null, undefined, '', '   ']) {
      const { container, unmount } = render(<TheNote note={null} earlier={[]} enclosures={[]} notice={notice} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe('the edition line in Earlier', () => {
  it('names the edition, who approved it and the day; a plates-only edition reads as published', () => {
    expect(editionLine(EDITION)).toBe('Edition 2 · approved by the studio · 21 October');
    const auto = editionLine({ ...EDITION, seq: 3, approvedBy: 'auto' });
    expect(auto).toBe('Edition 3 · published 21 October');
    expect(auto).not.toMatch(/automatic/i);
  });

  it('heads the record, above every closed line', () => {
    render(
      <Previously
        entries={[{ id: 'instrument:p1', kind: 'instrument', label: 'Authorization No. 1', date: new Date('2026-10-01T12:00:00Z'), state: 'signed' }]}
        edition={EDITION}
      />,
    );
    const line = screen.getByTestId('edition-line');
    expect(line).toHaveTextContent('Edition 2 · approved by the studio · 21 October');
    const first = document.querySelector('#previously ul li')!;
    expect(line.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps a Previously for the edition alone, and prints none without one', () => {
    const { unmount } = render(<Previously entries={[]} edition={EDITION} />);
    expect(document.querySelector('#previously')).not.toBeNull();
    unmount();
    expect(render(<Previously entries={[]} />).container).toBeEmptyDOMElement();
    expect(render(<EditionLine edition={null} />).container).toBeEmptyDOMElement();
  });
});

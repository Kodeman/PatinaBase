/**
 * MarginNote — the R97 `suppressed` prop + the exported `markMarginNoteSeen`,
 * plus the cross-device Supabase backend + version-suffix exact-key
 * semantics from decision 5 (amending R94).
 *
 * The wayfinding emitter is mocked so the test never loads posthog and can
 * assert the 'shown' beacon precisely. Visibility is checked via the `note`
 * role (the primitive renders `<aside role="note">` only when it shows).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  MarginNote,
  hasMarginNoteBeenSeen,
  markMarginNoteSeen,
  setMarginNoteStateBackend,
} from './margin-note';

const marginNoteEvent = jest.fn();
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    wayfinding: {
      marginNote: (props: unknown) => marginNoteEvent(props),
    },
  },
}));

function storageKey(noteKey: string): string {
  return `patina:margin-note:${noteKey}`;
}

beforeEach(() => {
  window.localStorage.clear();
  marginNoteEvent.mockClear();
  setMarginNoteStateBackend(null);
});

afterEach(() => {
  setMarginNoteStateBackend(null);
});

describe('MarginNote — suppressed prop', () => {
  it('renders nothing and does NOT mark itself seen while suppressed', () => {
    render(
      <MarginNote noteKey="k-suppressed" suppressed>
        held note
      </MarginNote>,
    );
    expect(screen.queryByRole('note')).toBeNull();
    // The once-only marker must not be written — the note has to be able to
    // re-reveal once the hold lifts.
    expect(window.localStorage.getItem(storageKey('k-suppressed'))).toBeNull();
    expect(marginNoteEvent).not.toHaveBeenCalled();
  });

  it('reveals an unseen note (firing shown once) when not suppressed', () => {
    render(<MarginNote noteKey="k-visible">visible note</MarginNote>);
    expect(screen.queryByRole('note')).not.toBeNull();
    expect(marginNoteEvent).toHaveBeenCalledTimes(1);
    expect(marginNoteEvent).toHaveBeenCalledWith({ key: 'k-visible', action: 'shown' });
  });

  it('reveals an unseen note when the suppression lifts', () => {
    const { rerender } = render(
      <MarginNote noteKey="k-lift" suppressed>
        lift me
      </MarginNote>,
    );
    expect(screen.queryByRole('note')).toBeNull();

    rerender(
      <MarginNote noteKey="k-lift" suppressed={false}>
        lift me
      </MarginNote>,
    );
    expect(screen.queryByRole('note')).not.toBeNull();
    expect(marginNoteEvent).toHaveBeenCalledWith({ key: 'k-lift', action: 'shown' });
  });

  it('stays hidden when already seen, even when not suppressed', () => {
    markMarginNoteSeen('k-seen');
    render(<MarginNote noteKey="k-seen">already seen</MarginNote>);
    expect(screen.queryByRole('note')).toBeNull();
    expect(marginNoteEvent).not.toHaveBeenCalled();
  });

  it('uses external read state and reports dismissal without writing local storage', () => {
    const onSeen = jest.fn();
    const { rerender } = render(
      <MarginNote noteKey="file-change-1" seen={false} onSeen={onSeen}>
        A file changed
      </MarginNote>,
    );

    expect(screen.queryByRole('note')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss note' }));
    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(storageKey('file-change-1'))).toBeNull();

    rerender(
      <MarginNote noteKey="file-change-1" seen onSeen={onSeen}>
        A file changed
      </MarginNote>,
    );
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('markMarginNoteSeen', () => {
  it('writes the once-only marker for the given note key', () => {
    expect(window.localStorage.getItem(storageKey('k-mark'))).toBeNull();
    markMarginNoteSeen('k-mark');
    expect(window.localStorage.getItem(storageKey('k-mark'))).not.toBeNull();
  });
});

describe('MarginNote — the two-line cap (RF-03), scoped to the caller', () => {
  const LONG =
    'The margin on the right is where decisions and money gather. Esc puts the document down — and the hours log themselves while it is in your hand.';

  it('does not clamp by default — the primitive is shared, the cap is not', () => {
    render(<MarginNote noteKey="k-unclamped">{LONG}</MarginNote>);

    const body = screen.getByText(/where decisions and money gather/);
    expect(body).not.toHaveClass('line-clamp-2');
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    // The pointer-only recovery is gone with the blanket cap.
    expect(body).not.toHaveAttribute('title');
  });

  it('clamps to two lines when the caller asks, and `More` expands it in place', () => {
    render(
      <MarginNote noteKey="k-clamp" clamp>
        {LONG}
      </MarginNote>,
    );

    const body = screen.getByText(/where decisions and money gather/);
    expect(body).toHaveClass('line-clamp-2');
    expect(body).toHaveTextContent(LONG);
    // The mono footnote is its own block below the clamp, never inside it.
    expect(body).not.toHaveTextContent('Appears once');

    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveAttribute('aria-controls', body.id);

    fireEvent.click(more);

    expect(body).not.toHaveClass('line-clamp-2');
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('never clips a focusable child at the call sites that carry one', () => {
    render(
      <MarginNote noteKey="k-clamp-node">
        Start here — <button type="button">start the walkthrough</button>
      </MarginNote>,
    );

    const inner = screen.getByRole('button', { name: 'start the walkthrough' });
    // A `-webkit-box` clamp paints an overflowing child out of view while it
    // stays in the tab order (SC 2.4.11) — no ancestor of a focusable child
    // may carry the cap.
    let node: HTMLElement | null = inner;
    while (node) {
      expect(node).not.toHaveClass('line-clamp-2');
      node = node.parentElement;
    }
  });
});

describe('MarginNote — cross-device Supabase backend (decision 5, amending R94)', () => {
  it('reads and writes through the installed backend once hydrated, never touching localStorage', () => {
    const store = new Map<string, string>();
    const backend = {
      hasSeen: (key: string) => store.has(key),
      markSeen: (key: string) => store.set(key, new Date().toISOString()),
    };
    setMarginNoteStateBackend(backend, true);

    render(<MarginNote noteKey="doc-first-touch">One client, one paper.</MarginNote>);
    expect(screen.getByRole('note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss note' }));

    expect(store.has('doc-first-touch')).toBe(true);
    expect(window.localStorage.getItem(storageKey('doc-first-touch'))).toBeNull();
  });

  describe('waits for the record before deciding (FR7 F7-9, D26)', () => {
    function backendWith(seenKeys: string[]) {
      const store = new Set(seenKeys);
      return {
        hasSeen: jest.fn((key: string) => store.has(key)),
        markSeen: jest.fn((key: string) => {
          store.add(key);
        }),
      };
    }

    it('installed, unhydrated: nothing renders, even with empty localStorage', () => {
      const backend = backendWith([]);
      setMarginNoteStateBackend(backend, false);

      render(<MarginNote noteKey="band-tour-v1">The band says what&rsquo;s next.</MarginNote>);
      expect(screen.queryByRole('note')).toBeNull();
      expect(marginNoteEvent).not.toHaveBeenCalled();
      expect(backend.hasSeen).not.toHaveBeenCalled();
    });

    it('hydrated with the key seen: the note stays down', () => {
      const backend = backendWith(['band-tour-v1']);
      setMarginNoteStateBackend(backend, false);
      render(<MarginNote noteKey="band-tour-v1">The band says what&rsquo;s next.</MarginNote>);

      act(() => setMarginNoteStateBackend(backend, true));
      expect(screen.queryByRole('note')).toBeNull();
      expect(marginNoteEvent).not.toHaveBeenCalled();
      expect(backend.hasSeen).toHaveBeenCalledWith('band-tour-v1');
    });

    it('hydrated with the key unseen: the note reveals and fires shown once', () => {
      const backend = backendWith([]);
      setMarginNoteStateBackend(backend, false);
      render(<MarginNote noteKey="band-tour-v1">The band says what&rsquo;s next.</MarginNote>);
      expect(screen.queryByRole('note')).toBeNull();

      act(() => setMarginNoteStateBackend(backend, true));
      expect(screen.getByRole('note')).toBeInTheDocument();
      expect(marginNoteEvent).toHaveBeenCalledTimes(1);
      expect(marginNoteEvent).toHaveBeenCalledWith({ key: 'band-tour-v1', action: 'shown' });

      // A later re-install of the same hydrated backend does not re-fire it.
      act(() => setMarginNoteStateBackend(backend, true));
      expect(marginNoteEvent).toHaveBeenCalledTimes(1);
    });

    it('no backend: localStorage decides, as today', () => {
      window.localStorage.setItem(storageKey('k-local-seen'), String(Date.now()));
      render(
        <>
          <MarginNote noteKey="k-local-unseen">never pressed</MarginNote>
          <MarginNote noteKey="k-local-seen">already pressed</MarginNote>
        </>,
      );
      const notes = screen.getAllByRole('note');
      expect(notes).toHaveLength(1);
      expect(notes[0]).toHaveTextContent('never pressed');
      expect(marginNoteEvent).toHaveBeenCalledTimes(1);
      expect(marginNoteEvent).toHaveBeenCalledWith({ key: 'k-local-unseen', action: 'shown' });
    });

    it('hasMarginNoteBeenSeen keeps the localStorage fallback before hydration for its one-shot readers', () => {
      setMarginNoteStateBackend(backendWith(['k-reader']), false);
      expect(hasMarginNoteBeenSeen('k-reader')).toBe(false);
      window.localStorage.setItem(storageKey('k-reader'), String(Date.now()));
      expect(hasMarginNoteBeenSeen('k-reader')).toBe(true);
    });
  });

  it('falls back to localStorage once the backend is cleared (sign-out)', () => {
    const backend = { hasSeen: () => true, markSeen: jest.fn() };
    setMarginNoteStateBackend(backend, true);
    setMarginNoteStateBackend(null);

    render(<MarginNote noteKey="doc-first-touch">One client, one paper.</MarginNote>);
    // No backend installed and localStorage is empty → unseen → reveals.
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('exact-key semantics: a version-suffixed key is unseen even when the base key was seen', () => {
    markMarginNoteSeen('doc-first-touch');
    expect(hasMarginNoteBeenSeen('doc-first-touch')).toBe(true);
    expect(hasMarginNoteBeenSeen('doc-first-touch@2')).toBe(false);

    markMarginNoteSeen('doc-first-touch@2');
    expect(hasMarginNoteBeenSeen('doc-first-touch@2')).toBe(true);
    // The base key's own record is untouched by the re-arm.
    expect(hasMarginNoteBeenSeen('doc-first-touch')).toBe(true);
  });
});

describe('MarginNote — return-teaching additions (§5 changes 1–5)', () => {
  it('(a) tells onSeen why the note receded: × is dismissed', () => {
    const onSeen = jest.fn();
    render(
      <MarginNote noteKey="t-dismiss" seen={false} onSeen={onSeen}>
        body
      </MarginNote>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss note' }));
    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(onSeen).toHaveBeenCalledWith('dismissed');
  });

  it('(a) tells onSeen why the note receded: a named action event is acted', () => {
    const onSeen = jest.fn();
    render(
      <MarginNote noteKey="t-recede" seen={false} onSeen={onSeen} actionEvents={['t:used']}>
        body
      </MarginNote>,
    );
    fireEvent(window, new CustomEvent('t:used'));
    expect(onSeen).toHaveBeenCalledWith('acted');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('(b) prints the label above the sentence, and a labelled note has no default footnote', () => {
    render(
      <MarginNote noteKey="t-label" label="WORKSHOP NOTE · 11 SEP">
        Invoices now say what became of the email.
      </MarginNote>,
    );
    const label = screen.getByText('WORKSHOP NOTE · 11 SEP');
    const sentence = screen.getByText(/Invoices now say/);
    expect(label.compareDocumentPosition(sentence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label).toHaveClass('font-mono');
    expect(label.tagName).toBe('SPAN');
    expect(screen.queryByText('Appears once · Recedes on use')).toBeNull();
  });

  it('(b) keeps the footnote below the sentence for an unlabelled note, and an explicit caption', () => {
    const { unmount } = render(<MarginNote noteKey="t-footnote">body</MarginNote>);
    expect(screen.getByText('Appears once · Recedes on use')).toBeInTheDocument();
    unmount();

    render(
      <MarginNote noteKey="t-caption" label="WORKSHOP NOTE" caption="A footnote">
        body
      </MarginNote>,
    );
    const sentence = screen.getByText('body');
    const footnote = screen.getByText('A footnote');
    expect(sentence.compareDocumentPosition(footnote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('(c) renders the act as one 44px link with the clay-ink ring that recedes the note as acted', () => {
    const onSeen = jest.fn();
    render(
      <MarginNote
        noteKey="t-act"
        seen={false}
        onSeen={onSeen}
        act={{ label: 'See the Sonnenberg invoice', href: '/invoices/inv-1' }}
      >
        body
      </MarginNote>,
    );
    const link = screen.getByRole('link', { name: 'See the Sonnenberg invoice' });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(link).toHaveAttribute('href', '/invoices/inv-1');
    expect(link).toHaveClass('min-h-11');
    expect(link).toHaveClass('focus-visible:outline-[var(--color-clay-ink)]');
    fireEvent.click(link);
    expect(onSeen).toHaveBeenCalledWith('acted');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('(c) the × stays as it was beside an act', () => {
    render(
      <MarginNote noteKey="t-x" act={{ label: 'Go', href: '/go' }}>
        body
      </MarginNote>,
    );
    const x = screen.getByRole('button', { name: 'Dismiss note' });
    expect(x).toHaveClass('p-0.5');
    expect(x).not.toHaveClass('min-h-11');
  });

  it('(d) placement anchor sets the margin-column rule; default adds nothing', () => {
    const { unmount } = render(<MarginNote noteKey="t-default">body</MarginNote>);
    expect(screen.getByRole('note').className).toBe('flex max-w-[34ch] items-start gap-2 ');
    unmount();

    render(
      <MarginNote noteKey="t-anchor" placement="anchor">
        body
      </MarginNote>,
    );
    const note = screen.getByRole('note');
    expect(note).toHaveClass('border-t');
    expect(note).toHaveClass('min-[860px]:border-l');
  });

  it('(e) captureEvents={false} skips all three wayfinding captures', () => {
    const { unmount } = render(
      <MarginNote noteKey="t-quiet-1" seen={false} captureEvents={false} actionEvents={['t:quiet']}>
        body
      </MarginNote>,
    );
    fireEvent(window, new CustomEvent('t:quiet'));
    unmount();

    render(
      <MarginNote
        noteKey="t-quiet-2"
        seen={false}
        captureEvents={false}
        act={{ label: 'Go', href: '/go' }}
      >
        body
      </MarginNote>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss note' }));
    expect(marginNoteEvent).not.toHaveBeenCalled();
  });

  it('(e) captureEvents={false} marks the note ph-no-capture so autocapture skips the act link and ×', () => {
    const { unmount } = render(
      <MarginNote noteKey="t-private" seen={false} captureEvents={false} act={{ label: 'Go', href: '/go' }}>
        body
      </MarginNote>,
    );
    const note = screen.getByRole('note');
    expect(note).toHaveClass('ph-no-capture');
    expect(screen.getByRole('link', { name: 'Go' }).closest('.ph-no-capture')).toBe(note);
    expect(screen.getByRole('button', { name: 'Dismiss note' }).closest('.ph-no-capture')).toBe(note);
    unmount();

    render(
      <MarginNote noteKey="t-public" seen={false}>
        body
      </MarginNote>,
    );
    expect(screen.getByRole('note')).not.toHaveClass('ph-no-capture');
  });

  it('(e) captures shown, acted and dismissed by default', () => {
    const { unmount } = render(
      <MarginNote noteKey="t-loud" seen={false} act={{ label: 'Go', href: '/go' }}>
        body
      </MarginNote>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Go' }));
    unmount();
    render(
      <MarginNote noteKey="t-loud-2" seen={false}>
        body
      </MarginNote>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss note' }));
    expect(marginNoteEvent.mock.calls.map(([props]) => props)).toEqual([
      { key: 't-loud', action: 'shown' },
      { key: 't-loud', action: 'acted' },
      { key: 't-loud-2', action: 'shown' },
      { key: 't-loud-2', action: 'dismissed' },
    ]);
  });
});

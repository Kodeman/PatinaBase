/**
 * MarginNote — the R97 `suppressed` prop + the exported `markMarginNoteSeen`.
 *
 * The wayfinding emitter is mocked so the test never loads posthog and can
 * assert the 'shown' beacon precisely. Visibility is checked via the `note`
 * role (the primitive renders `<aside role="note">` only when it shows).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MarginNote, markMarginNoteSeen } from './margin-note';

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

/**
 * Region D (body half) — Route. Where the capture lands: personal library or a
 * project, plus style tags. The actual commit (Save / Inbox) is the sticky
 * CommitBar footer. The richer S1 routing sheet (rooms, shelf) lands in Phase 2.
 */
import { useEffect, useState } from 'react';
import { useCapture, useCaptureDispatch } from '../../state/CaptureProvider';
import { useReferenceData } from '../../hooks/use-reference-data';
import { FFESlotPicker } from '../../components/FFESlotPicker';
import {
  loadSpecBookPlacementContext,
  type SpecBookPlacementContext,
} from '../../lib/spec-book-placement';

export function RouteCommitRegion() {
  const { draft } = useCapture();
  const dispatch = useCaptureDispatch();
  const { projects, styles } = useReferenceData();
  const [stickyContext, setStickyContext] = useState<SpecBookPlacementContext | null>(null);

  useEffect(() => {
    let active = true;
    void loadSpecBookPlacementContext().then((context) => {
      if (active) setStickyContext(context);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!draft) return null;

  return (
    <section className="space-y-2 border-t border-line pt-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-soft">
          Route to
        </span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'S2' })}
          className="font-mono text-[0.58rem] uppercase tracking-[0.06em] text-verdigris hover:text-verdigris-ink"
        >
          + New project
        </button>
      </div>
      {stickyContext ? (
        <FFESlotPicker
          projects={projects}
          initialContext={stickyContext}
          onRouteChange={(route, valid) =>
            dispatch({
              type: 'SPEC_BOOK_PLACEMENT_SET',
              route,
              valid,
            })
          }
        />
      ) : (
        <div role="status" aria-label="Loading project placement" className="h-11 animate-pulse rounded-md border border-line bg-paper-3" />
      )}

      <textarea
        aria-label="Capture note"
        value={draft.note}
        onChange={(event) => dispatch({ type: 'NOTE_SET', note: event.target.value })}
        rows={2}
        placeholder="A note for later — provenance, the client's reaction, what to check"
        className="w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.85rem] text-ink outline-none placeholder:text-ink-faint focus:border-verdigris"
      />

      {styles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {styles.map((s) => {
            const active = draft.styleIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => dispatch({ type: 'STYLE_TOGGLE', styleId: s.id })}
                className={`font-mono text-[0.6rem] uppercase tracking-[0.06em] px-2 py-1 rounded-sm border transition-colors ${
                  active
                    ? 'border-verdigris bg-verdigris/10 text-verdigris'
                    : 'border-line text-ink-soft hover:border-ink-soft'
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

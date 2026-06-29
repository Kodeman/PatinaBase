/**
 * Region D (body half) — Route. Where the capture lands: personal library or a
 * project, plus style tags. The actual commit (Save / Inbox) is the sticky
 * CommitBar footer. The richer S1 routing sheet (rooms, shelf) lands in Phase 2.
 */
import { useCapture, useCaptureDispatch } from '../../state/CaptureProvider';
import { useReferenceData } from '../../hooks/use-reference-data';

export function RouteCommitRegion() {
  const { routing, draft } = useCapture();
  const dispatch = useCaptureDispatch();
  const { projects, styles } = useReferenceData();
  if (!draft) return null;

  const destValue =
    routing.destination.type === 'personal'
      ? 'personal'
      : routing.destination.projectId;

  return (
    <section className="space-y-2 border-t border-line pt-3">
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-soft">
        Route to
      </span>
      <select
        value={destValue}
        onChange={(e) => {
          const v = e.target.value;
          dispatch({
            type: 'DESTINATION_SET',
            value: v === 'personal' ? { type: 'personal' } : { type: 'project-room', projectId: v, roomId: null },
          });
        }}
        className="w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.85rem] text-ink outline-none focus:border-verdigris"
      >
        <option value="personal">Personal Library</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

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

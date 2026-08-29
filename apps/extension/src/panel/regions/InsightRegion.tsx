/**
 * Region C — Patina Insight. A plain-language note on what was read and how
 * sure we are, with a live link back to the source page. Tapping expands C5.
 */
import { useDraft, useCaptureDispatch } from '../../state/CaptureProvider';
import type { DraftFieldKey } from '../../state/types';

const FIELD_KEYS: DraftFieldKey[] = [
  'name',
  'price',
  'sku',
  'description',
  'materials',
  'colors',
  'finish',
  'dimensions',
];

export function InsightRegion() {
  const draft = useDraft();
  const dispatch = useCaptureDispatch();
  if (!draft) return null;

  let host = draft.sourceUrl;
  try {
    host = new URL(draft.sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    /* keep raw */
  }
  const read = FIELD_KEYS.filter((k) => draft.fields[k].status !== 'missing').length;
  const flagged = FIELD_KEYS.filter((k) => draft.fields[k].status === 'missing');

  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'C5' })}
      className="block w-full rounded-md border border-line bg-paper-3 p-3 text-left"
    >
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-verdigris">
        Patina insight
      </span>
      <p className="mt-1.5 text-[0.78rem] leading-snug text-ink-2">
        Read {read} of {FIELD_KEYS.length} fields from <span className="text-ink">{host}</span>.
        {flagged.length > 0 && (
          <span className="text-rust"> {flagged.join(', ')} need a look.</span>
        )}
      </p>
    </button>
  );
}

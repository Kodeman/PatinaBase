/** C5 — Patina insight expanded. What was read, per field, with a live source link. */
import { useCapture } from '../state/CaptureProvider';
import { OverlaySheet } from '../panel/OverlaySheet';
import { FieldBadge } from '../panel/FieldBadge';
import type { DraftFieldKey } from '../state/types';

const ROWS: { key: DraftFieldKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
  { key: 'sku', label: 'SKU / model #' },
  { key: 'description', label: 'Description' },
  { key: 'materials', label: 'Materials' },
  { key: 'colors', label: 'Colors' },
  { key: 'finish', label: 'Finish' },
  { key: 'dimensions', label: 'Dimensions' },
];

export function InsightSheet() {
  const { draft } = useCapture();
  if (!draft) return null;

  let host = draft.sourceUrl;
  try {
    host = new URL(draft.sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    /* keep raw */
  }

  return (
    <OverlaySheet title="What we read">
      <p className="mb-3 text-[0.82rem] leading-snug text-ink-2">
        Pulled from <span className="text-ink">{host}</span>. Verdigris means we're confident;
        rust means it needs your eye.
      </p>
      <ul className="space-y-0">
        {ROWS.map(({ key, label }) => (
          <li
            key={key}
            className="flex items-center justify-between border-b border-line py-2"
          >
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-soft">
              {label}
            </span>
            <FieldBadge status={draft.fields[key].status} />
          </li>
        ))}
      </ul>
      <a
        href={draft.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-verdigris hover:text-verdigris-ink"
      >
        Open source page ↗
      </a>
    </OverlaySheet>
  );
}

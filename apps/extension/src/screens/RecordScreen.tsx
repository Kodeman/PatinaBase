/**
 * C2 (Captured & enriched) — and, when fields are flagged, R1. One data-driven
 * screen composing the four regions, with the exact-URL duplicate banner inline.
 */
import { useCapture } from '../state/CaptureProvider';
import { RecordRegion } from '../panel/regions/RecordRegion';
import { TradeRegion } from '../panel/regions/TradeRegion';
import { InsightRegion } from '../panel/regions/InsightRegion';
import { RouteCommitRegion } from '../panel/regions/RouteCommitRegion';

export function RecordScreen() {
  const { draft, dedup, prefs, io } = useCapture();
  if (!draft) return null;

  return (
    <div className="space-y-4">
      {io.error && (
        <div className="rounded-md border-l-[3px] border-rust bg-rust/5 px-3 py-2 text-[0.82rem] text-rust">
          {io.error}
        </div>
      )}

      {dedup.match && (
        <div className="rounded-md border-l-[3px] border-brass bg-brass/5 px-3 py-2">
          <p className="text-[0.85rem] font-medium text-ink">Already in your library</p>
          <p className="mt-0.5 text-[0.78rem] text-ink-soft">
            Captured {dedup.match.capturedAt ? new Date(dedup.match.capturedAt).toLocaleDateString() : 'earlier'} — saving will update it.
          </p>
        </div>
      )}

      <RecordRegion />
      {prefs.tradeLayer && <TradeRegion />}
      <InsightRegion />
      <RouteCommitRegion />
    </div>
  );
}

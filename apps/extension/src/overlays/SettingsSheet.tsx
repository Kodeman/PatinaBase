/** T1 — Settings. Capture preferences, persisted via useSettingsSync. */
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { OverlaySheet } from '../panel/OverlaySheet';
import type { Prefs } from '../state/types';

const TOGGLES: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'tradeLayer', label: 'Trade layer', hint: 'Show the trade pricing region' },
  { key: 'dupeWarnings', label: 'Duplicate warnings', hint: 'Flag look-alikes already in your library' },
  { key: 'snapshotFallbackEnabled', label: 'Snapshot fallback', hint: 'Offer a screenshot when a page blocks extraction' },
  { key: 'ocrEnabled', label: 'Read text from images', hint: 'Use OCR to pre-fill from snapshots' },
  { key: 'autoDetect', label: 'Auto-detect vendor pages', hint: 'Switch to vendor mode on brand pages' },
];

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative h-5 w-9 flex-none rounded-full transition-colors ${on ? 'bg-verdigris' : 'bg-line-2'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all ${on ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export function SettingsSheet() {
  const { prefs } = useCapture();
  const dispatch = useCaptureDispatch();

  return (
    <OverlaySheet title="Settings">
      <ul className="space-y-0">
        {TOGGLES.map(({ key, label, hint }) => (
          <li key={key} className="flex items-center justify-between gap-3 border-b border-line py-3">
            <div>
              <p className="text-[0.88rem] text-ink">{label}</p>
              <p className="text-[0.72rem] text-ink-soft">{hint}</p>
            </div>
            <Switch
              on={!!prefs[key]}
              onClick={() => dispatch({ type: 'PREF_SET', key, value: !prefs[key] })}
            />
          </li>
        ))}
      </ul>
    </OverlaySheet>
  );
}

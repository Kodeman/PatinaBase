'use client';

import type { ClientViewerMode } from './ClientViewerCanvas';

interface ClientViewerToolbarProps {
  mode: ClientViewerMode;
  onChangeMode: (mode: ClientViewerMode) => void;
  fullQuality: boolean;
  onToggleFullQuality: () => void;
  fullQualityAvailable: boolean;
  fullQualityDisabledReason?: string;
}

export function ClientViewerToolbar({
  mode,
  onChangeMode,
  fullQuality,
  onToggleFullQuality,
  fullQualityAvailable,
  fullQualityDisabledReason,
}: ClientViewerToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
      <div className="flex items-center gap-2" role="tablist" aria-label="View mode">
        {(['orbit', 'floorplan'] as ClientViewerMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => onChangeMode(m)}
            className={[
              'rounded-[3px] px-3 py-1.5 text-sm transition',
              mode === m
                ? 'bg-[var(--accent-primary)] text-white'
                : 'border border-white/15 text-white/80 hover:bg-white/5',
            ].join(' ')}
          >
            {m === 'orbit' ? 'Orbit' : 'Floor plan'}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!fullQualityAvailable}
        onClick={onToggleFullQuality}
        title={fullQualityDisabledReason}
        className="rounded-[3px] border border-white/15 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {fullQuality ? '✓ Full quality' : 'Load full quality'}
      </button>
    </div>
  );
}

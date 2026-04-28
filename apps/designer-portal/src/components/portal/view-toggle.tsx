'use client';

export type ViewMode = 'list' | 'grid';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const ICONS: Record<ViewMode, string> = {
  list: '☰',
  grid: '▦',
};

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-[3px] border"
      style={{ borderColor: 'var(--border-default)' }}
    >
      {(['list', 'grid'] as ViewMode[]).map((mode) => {
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className="flex h-7 w-8 items-center justify-center text-[0.85rem] transition-colors"
            style={{
              background: active ? 'var(--text-primary)' : 'transparent',
              color: active ? 'var(--bg-primary)' : 'var(--text-muted)',
              transitionDuration: 'var(--duration-fast)',
            }}
            aria-pressed={active}
            aria-label={`${mode} view`}
          >
            {ICONS[mode]}
          </button>
        );
      })}
    </div>
  );
}

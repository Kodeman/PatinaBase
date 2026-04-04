'use client';

interface SpectrumSliderProps {
  leftLabel: string;
  rightLabel: string;
  value: number; // 0-100
  onChange?: (value: number) => void;
  readOnly?: boolean;
}

export function SpectrumSlider({
  leftLabel,
  rightLabel,
  value,
  onChange,
  readOnly = false,
}: SpectrumSliderProps) {
  return (
    <div className="mb-2 grid items-center gap-2" style={{ gridTemplateColumns: '80px 1fr 80px' }}>
      <span className="type-meta-small">
        {leftLabel}
      </span>
      <div className="relative h-1 rounded-sm bg-[var(--color-pearl)]">
        <div
          className="absolute -top-[3px] h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--accent-primary)] shadow-sm"
          style={{ left: `${value}%`, transform: 'translateX(-50%)' }}
        />
        {!readOnly && (
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onChange?.(Number(e.target.value))}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        )}
      </div>
      <span className="text-right type-meta-small">
        {rightLabel}
      </span>
    </div>
  );
}

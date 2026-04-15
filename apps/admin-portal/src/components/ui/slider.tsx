'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps {
  value?: number[];
  onValueChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  label?: string;
  showValue?: boolean;
}

export function Slider({
  value = [0],
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className,
  label,
  showValue = false,
}: SliderProps) {
  const [internalValue, setInternalValue] = React.useState(value);
  const currentValue = value ?? internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = [Number(e.target.value)];
    setInternalValue(newValue);
    onValueChange?.(newValue);
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[0.72rem] font-medium text-[var(--text-primary)]">{label}</label>
          {showValue && (
            <span className="type-meta-small font-mono">{currentValue[0]}</span>
          )}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue[0]}
        onChange={handleChange}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-pearl)] accent-[var(--accent-primary)]"
      />
    </div>
  );
}

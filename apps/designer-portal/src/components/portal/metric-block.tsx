'use client';

import { useEffect, useRef } from 'react';
import {
  useMotionValue,
  useSpring,
  useTransform,
  useInView,
  useReducedMotion,
  motion,
} from 'framer-motion';

interface MetricBlockProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

function parseNumericValue(value: string | number): {
  num: number;
  prefix: string;
  suffix: string;
  isNumeric: true;
} | { isNumeric: false } {
  if (typeof value === 'number') {
    return { num: value, prefix: '', suffix: '', isNumeric: true };
  }

  const match = value.match(/^([^0-9]*)([0-9][0-9,.]*)([^0-9]*)$/);
  if (!match) return { isNumeric: false };

  const num = parseFloat(match[2].replace(/,/g, ''));
  if (isNaN(num)) return { isNumeric: false };

  return { num, prefix: match[1], suffix: match[3], isNumeric: true };
}

function formatAnimatedNumber(
  current: number,
  original: string | number,
): string {
  const parsed = parseNumericValue(original);
  if (!parsed.isNumeric) return String(original);

  const rounded = Math.round(current);
  const formatted =
    parsed.num >= 1000 ? rounded.toLocaleString() : String(rounded);

  return `${parsed.prefix}${formatted}${parsed.suffix}`;
}

function AnimatedNumber({
  value,
  original,
}: {
  value: number;
  original: string | number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const prefersReducedMotion = useReducedMotion();

  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 50, damping: 20 });
  const display = useTransform(spring, (v) =>
    formatAnimatedNumber(v, original),
  );

  useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [isInView, value, motionValue]);

  if (prefersReducedMotion) {
    return <span ref={ref}>{formatAnimatedNumber(value, original)}</span>;
  }

  return <motion.span ref={ref}>{display}</motion.span>;
}

export function MetricBlock({ label, value, change, trend }: MetricBlockProps) {
  const trendColor =
    trend === 'up'
      ? 'text-[var(--color-sage)]'
      : trend === 'down'
        ? 'text-[var(--color-terracotta)]'
        : 'text-[var(--text-muted)]';

  const parsed = parseNumericValue(value);

  return (
    <div className="flex flex-col">
      <span className="type-meta mb-2">{label}</span>
      <span className="type-data-large mb-1">
        {parsed.isNumeric ? (
          <AnimatedNumber value={parsed.num} original={value} />
        ) : (
          value
        )}
      </span>
      {change && (
        <span className={`type-body-small ${trendColor}`}>{change}</span>
      )}
    </div>
  );
}

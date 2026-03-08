import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const progressRingVariants = cva('flex items-center justify-center', {
  variants: {
    size: {
      sm: 'w-12 h-12',
      md: 'w-16 h-16',
      lg: 'w-24 h-24',
      xl: 'w-32 h-32',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const getProgressColor = (value: number): string => {
  if (value < 25) return 'stroke-red-500';
  if (value < 50) return 'stroke-orange-500';
  if (value < 75) return 'stroke-yellow-500';
  if (value < 100) return 'stroke-blue-500';
  return 'stroke-green-500';
};

export interface ProgressRingProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressRingVariants> {
  value: number; // 0-100
  showLabel?: boolean;
  strokeWidth?: number;
  color?: string;
}

const ProgressRing = React.forwardRef<HTMLDivElement, ProgressRingProps>(
  (
    { className, size, value, showLabel = true, strokeWidth = 4, color, ...props },
    ref
  ) => {
    const normalizedValue = Math.min(Math.max(value, 0), 100);
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (normalizedValue / 100) * circumference;

    const progressColor = color || getProgressColor(normalizedValue);

    return (
      <div
        ref={ref}
        className={cn(progressRingVariants({ size }), 'relative', className)}
        {...props}
      >
        <svg className="transform -rotate-90" width="100%" height="100%" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-gray-200 dark:text-gray-700"
          />

          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn('transition-all duration-500 ease-out', progressColor)}
          />
        </svg>

        {/* Label */}
        {showLabel && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {Math.round(normalizedValue)}%
            </span>
          </div>
        )}
      </div>
    );
  }
);

ProgressRing.displayName = 'ProgressRing';

export { ProgressRing, progressRingVariants };
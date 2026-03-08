import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const statusVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      status: {
        draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
        active: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
        'in-progress': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
        'on-hold': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
        completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
        cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
        archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      },
      size: {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-2.5 py-0.5',
        lg: 'text-base px-3 py-1',
      },
    },
    defaultVariants: {
      status: 'draft',
      size: 'md',
    },
  }
);

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  'in-progress': 'In Progress',
  'on-hold': 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

const statusIcons: Record<string, React.ReactNode> = {
  draft: <span className="mr-1">📝</span>,
  active: <span className="mr-1">🚀</span>,
  'in-progress': <span className="mr-1">⚡</span>,
  'on-hold': <span className="mr-1">⏸️</span>,
  completed: <span className="mr-1">✅</span>,
  cancelled: <span className="mr-1">❌</span>,
  archived: <span className="mr-1">📦</span>,
};

export interface ProjectStatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusVariants> {
  showIcon?: boolean;
  customLabel?: string;
}

const ProjectStatusBadge = React.forwardRef<HTMLSpanElement, ProjectStatusBadgeProps>(
  ({ className, status, size, showIcon = true, customLabel, ...props }, ref) => {
    const statusKey = status || 'draft';
    const label = customLabel || statusLabels[statusKey] || statusKey;

    return (
      <span
        ref={ref}
        className={cn(statusVariants({ status, size }), className)}
        {...props}
      >
        {showIcon && statusIcons[statusKey]}
        {label}
      </span>
    );
  }
);

ProjectStatusBadge.displayName = 'ProjectStatusBadge';

export { ProjectStatusBadge, statusVariants };
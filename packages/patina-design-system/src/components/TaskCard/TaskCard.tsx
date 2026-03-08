import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';
import { ProjectStatusBadge } from '../ProjectStatusBadge';

const taskCardVariants = cva(
  'rounded-lg border bg-white dark:bg-gray-800 transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'border-gray-200 dark:border-gray-700 hover:shadow-md',
        compact: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        detailed: 'border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg',
        dragging: 'border-blue-300 dark:border-blue-600 shadow-lg opacity-50',
      },
      priority: {
        low: '',
        medium: '',
        high: 'border-l-4 border-l-orange-400',
        critical: 'border-l-4 border-l-red-500',
      },
      size: {
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
      interactive: {
        true: 'cursor-pointer',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      priority: 'medium',
      size: 'md',
      interactive: true,
    },
  }
);

const priorityLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const priorityColors: Record<string, string> = {
  low: 'text-gray-600 dark:text-gray-400',
  medium: 'text-blue-600 dark:text-blue-400',
  high: 'text-orange-600 dark:text-orange-400',
  critical: 'text-red-600 dark:text-red-400',
};

export interface TaskCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>,
    VariantProps<typeof taskCardVariants> {
  id: string;
  title: string;
  description?: string;
  status?: 'pending' | 'in-progress' | 'completed' | 'blocked' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignee?: {
    id: string;
    name: string;
    avatar?: string;
  };
  dueDate?: Date | string;
  completedAt?: Date | string;
  tags?: string[];
  showActions?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onView?: (id: string) => void;
}

const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(
  (
    {
      className,
      variant,
      priority = 'medium',
      size,
      interactive,
      id,
      title,
      description,
      status = 'pending',
      assignee,
      dueDate,
      completedAt,
      tags = [],
      showActions = true,
      onEdit,
      onDelete,
      onView,
      onClick,
      ...props
    },
    ref
  ) => {
    const isOverdue =
      dueDate && status !== 'completed' && status !== 'cancelled'
        ? new Date(dueDate) < new Date()
        : false;

    // Map task status to ProjectStatusBadge status
    const mapStatusToBadge = (
      taskStatus: 'pending' | 'in-progress' | 'completed' | 'blocked' | 'cancelled'
    ): 'draft' | 'active' | 'in-progress' | 'on-hold' | 'completed' | 'cancelled' | 'archived' => {
      switch (taskStatus) {
        case 'pending':
          return 'draft';
        case 'blocked':
          return 'on-hold';
        case 'in-progress':
          return 'in-progress';
        case 'completed':
          return 'completed';
        case 'cancelled':
          return 'cancelled';
        default:
          return 'draft';
      }
    };

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (onClick) {
        onClick(e);
      } else if (onView) {
        onView(id);
      }
    };

    const formatDate = (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
      <div
        ref={ref}
        className={cn(taskCardVariants({ variant, priority, size, interactive }), className)}
        onClick={handleClick}
        {...props}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
              {title}
            </h3>
            {description && variant !== 'compact' && (
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                {description}
              </p>
            )}
          </div>
          <ProjectStatusBadge status={mapStatusToBadge(status)} size="sm" showIcon={false} />
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400 mb-3">
          {/* Priority */}
          <div className="flex items-center gap-1">
            <span className="font-medium">Priority:</span>
            <span className={cn('font-semibold', priorityColors[priority])}>
              {priorityLabels[priority]}
            </span>
          </div>

          {/* Due Date */}
          {dueDate && (
            <div className="flex items-center gap-1">
              <span className="font-medium">Due:</span>
              <span className={cn(isOverdue && 'text-red-600 dark:text-red-400 font-semibold')}>
                {formatDate(dueDate)}
                {isOverdue && ' (Overdue)'}
              </span>
            </div>
          )}

          {/* Completed Date */}
          {completedAt && status === 'completed' && (
            <div className="flex items-center gap-1">
              <span className="font-medium">Completed:</span>
              <span>{formatDate(completedAt)}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && variant !== 'compact' && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
          {/* Assignee */}
          {assignee ? (
            <div className="flex items-center gap-2">
              {assignee.avatar ? (
                <img
                  src={assignee.avatar}
                  alt={assignee.name}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                  {assignee.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                {assignee.name}
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-500 italic">Unassigned</span>
          )}

          {/* Actions */}
          {showActions && (
            <div className="flex items-center gap-1">
              {onView && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(id);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="View task"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                </button>
              )}
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(id);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="Edit task"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(id);
                  }}
                  className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                  aria-label="Delete task"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

TaskCard.displayName = 'TaskCard';

export { TaskCard, taskCardVariants };

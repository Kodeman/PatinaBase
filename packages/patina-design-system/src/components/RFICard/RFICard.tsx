import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const rfiCardVariants = cva(
  'rounded-lg border bg-white dark:bg-gray-800 transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'border-gray-200 dark:border-gray-700 hover:shadow-md',
        compact: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        detailed: 'border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg',
      },
      status: {
        pending: 'border-l-4 border-l-yellow-400',
        answered: 'border-l-4 border-l-green-500',
        closed: 'border-l-4 border-l-gray-400',
        overdue: 'border-l-4 border-l-red-500',
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
      status: 'pending',
      size: 'md',
      interactive: true,
    },
  }
);

const statusConfig = {
  pending: {
    label: 'Pending Response',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
    icon: '⏳',
  },
  answered: {
    label: 'Answered',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    icon: '✅',
  },
  closed: {
    label: 'Closed',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: '🔒',
  },
  overdue: {
    label: 'Overdue',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    icon: '🚨',
  },
};

export interface RFICardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>,
    VariantProps<typeof rfiCardVariants> {
  id: string;
  rfiNumber: string;
  title: string;
  question: string;
  answer?: string;
  status?: 'pending' | 'answered' | 'closed' | 'overdue';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  submittedBy: {
    id: string;
    name: string;
    avatar?: string;
  };
  assignedTo?: {
    id: string;
    name: string;
    avatar?: string;
  };
  submittedAt: Date | string;
  dueDate?: Date | string;
  answeredAt?: Date | string;
  category?: string;
  showActions?: boolean;
  onAnswer?: (id: string) => void;
  onView?: (id: string) => void;
  onClose?: (id: string) => void;
}

const RFICard = React.forwardRef<HTMLDivElement, RFICardProps>(
  (
    {
      className,
      variant,
      status = 'pending',
      priority = 'medium',
      size,
      interactive,
      id,
      rfiNumber,
      title,
      question,
      answer,
      submittedBy,
      assignedTo,
      submittedAt,
      dueDate,
      answeredAt,
      category,
      showActions = true,
      onAnswer,
      onView,
      onClose,
      onClick,
      ...props
    },
    ref
  ) => {
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

    const formatDateTime = (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    };

    const config = statusConfig[status];

    return (
      <div
        ref={ref}
        className={cn(rfiCardVariants({ variant, status, size, interactive }), className)}
        onClick={handleClick}
        {...props}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                {rfiNumber}
              </span>
              {category && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                  {category}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {title}
            </h3>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
              config.color
            )}
          >
            <span>{config.icon}</span>
            {config.label}
          </span>
        </div>

        {/* Question */}
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Question:</p>
          <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">{question}</p>
        </div>

        {/* Answer (if provided) */}
        {answer && variant !== 'compact' && (
          <div className="mb-3 p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
              Answer:
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">{answer}</p>
            {answeredAt && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                Answered on {formatDateTime(answeredAt)}
              </p>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-400 mb-3">
          <div className="flex items-center gap-1">
            <span className="font-medium">Submitted:</span>
            <span>{formatDate(submittedAt)}</span>
          </div>
          {dueDate && (
            <div className="flex items-center gap-1">
              <span className="font-medium">Due:</span>
              <span className={cn(status === 'overdue' && 'text-red-600 dark:text-red-400 font-semibold')}>
                {formatDate(dueDate)}
              </span>
            </div>
          )}
          {priority && (
            <div className="flex items-center gap-1">
              <span className="font-medium">Priority:</span>
              <span
                className={cn(
                  priority === 'critical' && 'text-red-600 dark:text-red-400 font-semibold',
                  priority === 'high' && 'text-orange-600 dark:text-orange-400 font-semibold',
                  priority === 'medium' && 'text-blue-600 dark:text-blue-400',
                  priority === 'low' && 'text-gray-600 dark:text-gray-400'
                )}
              >
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
          {/* People */}
          <div className="flex items-center gap-3">
            {/* Submitted By */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-500">From:</span>
              {submittedBy.avatar ? (
                <img
                  src={submittedBy.avatar}
                  alt={submittedBy.name}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                  {submittedBy.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                {submittedBy.name}
              </span>
            </div>

            {/* Assigned To */}
            {assignedTo && (
              <>
                <span className="text-gray-300 dark:text-gray-600">→</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-500">To:</span>
                  {assignedTo.avatar ? (
                    <img
                      src={assignedTo.avatar}
                      alt={assignedTo.name}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-semibold">
                      {assignedTo.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                    {assignedTo.name}
                  </span>
                </div>
              </>
            )}
          </div>

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
                  aria-label="View RFI"
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
              {onAnswer && status === 'pending' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnswer(id);
                  }}
                  className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors"
                  aria-label="Answer RFI"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                </button>
              )}
              {onClose && status !== 'closed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(id);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="Close RFI"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
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

RFICard.displayName = 'RFICard';

export { RFICard, rfiCardVariants };

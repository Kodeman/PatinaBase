import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const changeOrderCardVariants = cva(
  'rounded-lg border bg-white dark:bg-gray-800 transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'border-gray-200 dark:border-gray-700 hover:shadow-md',
        compact: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        detailed: 'border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg',
      },
      status: {
        draft: 'border-l-4 border-l-gray-400',
        submitted: 'border-l-4 border-l-blue-500',
        approved: 'border-l-4 border-l-green-500',
        rejected: 'border-l-4 border-l-red-500',
        'on-hold': 'border-l-4 border-l-orange-400',
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
      status: 'draft',
      size: 'md',
      interactive: true,
    },
  }
);

const statusConfig = {
  draft: {
    label: 'Draft',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    icon: '📝',
  },
  submitted: {
    label: 'Pending Approval',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    icon: '⏳',
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    icon: '✅',
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    icon: '❌',
  },
  'on-hold': {
    label: 'On Hold',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
    icon: '⏸️',
  },
};

export interface ChangeOrderCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>,
    VariantProps<typeof changeOrderCardVariants> {
  id: string;
  changeOrderNumber: string;
  title: string;
  description: string;
  reason?: string;
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'on-hold';
  costImpact: number; // Positive for increase, negative for decrease
  timeImpact?: number; // Days
  submittedBy: {
    id: string;
    name: string;
    avatar?: string;
  };
  reviewedBy?: {
    id: string;
    name: string;
    avatar?: string;
  };
  submittedAt?: Date | string;
  reviewedAt?: Date | string;
  showActions?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
}

const ChangeOrderCard = React.forwardRef<HTMLDivElement, ChangeOrderCardProps>(
  (
    {
      className,
      variant,
      status = 'draft',
      size,
      interactive,
      id,
      changeOrderNumber,
      title,
      description,
      reason,
      costImpact,
      timeImpact,
      submittedBy,
      reviewedBy,
      submittedAt,
      reviewedAt,
      showActions = true,
      onApprove,
      onReject,
      onView,
      onEdit,
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

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(Math.abs(amount));
    };

    const config = statusConfig[status];

    return (
      <div
        ref={ref}
        className={cn(changeOrderCardVariants({ variant, status, size, interactive }), className)}
        onClick={handleClick}
        {...props}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-semibold text-purple-600 dark:text-purple-400">
                {changeOrderNumber}
              </span>
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

        {/* Description */}
        <div className="mb-3">
          <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">{description}</p>
        </div>

        {/* Reason (if provided) */}
        {reason && variant !== 'compact' && (
          <div className="mb-3 p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
              Reason:
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200">{reason}</p>
          </div>
        )}

        {/* Impact Summary */}
        <div className="grid grid-cols-2 gap-3 mb-3 p-3 rounded-md bg-gray-50 dark:bg-gray-900/50">
          {/* Cost Impact */}
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Cost Impact
            </p>
            <div className="flex items-center gap-1">
              {costImpact > 0 ? (
                <>
                  <svg
                    className="w-4 h-4 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                    />
                  </svg>
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                    +{formatCurrency(costImpact)}
                  </span>
                </>
              ) : costImpact < 0 ? (
                <>
                  <svg
                    className="w-4 h-4 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                    -{formatCurrency(costImpact)}
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  No Change
                </span>
              )}
            </div>
          </div>

          {/* Time Impact */}
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Time Impact
            </p>
            <div className="flex items-center gap-1">
              {timeImpact ? (
                timeImpact > 0 ? (
                  <>
                    <svg
                      className="w-4 h-4 text-orange-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                      +{timeImpact} days
                    </span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                      {timeImpact} days
                    </span>
                  </>
                )
              ) : (
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  No Impact
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Metadata */}
        {(submittedAt || reviewedAt) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-400 mb-3">
            {submittedAt && (
              <div className="flex items-center gap-1">
                <span className="font-medium">Submitted:</span>
                <span>{formatDate(submittedAt)}</span>
              </div>
            )}
            {reviewedAt && (
              <div className="flex items-center gap-1">
                <span className="font-medium">Reviewed:</span>
                <span>{formatDate(reviewedAt)}</span>
              </div>
            )}
          </div>
        )}

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

            {/* Reviewed By */}
            {reviewedBy && (
              <>
                <span className="text-gray-300 dark:text-gray-600">→</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-500">Reviewed:</span>
                  {reviewedBy.avatar ? (
                    <img
                      src={reviewedBy.avatar}
                      alt={reviewedBy.name}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                      {reviewedBy.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                    {reviewedBy.name}
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
                  aria-label="View change order"
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
              {onEdit && (status === 'draft' || status === 'on-hold') && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(id);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="Edit change order"
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
              {onApprove && status === 'submitted' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove(id);
                  }}
                  className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors"
                  aria-label="Approve change order"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
              )}
              {onReject && status === 'submitted' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject(id);
                  }}
                  className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                  aria-label="Reject change order"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
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

ChangeOrderCard.displayName = 'ChangeOrderCard';

export { ChangeOrderCard, changeOrderCardVariants };

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const issueCardVariants = cva(
  'rounded-lg border bg-white dark:bg-gray-800 transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'border-gray-200 dark:border-gray-700 hover:shadow-md',
        compact: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        detailed: 'border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg',
      },
      severity: {
        low: 'border-l-4 border-l-blue-400',
        medium: 'border-l-4 border-l-yellow-400',
        high: 'border-l-4 border-l-orange-500',
        critical: 'border-l-4 border-l-red-600',
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
      severity: 'medium',
      size: 'md',
      interactive: true,
    },
  }
);

const statusConfig = {
  reported: {
    label: 'Reported',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    icon: '🚨',
  },
  investigating: {
    label: 'Investigating',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
    icon: '🔍',
  },
  'in-progress': {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    icon: '🔧',
  },
  resolved: {
    label: 'Resolved',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    icon: '✅',
  },
  closed: {
    label: 'Closed',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: '🔒',
  },
};

const severityConfig = {
  low: {
    label: 'Low',
    color: 'text-blue-600 dark:text-blue-400',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-600 dark:text-yellow-400',
  },
  high: {
    label: 'High',
    color: 'text-orange-600 dark:text-orange-400',
  },
  critical: {
    label: 'Critical',
    color: 'text-red-600 dark:text-red-400',
  },
};

export interface IssueCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>,
    VariantProps<typeof issueCardVariants> {
  id: string;
  issueNumber: string;
  title: string;
  description: string;
  status?: 'reported' | 'investigating' | 'in-progress' | 'resolved' | 'closed';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  impact?: string;
  resolution?: string;
  reportedBy: {
    id: string;
    name: string;
    avatar?: string;
  };
  assignedTo?: {
    id: string;
    name: string;
    avatar?: string;
  };
  reportedAt: Date | string;
  resolvedAt?: Date | string;
  showActions?: boolean;
  onResolve?: (id: string) => void;
  onAssign?: (id: string) => void;
  onView?: (id: string) => void;
  onClose?: (id: string) => void;
}

const IssueCard = React.forwardRef<HTMLDivElement, IssueCardProps>(
  (
    {
      className,
      variant,
      severity = 'medium',
      size,
      interactive,
      id,
      issueNumber,
      title,
      description,
      status = 'reported',
      category,
      impact,
      resolution,
      reportedBy,
      assignedTo,
      reportedAt,
      resolvedAt,
      showActions = true,
      onResolve,
      onAssign,
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

    const statusConf = statusConfig[status];
    const severityConf = severityConfig[severity];

    return (
      <div
        ref={ref}
        className={cn(issueCardVariants({ variant, severity, size, interactive }), className)}
        onClick={handleClick}
        {...props}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono font-semibold text-red-600 dark:text-red-400">
                {issueNumber}
              </span>
              {category && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                  {category}
                </span>
              )}
              <span className={cn('text-xs font-semibold', severityConf.color)}>
                {severityConf.label} Severity
              </span>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {title}
            </h3>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
              statusConf.color
            )}
          >
            <span>{statusConf.icon}</span>
            {statusConf.label}
          </span>
        </div>

        {/* Description */}
        <div className="mb-3">
          <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">{description}</p>
        </div>

        {/* Impact (if provided) */}
        {impact && variant !== 'compact' && (
          <div className="mb-3 p-3 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
            <p className="text-xs font-medium text-orange-700 dark:text-orange-400 mb-1">
              Impact:
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200">{impact}</p>
          </div>
        )}

        {/* Resolution (if provided) */}
        {resolution && variant !== 'compact' && (
          <div className="mb-3 p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
              Resolution:
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200">{resolution}</p>
            {resolvedAt && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                Resolved on {formatDateTime(resolvedAt)}
              </p>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-400 mb-3">
          <div className="flex items-center gap-1">
            <span className="font-medium">Reported:</span>
            <span>{formatDate(reportedAt)}</span>
          </div>
          {resolvedAt && (
            <div className="flex items-center gap-1">
              <span className="font-medium">Resolved:</span>
              <span>{formatDate(resolvedAt)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
          {/* People */}
          <div className="flex items-center gap-3">
            {/* Reported By */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-500">Reported:</span>
              {reportedBy.avatar ? (
                <img
                  src={reportedBy.avatar}
                  alt={reportedBy.name}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-semibold">
                  {reportedBy.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                {reportedBy.name}
              </span>
            </div>

            {/* Assigned To */}
            {assignedTo ? (
              <>
                <span className="text-gray-300 dark:text-gray-600">→</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-500">Assigned:</span>
                  {assignedTo.avatar ? (
                    <img
                      src={assignedTo.avatar}
                      alt={assignedTo.name}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                      {assignedTo.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                    {assignedTo.name}
                  </span>
                </div>
              </>
            ) : (
              onAssign && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssign(id);
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Assign →
                </button>
              )
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
                  aria-label="View issue"
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
              {onResolve && status !== 'resolved' && status !== 'closed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onResolve(id);
                  }}
                  className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors"
                  aria-label="Resolve issue"
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
              {onClose && status !== 'closed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(id);
                  }}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="Close issue"
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

IssueCard.displayName = 'IssueCard';

export { IssueCard, issueCardVariants };

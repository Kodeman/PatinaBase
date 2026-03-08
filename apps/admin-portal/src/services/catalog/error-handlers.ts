/**
 * Error Handling Utilities
 *
 * Provides centralized error handling with user-friendly toast notifications.
 * Handles various error types: API errors, network errors, validation errors.
 *
 * @module error-handlers
 */

import { toast } from 'sonner';

export interface ServiceError {
  message: string;
  statusCode?: number;
  code?: string;
  details?: any;
}

/**
 * Handle service errors with user-friendly notifications
 * Shows error toast with detailed information when available
 */
export function handleServiceError(error: unknown, fallbackMessage: string): void {
  console.error('[Service Error]', error);

  let errorMessage = fallbackMessage;
  let description: string | undefined;

  if (error instanceof Error) {
    errorMessage = error.message || fallbackMessage;
  } else if (typeof error === 'object' && error !== null) {
    const err = error as any;
    errorMessage = err.message || fallbackMessage;
    description = err.details || err.response?.data?.message;
  }

  toast.error(errorMessage, {
    description,
    duration: 5000,
    action: {
      label: 'Dismiss',
      onClick: () => toast.dismiss(),
    },
  });
}

/**
 * Show success toast notification
 */
export function showSuccessToast(message: string, description?: string): void {
  toast.success(message, {
    description,
    duration: 3000,
  });
}

/**
 * Show warning toast notification
 */
export function showWarningToast(message: string, description?: string): void {
  toast.warning(message, {
    description,
    duration: 4000,
  });
}

/**
 * Show info toast notification
 */
export function showInfoToast(message: string, description?: string): void {
  toast.info(message, {
    description,
    duration: 3000,
  });
}

/**
 * Show loading toast for long-running operations
 * Returns toast ID for updating later
 */
export function showLoadingToast(message: string, description?: string): string | number {
  return toast.loading(message, {
    description: description || 'This may take a few moments...',
  });
}

/**
 * Update a loading toast with success or error result
 */
export function updateLoadingToast(
  toastId: string | number,
  success: boolean,
  message: string,
  description?: string
): void {
  if (success) {
    toast.success(message, { id: toastId, description });
  } else {
    toast.error(message, { id: toastId, description });
  }
}

/**
 * Show toast for bulk operation results
 * Displays success/failure counts and provides action to view details
 */
export function showBulkOperationToast(
  operation: string,
  success: number,
  failed: number,
  total: number
): void {
  if (failed === 0) {
    toast.success(`${operation} completed`, {
      description: `Successfully processed ${success} of ${total} items`,
      duration: 4000,
    });
  } else if (success === 0) {
    toast.error(`${operation} failed`, {
      description: `Failed to process all ${total} items`,
      duration: 5000,
      action: {
        label: 'View Details',
        onClick: () => {
          console.log('TODO: Show detailed error modal');
        },
      },
    });
  } else {
    toast.warning(`${operation} completed with errors`, {
      description: `Successful: ${success}, Failed: ${failed}, Total: ${total}`,
      duration: 5000,
      action: {
        label: 'View Details',
        onClick: () => {
          console.log('TODO: Show detailed error modal');
        },
      },
    });
  }
}

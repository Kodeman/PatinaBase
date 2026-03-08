/**
 * useBulkOperationLock Hook
 *
 * Provides a locking mechanism to prevent concurrent bulk operations from
 * interfering with each other. Ensures only one bulk operation can run at a time.
 *
 * Features:
 * - Acquire/release lock pattern
 * - Operation name tracking
 * - User-friendly warnings when operations are blocked
 * - Automatic cleanup on unmount
 *
 * @module hooks/useBulkOperationLock
 */

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Hook return interface
 */
export interface BulkOperationLock {
  /** Whether an operation is currently locked */
  isLocked: boolean;
  /** Name of the current operation in progress */
  currentOperation: string | null;
  /** Acquire the lock for an operation */
  acquireLock: (operation: string) => boolean;
  /** Release the current lock */
  releaseLock: () => void;
}

/**
 * Hook for managing bulk operation locking
 *
 * Prevents race conditions by ensuring only one bulk operation
 * can execute at a time. Shows user-friendly warnings when
 * operations are blocked.
 *
 * @returns Lock management interface
 *
 * @example
 * ```typescript
 * const lock = useBulkOperationLock();
 *
 * async function handlePublish() {
 *   if (!lock.acquireLock('Bulk Publish')) {
 *     return; // Operation blocked
 *   }
 *
 *   try {
 *     await publishProducts();
 *   } finally {
 *     lock.releaseLock();
 *   }
 * }
 * ```
 */
export function useBulkOperationLock(): BulkOperationLock {
  const [isLocked, setIsLocked] = useState(false);
  const [currentOperation, setCurrentOperation] = useState<string | null>(null);

  /**
   * Attempt to acquire the lock for a bulk operation
   *
   * @param operation - Name of the operation (for display)
   * @returns true if lock was acquired, false if blocked
   */
  const acquireLock = useCallback(
    (operation: string): boolean => {
      if (isLocked) {
        toast.warning('Operation in progress', {
          description: `Please wait for "${currentOperation}" to complete before starting another operation.`,
          duration: 3000,
        });
        return false;
      }

      setIsLocked(true);
      setCurrentOperation(operation);
      return true;
    },
    [isLocked, currentOperation]
  );

  /**
   * Release the current lock
   *
   * Should be called in a finally block to ensure
   * lock is released even on errors
   */
  const releaseLock = useCallback(() => {
    setIsLocked(false);
    setCurrentOperation(null);
  }, []);

  /**
   * Cleanup on unmount - release any active locks
   */
  useEffect(() => {
    return () => {
      if (isLocked) {
        console.warn(
          `useBulkOperationLock: Component unmounted with active lock for "${currentOperation}". Lock released.`
        );
        setIsLocked(false);
        setCurrentOperation(null);
      }
    };
  }, [isLocked, currentOperation]);

  return {
    isLocked,
    currentOperation,
    acquireLock,
    releaseLock,
  };
}

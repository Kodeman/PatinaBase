/**
 * Unit tests for useBulkOperationLock hook
 *
 * Tests operation locking mechanism to prevent concurrent bulk operations
 */

import { renderHook, act } from '@testing-library/react';
import { useBulkOperationLock } from '../useBulkOperationLock';
import { toast } from 'sonner';

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    warning: jest.fn(),
  },
}));

describe('useBulkOperationLock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Lock acquisition', () => {
    it('should acquire lock successfully when no operation is running', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      expect(result.current.isLocked).toBe(false);
      expect(result.current.currentOperation).toBeNull();

      let acquired = false;
      act(() => {
        acquired = result.current.acquireLock('Test Operation');
      });

      expect(acquired).toBe(true);
      expect(result.current.isLocked).toBe(true);
      expect(result.current.currentOperation).toBe('Test Operation');
    });

    it('should prevent concurrent locks', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      // Acquire first lock
      act(() => {
        result.current.acquireLock('Operation 1');
      });

      expect(result.current.isLocked).toBe(true);
      expect(result.current.currentOperation).toBe('Operation 1');

      // Try to acquire second lock (should fail)
      let acquired = false;
      act(() => {
        acquired = result.current.acquireLock('Operation 2');
      });

      expect(acquired).toBe(false);
      expect(result.current.isLocked).toBe(true);
      expect(result.current.currentOperation).toBe('Operation 1'); // Still first operation

      // Verify toast warning was shown
      expect(toast.warning).toHaveBeenCalledWith('Operation in progress', {
        description: 'Please wait for "Operation 1" to complete before starting another operation.',
        duration: 3000,
      });
    });

    it('should handle multiple acquire attempts', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      act(() => {
        result.current.acquireLock('First Operation');
      });

      // Try multiple times - all should fail
      act(() => {
        expect(result.current.acquireLock('Second Operation')).toBe(false);
        expect(result.current.acquireLock('Third Operation')).toBe(false);
        expect(result.current.acquireLock('Fourth Operation')).toBe(false);
      });

      // Original operation still locked
      expect(result.current.currentOperation).toBe('First Operation');
      expect(toast.warning).toHaveBeenCalledTimes(3);
    });
  });

  describe('Lock release', () => {
    it('should release lock successfully', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      // Acquire lock
      act(() => {
        result.current.acquireLock('Test Operation');
      });

      expect(result.current.isLocked).toBe(true);

      // Release lock
      act(() => {
        result.current.releaseLock();
      });

      expect(result.current.isLocked).toBe(false);
      expect(result.current.currentOperation).toBeNull();
    });

    it('should allow new lock after release', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      // First operation
      act(() => {
        result.current.acquireLock('Operation 1');
        result.current.releaseLock();
      });

      // Second operation should succeed
      let acquired = false;
      act(() => {
        acquired = result.current.acquireLock('Operation 2');
      });

      expect(acquired).toBe(true);
      expect(result.current.currentOperation).toBe('Operation 2');
    });

    it('should handle release when no lock is held', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      // Release without acquiring (should be safe)
      expect(() => {
        act(() => {
          result.current.releaseLock();
        });
      }).not.toThrow();

      expect(result.current.isLocked).toBe(false);
    });
  });

  describe('Sequential operations', () => {
    it('should allow sequential operations', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      // Operation 1
      act(() => {
        result.current.acquireLock('Operation 1');
        result.current.releaseLock();
      });

      // Operation 2
      act(() => {
        const acquired = result.current.acquireLock('Operation 2');
        expect(acquired).toBe(true);
        expect(result.current.currentOperation).toBe('Operation 2');
      });
    });

    it('should handle rapid sequential operations', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      const operations = ['Op1', 'Op2', 'Op3', 'Op4', 'Op5'];

      operations.forEach((op) => {
        act(() => {
          const acquired = result.current.acquireLock(op);
          expect(acquired).toBe(true);
          expect(result.current.currentOperation).toBe(op);
          result.current.releaseLock();
        });
      });

      expect(result.current.isLocked).toBe(false);
    });
  });

  describe('Error scenarios', () => {
    it('should track operation name correctly on blocked attempts', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      act(() => {
        result.current.acquireLock('Primary Operation');
      });

      // Try multiple different operations
      const blockedOps = ['Blocked Op 1', 'Blocked Op 2', 'Blocked Op 3'];

      blockedOps.forEach((op) => {
        act(() => {
          const acquired = result.current.acquireLock(op);
          expect(acquired).toBe(false);
        });
      });

      // Original operation should still be locked
      expect(result.current.currentOperation).toBe('Primary Operation');
    });

    it('should handle empty operation names', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      act(() => {
        const acquired = result.current.acquireLock('');
        expect(acquired).toBe(true);
      });

      expect(result.current.currentOperation).toBe('');
    });
  });

  describe('Cleanup on unmount', () => {
    it('should log warning when unmounted with active lock', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result, unmount } = renderHook(() => useBulkOperationLock());

      act(() => {
        result.current.acquireLock('Active Operation');
      });

      unmount();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Component unmounted with active lock')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should not log warning when unmounted without active lock', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { unmount } = renderHook(() => useBulkOperationLock());

      unmount();

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should not log warning when lock released before unmount', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result, unmount } = renderHook(() => useBulkOperationLock());

      act(() => {
        result.current.acquireLock('Test Operation');
        result.current.releaseLock();
      });

      unmount();

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Integration scenarios', () => {
    it('should work in try-finally pattern', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      const executeOperation = () => {
        let acquired = false;

        act(() => {
          acquired = result.current.acquireLock('Try-Finally Operation');
        });

        if (!acquired) {
          return false;
        }

        try {
          // Simulate work
          return true;
        } finally {
          act(() => {
            result.current.releaseLock();
          });
        }
      };

      expect(executeOperation()).toBe(true);
      expect(result.current.isLocked).toBe(false);
    });

    it('should release lock even when operation throws', () => {
      const { result } = renderHook(() => useBulkOperationLock());

      const executeOperationWithError = () => {
        act(() => {
          result.current.acquireLock('Error Operation');
        });

        try {
          throw new Error('Operation failed');
        } finally {
          act(() => {
            result.current.releaseLock();
          });
        }
      };

      expect(() => executeOperationWithError()).toThrow('Operation failed');
      expect(result.current.isLocked).toBe(false);
    });
  });
});

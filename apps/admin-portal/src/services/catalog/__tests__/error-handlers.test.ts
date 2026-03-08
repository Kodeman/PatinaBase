import { toast } from 'sonner';
import {
  handleServiceError,
  showSuccessToast,
  showWarningToast,
  showInfoToast,
  showLoadingToast,
  updateLoadingToast,
  showBulkOperationToast,
} from '../error-handlers';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    loading: jest.fn(() => 'toast-id-123'),
    dismiss: jest.fn(),
  },
}));

describe('error-handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console methods to avoid cluttering test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleServiceError', () => {
    it('should show error toast with fallback message', () => {
      const error = new Error('Network error');
      handleServiceError(error, 'Failed to fetch data');

      expect(toast.error).toHaveBeenCalledWith(
        'Network error',
        expect.objectContaining({
          duration: 5000,
        })
      );
    });

    it('should use fallback message when error has no message', () => {
      handleServiceError({}, 'Failed to fetch data');

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to fetch data',
        expect.objectContaining({
          duration: 5000,
        })
      );
    });

    it('should include description from error details', () => {
      const error = {
        message: 'API Error',
        details: 'Detailed error information',
      };
      handleServiceError(error, 'Failed to fetch data');

      expect(toast.error).toHaveBeenCalledWith(
        'API Error',
        expect.objectContaining({
          description: 'Detailed error information',
          duration: 5000,
        })
      );
    });

    it('should include dismiss action', () => {
      const error = new Error('Test error');
      handleServiceError(error, 'Failed');

      expect(toast.error).toHaveBeenCalledWith(
        'Test error',
        expect.objectContaining({
          action: expect.objectContaining({
            label: 'Dismiss',
          }),
        })
      );
    });

    it('should log error to console', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error');
      const error = new Error('Test error');
      handleServiceError(error, 'Failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[Service Error]', error);
    });
  });

  describe('showSuccessToast', () => {
    it('should show success toast with message', () => {
      showSuccessToast('Operation completed');

      expect(toast.success).toHaveBeenCalledWith(
        'Operation completed',
        expect.objectContaining({
          duration: 3000,
        })
      );
    });

    it('should include description when provided', () => {
      showSuccessToast('Operation completed', 'Successfully processed 10 items');

      expect(toast.success).toHaveBeenCalledWith(
        'Operation completed',
        expect.objectContaining({
          description: 'Successfully processed 10 items',
          duration: 3000,
        })
      );
    });
  });

  describe('showWarningToast', () => {
    it('should show warning toast with message', () => {
      showWarningToast('Warning message');

      expect(toast.warning).toHaveBeenCalledWith(
        'Warning message',
        expect.objectContaining({
          duration: 4000,
        })
      );
    });

    it('should include description when provided', () => {
      showWarningToast('Warning', 'This is a warning description');

      expect(toast.warning).toHaveBeenCalledWith(
        'Warning',
        expect.objectContaining({
          description: 'This is a warning description',
          duration: 4000,
        })
      );
    });
  });

  describe('showInfoToast', () => {
    it('should show info toast with message', () => {
      showInfoToast('Info message');

      expect(toast.info).toHaveBeenCalledWith(
        'Info message',
        expect.objectContaining({
          duration: 3000,
        })
      );
    });

    it('should include description when provided', () => {
      showInfoToast('Info', 'This is additional info');

      expect(toast.info).toHaveBeenCalledWith(
        'Info',
        expect.objectContaining({
          description: 'This is additional info',
          duration: 3000,
        })
      );
    });
  });

  describe('showLoadingToast', () => {
    it('should show loading toast and return toast ID', () => {
      const toastId = showLoadingToast('Processing...');

      expect(toast.loading).toHaveBeenCalledWith(
        'Processing...',
        expect.objectContaining({
          description: 'This may take a few moments...',
        })
      );
      expect(toastId).toBe('toast-id-123');
    });

    it('should use custom description when provided', () => {
      showLoadingToast('Processing...', 'Custom loading message');

      expect(toast.loading).toHaveBeenCalledWith(
        'Processing...',
        expect.objectContaining({
          description: 'Custom loading message',
        })
      );
    });
  });

  describe('updateLoadingToast', () => {
    it('should update to success toast when success is true', () => {
      updateLoadingToast('toast-123', true, 'Completed', 'Successfully processed');

      expect(toast.success).toHaveBeenCalledWith('Completed', {
        id: 'toast-123',
        description: 'Successfully processed',
      });
    });

    it('should update to error toast when success is false', () => {
      updateLoadingToast('toast-123', false, 'Failed', 'Error occurred');

      expect(toast.error).toHaveBeenCalledWith('Failed', {
        id: 'toast-123',
        description: 'Error occurred',
      });
    });
  });

  describe('showBulkOperationToast', () => {
    it('should show success toast when all items succeed', () => {
      showBulkOperationToast('Bulk publish', 10, 0, 10);

      expect(toast.success).toHaveBeenCalledWith(
        'Bulk publish completed',
        expect.objectContaining({
          description: 'Successfully processed 10 of 10 items',
          duration: 4000,
        })
      );
    });

    it('should show error toast when all items fail', () => {
      showBulkOperationToast('Bulk publish', 0, 10, 10);

      expect(toast.error).toHaveBeenCalledWith(
        'Bulk publish failed',
        expect.objectContaining({
          description: 'Failed to process all 10 items',
          duration: 5000,
        })
      );
    });

    it('should show warning toast when some items fail', () => {
      showBulkOperationToast('Bulk publish', 7, 3, 10);

      expect(toast.warning).toHaveBeenCalledWith(
        'Bulk publish completed with errors',
        expect.objectContaining({
          description: 'Successful: 7, Failed: 3, Total: 10',
          duration: 5000,
        })
      );
    });

    it('should include View Details action for partial failures', () => {
      showBulkOperationToast('Bulk publish', 7, 3, 10);

      expect(toast.warning).toHaveBeenCalledWith(
        'Bulk publish completed with errors',
        expect.objectContaining({
          action: expect.objectContaining({
            label: 'View Details',
          }),
        })
      );
    });

    it('should include View Details action for complete failures', () => {
      showBulkOperationToast('Bulk publish', 0, 10, 10);

      expect(toast.error).toHaveBeenCalledWith(
        'Bulk publish failed',
        expect.objectContaining({
          action: expect.objectContaining({
            label: 'View Details',
          }),
        })
      );
    });
  });
});

import {
  PatinaError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  isPatinaError,
  getErrorMessage,
  toPatinaError,
  wrapAsync,
} from './error';

describe('Error Utilities', () => {
  describe('PatinaError', () => {
    it('should create error with all properties', () => {
      const error = new PatinaError('Test error', 'TEST_ERROR', 400, { field: 'value' });
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'value' });
      expect(error.name).toBe('PatinaError');
    });

    it('should use default status code 500', () => {
      const error = new PatinaError('Test error', 'TEST_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should create error without details', () => {
      const error = new PatinaError('Test error', 'TEST_ERROR', 400);
      expect(error.details).toBeUndefined();
    });

    it('should have stack trace', () => {
      const error = new PatinaError('Test error', 'TEST_ERROR');
      expect(error.stack).toBeDefined();
    });

    it('should serialize to JSON correctly', () => {
      const error = new PatinaError('Test error', 'TEST_ERROR', 400, { field: 'value' });
      const json = error.toJSON();
      expect(json).toEqual({
        error: {
          name: 'PatinaError',
          message: 'Test error',
          code: 'TEST_ERROR',
          statusCode: 400,
          details: { field: 'value' },
        },
      });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'email' });
      expect(error.name).toBe('ValidationError');
    });

    it('should create validation error without details', () => {
      const error = new ValidationError('Invalid input');
      expect(error.details).toBeUndefined();
    });

    it('should be instance of PatinaError', () => {
      const error = new ValidationError('Invalid input');
      expect(error).toBeInstanceOf(PatinaError);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource and id', () => {
      const error = new NotFoundError('User', '123');
      expect(error.message).toBe('User with id 123 not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NotFoundError');
    });

    it('should create not found error without id', () => {
      const error = new NotFoundError('User');
      expect(error.message).toBe('User not found');
    });

    it('should be instance of PatinaError', () => {
      const error = new NotFoundError('User');
      expect(error).toBeInstanceOf(PatinaError);
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should create unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Invalid token');
      expect(error.message).toBe('Invalid token');
    });

    it('should be instance of PatinaError', () => {
      const error = new UnauthorizedError();
      expect(error).toBeInstanceOf(PatinaError);
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error with default message', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('Forbidden');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
      expect(error.name).toBe('ForbiddenError');
    });

    it('should create forbidden error with custom message', () => {
      const error = new ForbiddenError('Access denied');
      expect(error.message).toBe('Access denied');
    });

    it('should be instance of PatinaError', () => {
      const error = new ForbiddenError();
      expect(error).toBeInstanceOf(PatinaError);
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists', { field: 'email' });
      expect(error.message).toBe('Resource already exists');
      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
      expect(error.details).toEqual({ field: 'email' });
      expect(error.name).toBe('ConflictError');
    });

    it('should create conflict error without details', () => {
      const error = new ConflictError('Resource already exists');
      expect(error.details).toBeUndefined();
    });

    it('should be instance of PatinaError', () => {
      const error = new ConflictError('Conflict');
      expect(error).toBeInstanceOf(PatinaError);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with default message', () => {
      const error = new RateLimitError();
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.name).toBe('RateLimitError');
    });

    it('should create rate limit error with custom message', () => {
      const error = new RateLimitError('Too many requests');
      expect(error.message).toBe('Too many requests');
    });

    it('should include retry after value', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);
      expect(error.retryAfter).toBe(60);
      expect(error.details).toEqual({ retryAfter: 60 });
    });

    it('should work without retry after value', () => {
      const error = new RateLimitError();
      expect(error.retryAfter).toBeUndefined();
    });

    it('should be instance of PatinaError', () => {
      const error = new RateLimitError();
      expect(error).toBeInstanceOf(PatinaError);
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error with default message', () => {
      const error = new ServiceUnavailableError();
      expect(error.message).toBe('Service temporarily unavailable');
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.statusCode).toBe(503);
      expect(error.name).toBe('ServiceUnavailableError');
    });

    it('should create service unavailable error with custom message', () => {
      const error = new ServiceUnavailableError('Database is down');
      expect(error.message).toBe('Database is down');
    });

    it('should be instance of PatinaError', () => {
      const error = new ServiceUnavailableError();
      expect(error).toBeInstanceOf(PatinaError);
    });
  });

  describe('isPatinaError', () => {
    it('should return true for PatinaError instances', () => {
      const error = new PatinaError('Test', 'TEST');
      expect(isPatinaError(error)).toBe(true);
    });

    it('should return true for PatinaError subclasses', () => {
      expect(isPatinaError(new ValidationError('Test'))).toBe(true);
      expect(isPatinaError(new NotFoundError('User'))).toBe(true);
      expect(isPatinaError(new UnauthorizedError())).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Test');
      expect(isPatinaError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isPatinaError('error')).toBe(false);
      expect(isPatinaError(null)).toBe(false);
      expect(isPatinaError(undefined)).toBe(false);
      expect(isPatinaError(123)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Test error');
      expect(getErrorMessage(error)).toBe('Test error');
    });

    it('should extract message from PatinaError instance', () => {
      const error = new PatinaError('Test error', 'TEST');
      expect(getErrorMessage(error)).toBe('Test error');
    });

    it('should return string if error is a string', () => {
      expect(getErrorMessage('Error string')).toBe('Error string');
    });

    it('should return default message for unknown error types', () => {
      expect(getErrorMessage(null)).toBe('An unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
      expect(getErrorMessage(123)).toBe('An unknown error occurred');
      expect(getErrorMessage({})).toBe('An unknown error occurred');
    });
  });

  describe('toPatinaError', () => {
    it('should return PatinaError as-is', () => {
      const error = new PatinaError('Test', 'TEST', 400);
      const result = toPatinaError(error);
      expect(result).toBe(error);
    });

    it('should return PatinaError subclasses as-is', () => {
      const error = new ValidationError('Test');
      const result = toPatinaError(error);
      expect(result).toBe(error);
    });

    it('should convert Error to PatinaError', () => {
      const error = new Error('Test error');
      const result = toPatinaError(error);
      expect(result).toBeInstanceOf(PatinaError);
      expect(result.message).toBe('Test error');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should convert string to PatinaError', () => {
      const result = toPatinaError('Error string');
      expect(result).toBeInstanceOf(PatinaError);
      expect(result.message).toBe('Error string');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should convert unknown error to PatinaError', () => {
      const result = toPatinaError(123);
      expect(result).toBeInstanceOf(PatinaError);
      expect(result.message).toBe('An unknown error occurred');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.statusCode).toBe(500);
    });
  });

  describe('wrapAsync', () => {
    it('should return result on success', async () => {
      const fn = async (x: number) => x * 2;
      const wrapped = wrapAsync(fn);
      const result = await wrapped(5);
      expect(result).toBe(10);
    });

    it('should convert thrown Error to PatinaError', async () => {
      const fn = async () => {
        throw new Error('Test error');
      };
      const wrapped = wrapAsync(fn);
      await expect(wrapped()).rejects.toBeInstanceOf(PatinaError);
    });

    it('should preserve PatinaError', async () => {
      const originalError = new ValidationError('Invalid input');
      const fn = async () => {
        throw originalError;
      };
      const wrapped = wrapAsync(fn);
      await expect(wrapped()).rejects.toBe(originalError);
    });

    it('should handle function with multiple parameters', async () => {
      const fn = async (a: number, b: number) => a + b;
      const wrapped = wrapAsync(fn);
      const result = await wrapped(3, 4);
      expect(result).toBe(7);
    });

    it('should convert string error to PatinaError', async () => {
      const fn = async () => {
        throw 'String error';
      };
      const wrapped = wrapAsync(fn);

      try {
        await wrapped();
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PatinaError);
        expect((error as PatinaError).message).toBe('String error');
      }
    });

    it('should preserve return type', async () => {
      const fn = async (x: number): Promise<string> => x.toString();
      const wrapped = wrapAsync(fn);
      const result = await wrapped(123);
      expect(typeof result).toBe('string');
      expect(result).toBe('123');
    });
  });
});

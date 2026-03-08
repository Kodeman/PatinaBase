/**
 * Base API Client Tests
 * Tests for core functionality including interceptors, error handling, and response unwrapping
 */

// Mock axios
jest.mock('axios');
import axios, { AxiosInstance } from 'axios';

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

const mockAxios = axios as jest.Mocked<typeof axios>;

describe('BaseApiClient', () => {
  let mockAxiosInstance: jest.Mocked<AxiosInstance>;
  let config: ApiClientConfig;
  let requestInterceptor: any;
  let responseErrorInterceptor: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      request: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn((onFulfilled) => {
            requestInterceptor = onFulfilled;
            return 0;
          }),
        },
        response: {
          use: jest.fn((_onFulfilled, onRejected) => {
            responseErrorInterceptor = onRejected;
            return 0;
          }),
        },
      },
    } as any;

    mockAxios.create.mockReturnValue(mockAxiosInstance);

    // Base config
    config = {
      baseURL: 'http://localhost:3011',
      timeout: 30000,
      isDevelopment: false,
    };
  });

  describe('initialization', () => {
    it('should create axios instance with correct config', () => {
      new BaseApiClient(config);

      expect(mockAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:3011',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should setup request and response interceptors', () => {
      new BaseApiClient(config);

      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('response unwrapping', () => {
    class TestClient extends BaseApiClient {
      constructor(config: ApiClientConfig) {
        super(config);
      }

      // Expose protected methods for testing
      async testGet<T>(url: string) {
        return this.get<T>(url);
      }
    }

    it('should unwrap wrapped responses', async () => {
      const client = new TestClient(config);
      const wrappedResponse = {
        data: {
          data: { id: '123', name: 'Test Product' },
          meta: { total: 1, page: 1 },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(wrappedResponse);

      const result = await client.testGet('/products');

      expect(result).toEqual({ id: '123', name: 'Test Product' });
    });

    it('should handle unwrapped responses', async () => {
      const client = new TestClient(config);
      const unwrappedResponse = {
        data: { id: '123', name: 'Test Product' },
      };

      mockAxiosInstance.get.mockResolvedValue(unwrappedResponse);

      const result = await client.testGet('/products');

      expect(result).toEqual({ id: '123', name: 'Test Product' });
    });

    it('should handle array responses', async () => {
      const client = new TestClient(config);
      const arrayResponse = {
        data: [
          { id: '1', name: 'Product 1' },
          { id: '2', name: 'Product 2' },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue(arrayResponse);

      const result = await client.testGet('/products');

      expect(result).toEqual([
        { id: '1', name: 'Product 1' },
        { id: '2', name: 'Product 2' },
      ]);
    });
  });

  describe('error handling', () => {
    class TestClient extends BaseApiClient {
      constructor(config: ApiClientConfig) {
        super(config);
      }

      async testGet<T>(url: string) {
        return this.get<T>(url);
      }
    }

    it('should transform 429 errors correctly', async () => {
      const client = new TestClient(config);
      const error = {
        response: {
          status: 429,
          headers: { 'retry-after': '60' },
          data: {},
        },
        config: {},
      };

      // Mock the get method to trigger the error interceptor
      mockAxiosInstance.get.mockImplementation(async () => {
        throw await responseErrorInterceptor(error);
      });

      await expect(client.testGet('/products')).rejects.toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
        message: expect.stringContaining('after 60 seconds'),
      });
    });

    it('should transform 5xx errors correctly', async () => {
      const client = new TestClient(config);
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal error' },
        },
        config: {},
      };

      // Mock the get method to trigger the error interceptor
      mockAxiosInstance.get.mockImplementation(async () => {
        throw await responseErrorInterceptor(error);
      });

      await expect(client.testGet('/products')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        message: 'A server error occurred. Please try again later.',
      });
    });

    it('should handle network errors', async () => {
      const client = new TestClient(config);
      const error = {
        message: 'Network Error',
        config: {},
      };

      // Mock the get method to trigger the error interceptor
      mockAxiosInstance.get.mockImplementation(async () => {
        throw await responseErrorInterceptor(error);
      });

      await expect(client.testGet('/products')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: 'Network Error',
      });
    });
  });

  describe('request ID generation', () => {
    it('should add request ID header', async () => {
      new BaseApiClient(config);

      const mockConfig: any = { headers: {} };
      const result = await requestInterceptor(mockConfig);

      expect(result.headers['X-Request-Id']).toBeDefined();
      expect(typeof result.headers['X-Request-Id']).toBe('string');
    });

    it('should add timestamp in development mode', async () => {
      const devConfig = { ...config, isDevelopment: true };
      new BaseApiClient(devConfig);

      const mockConfig: any = { headers: {} };
      const result = await requestInterceptor(mockConfig);

      expect(result.headers['X-Request-Time']).toBeDefined();
    });

    it('should not add timestamp in production mode', async () => {
      new BaseApiClient(config);

      const mockConfig: any = { headers: {} };
      const result = await requestInterceptor(mockConfig);

      expect(result.headers['X-Request-Time']).toBeUndefined();
    });
  });
});

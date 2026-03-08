import { ApiClient } from '../api-client'

describe('ApiClient', () => {
  let apiClient: ApiClient
  let mockGetToken: jest.Mock

  beforeEach(() => {
    mockGetToken = jest.fn()
    apiClient = new ApiClient('https://api.example.com', mockGetToken)
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      const mockData = { id: 1, name: 'Test' }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      })

      const result = await apiClient.get('/users')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
      expect(result).toEqual({ data: mockData })
    })

    it('should include Authorization header when token is provided', async () => {
      mockGetToken.mockResolvedValueOnce('test-token')
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await apiClient.get('/users')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
    })

    it('should not include Authorization header when token is null', async () => {
      mockGetToken.mockResolvedValueOnce(null)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await apiClient.get('/users')

      const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers
      expect(headers.Authorization).toBeUndefined()
    })
  })

  describe('POST requests', () => {
    it('should make successful POST request with body', async () => {
      const requestBody = { name: 'New User' }
      const mockResponse = { id: 1, ...requestBody }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await apiClient.post('/users', requestBody)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
        })
      )
      expect(result).toEqual({ data: mockResponse })
    })

    it('should handle POST request without body', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await apiClient.post('/action')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/action',
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        })
      )
    })
  })

  describe('PATCH requests', () => {
    it('should make successful PATCH request', async () => {
      const updateData = { status: 'active' }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => updateData,
      })

      const result = await apiClient.patch('/users/1', updateData)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        })
      )
      expect(result).toEqual({ data: updateData })
    })
  })

  describe('DELETE requests', () => {
    it('should make successful DELETE request', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      const result = await apiClient.delete('/users/1')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
      expect(result).toEqual({ data: {} })
    })
  })

  describe('PUT requests', () => {
    it('should make successful PUT request', async () => {
      const putData = { name: 'Updated User' }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => putData,
      })

      const result = await apiClient.put('/users/1', putData)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(putData),
        })
      )
      expect(result).toEqual({ data: putData })
    })
  })

  describe('Error handling', () => {
    it('should handle API error responses', async () => {
      const errorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => errorResponse,
      })

      const result = await apiClient.get('/users/999')

      expect(result).toEqual({ error: errorResponse.error })
      expect(result.data).toBeUndefined()
    })

    it('should handle API error responses without error object', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      })

      const result = await apiClient.get('/users/999')

      expect(result).toEqual({
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unknown error occurred',
        },
      })
    })

    it('should handle network errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const result = await apiClient.get('/users')

      expect(result).toEqual({
        error: {
          code: 'NETWORK_ERROR',
          message: 'Network request failed',
        },
      })
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Custom headers', () => {
    it('should merge custom headers with default headers', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await apiClient.get('/users', {
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom-Header': 'custom-value',
          }),
        })
      )
    })
  })
})

import { usersService } from '../users'
import { apiClient } from '@/lib/api-client'

// Mock the api-client module
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}))

describe('usersService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getUsers', () => {
    it('should fetch users without parameters', async () => {
      const mockUsers = { data: [{ id: '1', email: 'test@example.com' }] }
      ;(apiClient.get as jest.Mock).mockResolvedValueOnce(mockUsers)

      await usersService.getUsers()

      expect(apiClient.get).toHaveBeenCalledWith('/v1/users?')
    })

    it('should fetch users with query parameters', async () => {
      const mockUsers = { data: [] }
      ;(apiClient.get as jest.Mock).mockResolvedValueOnce(mockUsers)

      await usersService.getUsers({
        query: 'john',
        status: 'active',
        role: 'admin',
        page: 2,
        pageSize: 20,
      })

      expect(apiClient.get).toHaveBeenCalledWith(
        '/v1/users?query=john&status=active&role=admin&page=2&pageSize=20'
      )
    })
  })

  describe('getUser', () => {
    it('should fetch a specific user', async () => {
      const mockUser = { data: { id: '123', email: 'user@example.com' } }
      ;(apiClient.get as jest.Mock).mockResolvedValueOnce(mockUser)

      await usersService.getUser('123')

      expect(apiClient.get).toHaveBeenCalledWith('/v1/users/123')
    })
  })

  describe('updateUser', () => {
    it('should update a user', async () => {
      const updateData = { displayName: 'John Doe' }
      const mockResponse = { data: { id: '123', ...updateData } }
      ;(apiClient.patch as jest.Mock).mockResolvedValueOnce(mockResponse)

      await usersService.updateUser('123', updateData)

      expect(apiClient.patch).toHaveBeenCalledWith('/v1/users/123', updateData)
    })
  })

  describe('suspendUser', () => {
    it('should suspend a user without reason', async () => {
      ;(apiClient.post as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.suspendUser('123')

      expect(apiClient.post).toHaveBeenCalledWith('/v1/users/123/suspend', {
        reason: undefined,
      })
    })

    it('should suspend a user with reason', async () => {
      ;(apiClient.post as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.suspendUser('123', 'Terms violation')

      expect(apiClient.post).toHaveBeenCalledWith('/v1/users/123/suspend', {
        reason: 'Terms violation',
      })
    })
  })

  describe('banUser', () => {
    it('should ban a user with reason', async () => {
      ;(apiClient.post as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.banUser('123', 'Fraud detected')

      expect(apiClient.post).toHaveBeenCalledWith('/v1/users/123/ban', {
        reason: 'Fraud detected',
      })
    })
  })

  describe('reactivateUser', () => {
    it('should reactivate a user', async () => {
      ;(apiClient.post as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.reactivateUser('123')

      expect(apiClient.post).toHaveBeenCalledWith('/v1/users/123/reactivate')
    })
  })

  describe('Role Management', () => {
    it('should fetch all roles', async () => {
      const mockRoles = { data: [{ id: '1', name: 'admin' }] }
      ;(apiClient.get as jest.Mock).mockResolvedValueOnce(mockRoles)

      await usersService.getRoles()

      expect(apiClient.get).toHaveBeenCalledWith('/v1/roles')
    })

    it('should assign role to user', async () => {
      ;(apiClient.post as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.assignRole('user-123', 'role-456', 'Promoted to admin')

      expect(apiClient.post).toHaveBeenCalledWith('/v1/users/user-123/roles', {
        roleId: 'role-456',
        reason: 'Promoted to admin',
      })
    })

    it('should revoke role from user', async () => {
      ;(apiClient.delete as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.revokeRole('user-123', 'role-456', 'Demotion')

      expect(apiClient.delete).toHaveBeenCalledWith('/v1/users/user-123/roles/role-456', {
        body: JSON.stringify({ reason: 'Demotion' }),
      })
    })
  })

  describe('Designer Verification', () => {
    it('should fetch verification queue', async () => {
      const mockQueue = { data: [] }
      ;(apiClient.get as jest.Mock).mockResolvedValueOnce(mockQueue)

      await usersService.getVerificationQueue({
        status: 'submitted',
        page: 1,
        pageSize: 10,
      })

      expect(apiClient.get).toHaveBeenCalledWith(
        '/v1/admin/verification-queue?status=submitted&page=1&pageSize=10'
      )
    })

    it('should get designer profile', async () => {
      const mockProfile = { data: { userId: '123' } }
      ;(apiClient.get as jest.Mock).mockResolvedValueOnce(mockProfile)

      await usersService.getDesignerProfile('123')

      expect(apiClient.get).toHaveBeenCalledWith('/v1/designers/123')
    })

    it('should approve designer', async () => {
      ;(apiClient.post as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.approveDesigner('123', 'Verified credentials')

      expect(apiClient.post).toHaveBeenCalledWith('/v1/admin/designers/123/decision', {
        status: 'approved',
        notes: 'Verified credentials',
      })
    })

    it('should reject designer', async () => {
      ;(apiClient.post as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.rejectDesigner('123', 'Invalid documents')

      expect(apiClient.post).toHaveBeenCalledWith('/v1/admin/designers/123/decision', {
        status: 'rejected',
        notes: 'Invalid documents',
      })
    })

    it('should request more information', async () => {
      ;(apiClient.post as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.requestMoreInfo('123', 'Please provide tax ID')

      expect(apiClient.post).toHaveBeenCalledWith('/v1/admin/designers/123/request-info', {
        message: 'Please provide tax ID',
      })
    })
  })

  describe('Sessions Management', () => {
    it('should get user sessions', async () => {
      const mockSessions = { data: [{ id: 'session-1' }] }
      ;(apiClient.get as jest.Mock).mockResolvedValueOnce(mockSessions)

      await usersService.getUserSessions('123')

      expect(apiClient.get).toHaveBeenCalledWith('/v1/users/123/sessions')
    })

    it('should revoke specific session', async () => {
      ;(apiClient.delete as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.revokeSession('123', 'session-456')

      expect(apiClient.delete).toHaveBeenCalledWith('/v1/users/123/sessions/session-456')
    })

    it('should revoke all sessions', async () => {
      ;(apiClient.post as jest.Mock).mockResolvedValueOnce({ data: undefined })

      await usersService.revokeAllSessions('123')

      expect(apiClient.post).toHaveBeenCalledWith('/v1/users/123/sessions/revoke-all')
    })
  })
})

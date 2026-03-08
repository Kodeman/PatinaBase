import {
  Role,
  Permission,
  hasPermission,
  requirePermission,
  hasRole,
  hasAnyRole,
  hasAllRoles,
  getUserPermissions,
  canPerformAction,
  getPrimaryRole,
  isAdmin,
  isDesigner,
  isClient,
  type Session,
} from '../rbac';

describe('RBAC Utilities', () => {
  const mockDesignerSession: Session = {
    user: {
      id: '1',
      email: 'designer@example.com',
      name: 'John Designer',
      roles: ['designer'],
    },
    accessToken: 'token',
    expires: new Date(Date.now() + 3600000).toISOString(),
  };

  const mockAdminSession: Session = {
    user: {
      id: '2',
      email: 'admin@example.com',
      name: 'Jane Admin',
      roles: ['admin'],
    },
    accessToken: 'token',
    expires: new Date(Date.now() + 3600000).toISOString(),
  };

  const mockClientSession: Session = {
    user: {
      id: '3',
      email: 'client@example.com',
      name: 'Bob Client',
      roles: ['client'],
    },
    accessToken: 'token',
    expires: new Date(Date.now() + 3600000).toISOString(),
  };

  describe('hasPermission', () => {
    it('should return true when user has the permission', () => {
      expect(hasPermission(mockDesignerSession, Permission.CREATE_CLIENT)).toBe(true);
      expect(hasPermission(mockAdminSession, Permission.MANAGE_USERS)).toBe(true);
    });

    it('should return false when user does not have the permission', () => {
      expect(hasPermission(mockClientSession, Permission.CREATE_CLIENT)).toBe(false);
      expect(hasPermission(mockDesignerSession, Permission.MANAGE_USERS)).toBe(false);
    });

    it('should return false when session is null', () => {
      expect(hasPermission(null, Permission.CREATE_CLIENT)).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true when user has the role', () => {
      expect(hasRole(mockDesignerSession, Role.DESIGNER)).toBe(true);
      expect(hasRole(mockAdminSession, Role.ADMIN)).toBe(true);
    });

    it('should return false when user does not have the role', () => {
      expect(hasRole(mockDesignerSession, Role.ADMIN)).toBe(false);
      expect(hasRole(mockClientSession, Role.DESIGNER)).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('should return true when user has any of the roles', () => {
      expect(hasAnyRole(mockDesignerSession, [Role.DESIGNER, Role.ADMIN])).toBe(true);
      expect(hasAnyRole(mockAdminSession, [Role.DESIGNER, Role.ADMIN])).toBe(true);
    });

    it('should return false when user has none of the roles', () => {
      expect(hasAnyRole(mockClientSession, [Role.DESIGNER, Role.ADMIN])).toBe(false);
    });
  });

  describe('hasAllRoles', () => {
    const multiRoleSession: Session = {
      user: {
        id: '4',
        email: 'multi@example.com',
        name: 'Multi Role',
        roles: ['designer', 'admin'],
      },
      accessToken: 'token',
      expires: new Date(Date.now() + 3600000).toISOString(),
    };

    it('should return true when user has all roles', () => {
      expect(hasAllRoles(multiRoleSession, [Role.DESIGNER, Role.ADMIN])).toBe(true);
    });

    it('should return false when user does not have all roles', () => {
      expect(hasAllRoles(mockDesignerSession, [Role.DESIGNER, Role.ADMIN])).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return all permissions for a designer', () => {
      const permissions = getUserPermissions(mockDesignerSession);
      expect(permissions).toContain(Permission.CREATE_CLIENT);
      expect(permissions).toContain(Permission.CREATE_PROPOSAL);
      expect(permissions).not.toContain(Permission.MANAGE_USERS);
    });

    it('should return all permissions for an admin', () => {
      const permissions = getUserPermissions(mockAdminSession);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions).toContain(Permission.MANAGE_USERS);
    });

    it('should return empty array for null session', () => {
      expect(getUserPermissions(null)).toEqual([]);
    });
  });

  describe('canPerformAction', () => {
    it('should return true when user can perform action', () => {
      expect(canPerformAction(mockDesignerSession, 'create', 'client')).toBe(true);
      expect(canPerformAction(mockAdminSession, 'manage', 'users')).toBe(true);
    });

    it('should return false when user cannot perform action', () => {
      expect(canPerformAction(mockClientSession, 'create', 'client')).toBe(false);
      expect(canPerformAction(mockDesignerSession, 'manage', 'users')).toBe(false);
    });
  });

  describe('getPrimaryRole', () => {
    it('should return admin for admin users', () => {
      expect(getPrimaryRole(mockAdminSession)).toBe(Role.ADMIN);
    });

    it('should return designer for designer users', () => {
      expect(getPrimaryRole(mockDesignerSession)).toBe(Role.DESIGNER);
    });

    it('should return client for client users', () => {
      expect(getPrimaryRole(mockClientSession)).toBe(Role.CLIENT);
    });

    it('should return null for null session', () => {
      expect(getPrimaryRole(null)).toBe(null);
    });
  });

  describe('Role checking helpers', () => {
    it('isAdmin should work correctly', () => {
      expect(isAdmin(mockAdminSession)).toBe(true);
      expect(isAdmin(mockDesignerSession)).toBe(false);
    });

    it('isDesigner should work correctly', () => {
      expect(isDesigner(mockDesignerSession)).toBe(true);
      expect(isDesigner(mockClientSession)).toBe(false);
    });

    it('isClient should work correctly', () => {
      expect(isClient(mockClientSession)).toBe(true);
      expect(isClient(mockDesignerSession)).toBe(false);
    });
  });

  describe('requirePermission', () => {
    it('should not throw when user has permission', () => {
      expect(() => {
        requirePermission(mockDesignerSession, Permission.CREATE_CLIENT);
      }).not.toThrow();
    });

    it('should throw when user does not have permission', () => {
      expect(() => {
        requirePermission(mockClientSession, Permission.CREATE_CLIENT);
      }).toThrow('Missing permission: create:client');
    });
  });
});

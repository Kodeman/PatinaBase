// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT TYPES
// Comprehensive types for organizations, roles, and permissions
// ═══════════════════════════════════════════════════════════════════════════

export type UUID = string;

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════

export type OrganizationType = 'design_studio' | 'manufacturer' | 'contractor' | 'admin_team';
export type OrganizationStatus = 'active' | 'suspended' | 'pending_approval' | 'deactivated';
export type SubscriptionTier = 'free' | 'professional' | 'enterprise';
export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';
export type MemberStatus = 'active' | 'invited' | 'suspended' | 'removed';
export type RoleDomain = 'consumer' | 'designer' | 'manufacturer' | 'admin';
export type ApiKeyEnvironment = 'live' | 'test';
export type ApiKeyStatus = 'active' | 'revoked';
export type AuditStatus = 'success' | 'failure' | 'denied';
export type OAuthProvider = 'apple' | 'google';

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM ROLE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const SYSTEM_ROLES = {
  // Consumer Domain
  APP_USER: 'app_user',
  CLIENT: 'client',

  // Designer Domain
  INDEPENDENT_DESIGNER: 'independent_designer',
  STUDIO_OWNER: 'studio_owner',
  STUDIO_ADMIN: 'studio_admin',
  STUDIO_DESIGNER: 'studio_designer',

  // Manufacturer Domain
  BRAND_ADMIN: 'brand_admin',
  CATALOG_MANAGER: 'catalog_manager',
  OPERATIONS_LEAD: 'operations_lead',
  PARTNER_MANAGER: 'partner_manager',

  // Admin Domain
  SUPER_ADMIN: 'super_admin',
  ML_OPERATOR: 'ml_operator',
  QUALITY_CONTROL: 'quality_control',
  SUPPORT_AGENT: 'support_agent',
} as const;

export type SystemRoleName = typeof SYSTEM_ROLES[keyof typeof SYSTEM_ROLES];

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const PERMISSIONS = {
  // User Management
  USER_READ_OWN: 'user.read.own',
  USER_UPDATE_OWN: 'user.update.own',
  USER_READ_ORG: 'user.read.org',
  USER_MANAGE_ORG: 'user.manage.org',
  USER_ADMIN_ALL: 'user.admin.all',

  // Organization
  ORG_READ_OWN: 'org.read.own',
  ORG_UPDATE_OWN: 'org.update.own',
  ORG_BILLING_MANAGE: 'org.billing.manage',
  ORG_API_KEYS_MANAGE: 'org.api_keys.manage',

  // Products
  PRODUCT_READ: 'product.read',
  PRODUCT_WRITE_ORG: 'product.write.org',
  PRODUCT_UPDATE_ORG: 'product.update.org',
  PRODUCT_DELETE_ORG: 'product.delete.org',
  PRODUCT_ADMIN_ALL: 'product.admin.all',
  PRODUCT_VALIDATE: 'product.validate',

  // Orders
  ORDER_READ_OWN: 'order.read.own',
  ORDER_READ_ORG: 'order.read.org',
  ORDER_MANAGE_ORG: 'order.manage.org',
  ORDER_ADMIN_ALL: 'order.admin.all',

  // Leads
  LEAD_READ_ASSIGNED: 'lead.read.assigned',
  LEAD_READ_ORG: 'lead.read.org',
  LEAD_MANAGE_ORG: 'lead.manage.org',
  LEAD_MANAGE_OWN: 'lead.manage.own',
  LEAD_CHAT_ASSIGNED: 'lead.chat.assigned',

  // Projects
  PROJECT_READ_ASSIGNED: 'project.read.assigned',
  PROJECT_MANAGE_OWN: 'project.manage.own',

  // Proposals
  PROPOSAL_READ_ASSIGNED: 'proposal.read.assigned',
  PROPOSAL_WRITE: 'proposal.write',
  PROPOSAL_SEND: 'proposal.send',

  // AR Features
  AR_SCAN: 'ar.scan',
  AR_VISUALIZE: 'ar.visualize',

  // Aesthete Engine / Teaching
  AESTHETE_TEACH: 'aesthete.teach',
  AESTHETE_VALIDATE: 'aesthete.validate',
  AESTHETE_ADMIN: 'aesthete.admin',

  // Analytics
  ANALYTICS_READ_OWN: 'analytics.read.own',
  ANALYTICS_READ_ORG: 'analytics.read.org',
  ANALYTICS_ADMIN_ALL: 'analytics.admin.all',

  // Media
  MEDIA_MANAGE_ORG: 'media.manage.org',

  // Inventory
  INVENTORY_MANAGE_ORG: 'inventory.manage.org',

  // Designer Programs
  DESIGNER_PROGRAM_MANAGE_ORG: 'designer_program.manage.org',
  TRADE_ACCOUNT_MANAGE_ORG: 'trade_account.manage.org',

  // A/B Testing
  AB_TEST_MANAGE: 'ab_test.manage',

  // Anomaly Detection
  ANOMALY_REVIEW: 'anomaly.review',

  // System Administration
  ADMIN_USERS: 'admin.users',
  ADMIN_SYSTEM: 'admin.system',
  ADMIN_AUDIT: 'admin.audit',
} as const;

export type PermissionName = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATION INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface OrganizationAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface OrganizationSettings {
  defaultMarkup?: number;
  autoAcceptLeads?: boolean;
  leadResponseHours?: number;
  brandColors?: { primary?: string; secondary?: string };
  [key: string]: unknown;
}

export interface Organization {
  id: UUID;
  type: OrganizationType;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: OrganizationAddress | null;
  settings: OrganizationSettings;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
  businessVerified: boolean;
  businessVerifiedAt: string | null;
  taxId: string | null;
  status: OrganizationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionsOverride {
  grant?: string[];
  revoke?: string[];
}

export interface OrganizationMember {
  id: UUID;
  userId: UUID;
  organizationId: UUID;
  role: MemberRole;
  permissionsOverride: PermissionsOverride | null;
  invitedBy: UUID | null;
  invitationToken: string | null;
  invitationExpiresAt: string | null;
  status: MemberStatus;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLE & PERMISSION INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface Role {
  id: UUID;
  name: string;
  displayName: string;
  description: string | null;
  domain: RoleDomain;
  isSystem: boolean;
  isAssignable: boolean;
  parentRoleId: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: UUID;
  name: string;
  resource: string;
  action: string;
  scope: string | null;
  description: string | null;
  createdAt: string;
}

export interface UserRole {
  id: UUID;
  userId: UUID;
  roleId: UUID;
  grantedAt: string;
  grantedBy: UUID | null;
}

export interface RolePermission {
  id: UUID;
  roleId: UUID;
  permissionId: UUID;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// OAUTH & API KEY INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface OAuthAccount {
  id: UUID;
  userId: UUID;
  provider: OAuthProvider;
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  providerEmail: string | null;
  providerName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: UUID;
  organizationId: UUID;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  rateLimit: number;
  environment: ApiKeyEnvironment;
  status: ApiKeyStatus;
  revokedAt: string | null;
  revokedBy: UUID | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  createdBy: UUID;
  expiresAt: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditLog {
  id: UUID;
  userId: UUID | null;
  organizationId: UUID | null;
  ipAddress: string | null;
  userAgent: string | null;
  action: string;
  resourceType: string;
  resourceId: UUID | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  status: AuditStatus;
  errorMessage: string | null;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION CONTEXT & RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

export interface PermissionContext {
  organizationId?: UUID;
  resourceOwnerId?: UUID;
}

export interface UserPermissionState {
  userId: UUID;
  roles: Role[];
  permissions: Set<string>;
  organizationMemberships: {
    organizationId: UUID;
    role: MemberRole;
    permissionsOverride: PermissionsOverride | null;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Organization with current user's membership info
 */
export interface OrganizationWithMembership extends Organization {
  membership: {
    id: UUID;
    role: MemberRole;
    status: MemberStatus;
    joinedAt: string | null;
  };
}

/**
 * Member with profile info for display
 */
export interface OrganizationMemberWithProfile extends OrganizationMember {
  profile: {
    id: UUID;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

/**
 * Role with its assigned permissions
 */
export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

/**
 * User role assignment with full role details
 */
export interface UserRoleWithDetails extends UserRole {
  role: Role;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH FLOW TYPES (Phase 2: Consumer Auth)
// ═══════════════════════════════════════════════════════════════════════════

export type AuthFlowType =
  | 'signup'
  | 'login'
  | 'recovery'
  | 'magiclink'
  | 'verification'
  | 'oauth_link';

/**
 * OAuth identity from Supabase
 */
export interface LinkedIdentity {
  id: string;
  provider: OAuthProvider | string;
  identityId: string;
  email?: string;
  createdAt: string;
  lastSignInAt: string | null;
}

/**
 * Auth callback result after OAuth or magic link
 */
export interface AuthCallbackResult {
  type: AuthFlowType;
  success: boolean;
  user?: {
    id: UUID;
    email: string;
    emailVerified: boolean;
  };
  error?: string;
  redirectTo?: string;
}

/**
 * Magic link request
 */
export interface MagicLinkRequest {
  email: string;
  redirectTo?: string;
  shouldCreateUser?: boolean;
}

/**
 * OAuth sign in options
 */
export interface OAuthSignInOptions {
  provider: OAuthProvider;
  redirectTo?: string;
  scopes?: string;
}

/**
 * Email verification status
 */
export interface EmailVerificationStatus {
  email: string;
  verified: boolean;
  verifiedAt: string | null;
  pendingSince: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MFA TYPES (Phase 3: Professional Auth)
// ═══════════════════════════════════════════════════════════════════════════

export type MfaFactorType = 'totp';
export type MfaFactorStatus = 'verified' | 'unverified';
export type AuthAssuranceLevel = 'aal1' | 'aal2';

/**
 * MFA factor (authenticator app)
 */
export interface MfaFactor {
  id: UUID;
  type: MfaFactorType;
  friendlyName: string | null;
  status: MfaFactorStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * MFA enrollment result
 */
export interface MfaEnrollmentResult {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

/**
 * MFA assurance level info
 */
export interface MfaAssuranceLevel {
  currentLevel: AuthAssuranceLevel | null;
  nextLevel: AuthAssuranceLevel | null;
  currentAuthenticationMethods: {
    method: string;
    timestamp: number;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT TYPES (Phase 3: Professional Auth)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * User session info
 */
export interface UserSessionInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | undefined;
  expiresIn: number | undefined;
  tokenType: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DESIGNER ONBOARDING TYPES (Phase 3: Professional Auth)
// ═══════════════════════════════════════════════════════════════════════════

export type DesignerApplicationStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected';

/**
 * Designer application for role approval
 */
export interface DesignerApplication {
  id: UUID;
  userId: UUID;
  status: DesignerApplicationStatus;
  businessName: string | null;
  portfolioUrl: string | null;
  yearsExperience: number | null;
  specialties: string[];
  certifications: string[];
  referralSource: string | null;
  additionalInfo: string | null;
  reviewedBy: UUID | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for submitting a designer application
 */
export interface DesignerApplicationInput {
  businessName?: string;
  portfolioUrl?: string;
  yearsExperience?: number;
  specialties?: string[];
  certifications?: string[];
  referralSource?: string;
  additionalInfo?: string;
}

/**
 * Designer application with user profile info
 */
export interface DesignerApplicationWithProfile extends DesignerApplication {
  profile: {
    id: UUID;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

/**
 * Designer application statistics
 */
export interface DesignerApplicationStats {
  total: number;
  pending: number;
  underReview: number;
  approved: number;
  rejected: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT TYPES (Phase 4: Enterprise)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Available API key scopes
 */
export const API_KEY_SCOPES = {
  // Product operations
  PRODUCTS_READ: 'products:read',
  PRODUCTS_WRITE: 'products:write',

  // Order operations
  ORDERS_READ: 'orders:read',
  ORDERS_WRITE: 'orders:write',

  // Inventory operations
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',

  // Analytics
  ANALYTICS_READ: 'analytics:read',

  // Webhooks
  WEBHOOKS_MANAGE: 'webhooks:manage',
} as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[keyof typeof API_KEY_SCOPES];

/**
 * Input for creating an API key
 */
export interface CreateApiKeyInput {
  organizationId: UUID;
  name: string;
  scopes: ApiKeyScope[];
  rateLimit?: number;
  environment?: ApiKeyEnvironment;
  expiresAt?: string;
}

/**
 * Result of creating an API key
 */
export interface CreateApiKeyResult {
  apiKey: ApiKey;
  rawKey: string; // Only returned once at creation time
}

/**
 * API key statistics for an organization
 */
export interface ApiKeyStats {
  total: number;
  active: number;
  revoked: number;
  live: number;
  test: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING TYPES (Phase 4: Enterprise)
// ═══════════════════════════════════════════════════════════════════════════

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_changed'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'api_key_created'
  | 'api_key_revoked'
  | 'permission_granted'
  | 'permission_revoked'
  | 'data_export'
  | 'account_deleted';

export type AuditResource =
  | 'user'
  | 'profile'
  | 'organization'
  | 'product'
  | 'project'
  | 'proposal'
  | 'api_key'
  | 'role'
  | 'permission'
  | 'room_scan'
  | 'lead'
  | 'client';

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: UUID;
  userId: UUID | null;
  organizationId: UUID | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: UUID | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/**
 * Audit log with user info
 */
export interface AuditLogWithUser extends AuditLogEntry {
  user: {
    id: UUID;
    email: string | null;
    displayName: string | null;
  } | null;
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  userId?: UUID;
  organizationId?: UUID;
  action?: AuditAction;
  resource?: AuditResource;
  resourceId?: UUID;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Input for creating an audit log
 */
export interface CreateAuditLogInput {
  action: AuditAction;
  resource: AuditResource;
  resourceId?: UUID;
  details?: Record<string, unknown>;
  organizationId?: UUID;
}

/**
 * Audit log statistics
 */
export interface AuditLogStats {
  total: number;
  byAction: Record<string, number>;
  byResource: Record<string, number>;
  byDay: Record<string, number>;
  period: {
    start: string;
    end: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GDPR COMPLIANCE TYPES (Phase 4: Enterprise)
// ═══════════════════════════════════════════════════════════════════════════

export type DataExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

/**
 * Data export request
 */
export interface DataExportRequest {
  id: UUID;
  userId: UUID;
  status: DataExportStatus;
  requestedAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
  expiresAt: string | null;
  error: string | null;
  includedData: string[];
}

export type AccountDeletionStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

/**
 * Account deletion request
 */
export interface AccountDeletionRequest {
  id: UUID;
  userId: UUID;
  status: AccountDeletionStatus;
  requestedAt: string;
  scheduledFor: string;
  completedAt: string | null;
  cancelledAt: string | null;
  reason: string | null;
}

/**
 * Full data export content
 */
export interface DataExportContent {
  profile: Record<string, unknown>;
  projects: Record<string, unknown>[];
  products: Record<string, unknown>[];
  proposals: Record<string, unknown>[];
  roomScans: Record<string, unknown>[];
  clients: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  earnings: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  exportedAt: string;
}

/**
 * Consent record
 */
export interface ConsentRecord {
  id: UUID;
  userId: UUID;
  consentType: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Consent types
 */
export const CONSENT_TYPES = {
  MARKETING_EMAIL: 'marketing_email',
  ANALYTICS: 'analytics',
  THIRD_PARTY_SHARING: 'third_party_sharing',
  PERSONALIZATION: 'personalization',
  TERMS_OF_SERVICE: 'terms_of_service',
  PRIVACY_POLICY: 'privacy_policy',
} as const;

export type ConsentType = (typeof CONSENT_TYPES)[keyof typeof CONSENT_TYPES];

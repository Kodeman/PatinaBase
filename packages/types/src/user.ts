import { UUID, Timestamps } from './common';

/**
 * User Status Enum
 * Represents the lifecycle status of a user account
 */
export type UserStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'BANNED' | 'DELETED';

/**
 * User Presence Status
 * Represents the real-time online/activity status of a user.
 * Used for status indicators in UI components (Avatar, UserStatusMenu).
 */
export type UserPresenceStatus = 'online' | 'offline' | 'busy' | 'away';

/**
 * User Presence State
 * Complete presence information for a user including metadata.
 */
export interface UserPresence {
  /** Current presence status */
  status: UserPresenceStatus;
  /** Timestamp of last user activity (Unix ms) */
  lastActiveAt: number;
  /** Whether status was manually set by user (vs auto-detected) */
  manuallySet: boolean;
  /** User ID (for multi-user presence scenarios) */
  userId?: string;
}

/**
 * User Status Menu Data
 * Standardized shape for user status menu components across portals.
 */
export interface UserStatusMenuData {
  /** User ID */
  id?: string;
  /** Display name */
  name: string;
  /** Email address */
  email?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** User's primary role */
  role?: UserRoleName;
  /** All assigned roles */
  roles?: UserRoleName[];
  /** Current presence status */
  presenceStatus?: UserPresenceStatus;
}

/**
 * User Role Names
 * Standard role identifiers used in the system
 */
export type UserRoleName = 'admin' | 'designer' | 'manufacturer' | 'customer';

/**
 * Designer Verification Status
 * Tracks the verification workflow for designer accounts
 */
export type DesignerVerificationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

/**
 * Privacy Operation Types
 * GDPR/CCPA compliance operation types
 */
export type PrivacyOpType = 'EXPORT' | 'DELETE';

/**
 * Privacy Operation Status
 */
export type PrivacyOpStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// ============================================================================
// Core User Types (Database Schema)
// ============================================================================

/**
 * Core User entity matching the database schema.
 * Represents the authenticated user record with OIDC integration.
 */
export interface User extends Timestamps {
  /** Unique user identifier */
  id: UUID;

  /** OIDC subject identifier from identity provider */
  sub: string;

  /** User email address (optional for some OAuth providers) */
  email?: string;

  /** Email verification status */
  emailVerified: boolean;

  /** Current user account status */
  status: UserStatus;

  /** Soft delete timestamp */
  deletedAt?: Date;

  /** Cryptographic tombstone for GDPR-compliant deletion */
  tombstoneId?: string;
}

/**
 * User Profile entity
 * Stores user-specific preferences and display information
 */
export interface UserProfile extends Timestamps {
  /** Profile ID */
  id: UUID;

  /** Associated user ID */
  userId: UUID;

  /** Display name shown in the UI */
  displayName?: string;

  /** Avatar image URL */
  avatarUrl?: string;

  /** User locale preference (e.g., 'en-US', 'es-ES') */
  locale?: string;

  /** User timezone (e.g., 'America/New_York', 'UTC') */
  timezone?: string;

  /** Notification preferences stored as JSON */
  notifPrefs?: Record<string, any>;
}

/**
 * Role entity
 * Defines available roles in the system
 */
export interface Role {
  /** Role ID */
  id: UUID;

  /** Role name (e.g., 'designer', 'admin') */
  name: string;

  /** Human-readable role description */
  description?: string;

  /** Whether this is a system role (cannot be deleted) */
  isSystem: boolean;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Permission entity
 * Defines granular permissions for role-based access control
 */
export interface Permission {
  /** Permission ID */
  id: UUID;

  /** Permission code (e.g., 'identity.user.read_self') */
  code: string;

  /** Resource identifier (e.g., 'identity.user') */
  resource: string;

  /** Action identifier (e.g., 'read_self') */
  action: string;

  /** Human-readable description */
  description?: string;

  /** Created timestamp */
  createdAt: Date;
}

/**
 * User-Role junction entity
 * Links users to their assigned roles
 */
export interface UserRole {
  /** User ID */
  userId: UUID;

  /** Role ID */
  roleId: UUID;

  /** ID of user who assigned this role */
  assignedBy?: UUID;

  /** Role assignment timestamp */
  createdAt: Date;

  /** Optional: populated role details */
  role?: Role;
}

/**
 * Role-Permission junction entity
 * Links roles to their permissions
 */
export interface RolePermission {
  /** Role ID */
  roleId: UUID;

  /** Permission ID */
  permissionId: UUID;

  /** Created timestamp */
  createdAt: Date;

  /** Optional: populated permission details */
  permission?: Permission;
}

/**
 * Designer Profile entity
 * Extended profile for designer verification and business information
 */
export interface DesignerProfile extends Timestamps {
  /** Profile ID */
  id: UUID;

  /** Associated user ID */
  userId: UUID;

  /** Business/company name */
  businessName?: string;

  /** Legal entity name */
  legalName?: string;

  /** Business website URL */
  website?: string;

  /** Portfolio URL */
  portfolioUrl?: string;

  /** Document references stored in object storage */
  documents?: any[];

  /** Professional license number */
  licenseNumber?: string;

  /** State/region where license is valid */
  licenseState?: string;

  /** Verification workflow status */
  status: DesignerVerificationStatus;

  /** Timestamp when verification was submitted */
  submittedAt?: Date;

  /** ID of admin who reviewed the verification */
  reviewerId?: UUID;

  /** Timestamp when verification was reviewed */
  reviewedAt?: Date;

  /** Notes from the reviewer */
  reviewNotes?: string;

  /** Verification expiration date (for re-verification) */
  expiresAt?: Date;
}

/**
 * User Consent record
 * Tracks GDPR/CCPA consent and policy acceptances
 */
export interface Consent extends Timestamps {
  /** Consent ID */
  id: UUID;

  /** User ID */
  userId: UUID;

  /** Policy type (e.g., 'terms', 'privacy', 'marketing') */
  policy: string;

  /** Policy version (e.g., '2024-01-01') */
  version: string;

  /** Timestamp when consent was given */
  acceptedAt: Date;

  /** Source of consent (e.g., 'web', 'ios', 'admin') */
  source?: string;

  /** IP address where consent was given */
  ipAddress?: string;

  /** Timestamp when consent was revoked */
  revokedAt?: Date;
}

/**
 * User Session record
 * Manages refresh token families and session tracking
 */
export interface Session extends Timestamps {
  /** Session ID */
  id: UUID;

  /** User ID */
  userId: UUID;

  /** Hash of refresh token JTI */
  refreshIdHash: string;

  /** Hash of IP address */
  ipHash?: string;

  /** Hash of user agent */
  uaHash?: string;

  /** Device metadata */
  deviceInfo?: Record<string, any>;

  /** Timestamp of last token use */
  lastUsedAt: Date;

  /** Session expiration timestamp */
  expiresAt: Date;

  /** Timestamp when session was revoked */
  revokedAt?: Date;

  /** Whether to revoke entire token family (reuse detection) */
  revokeFamily: boolean;
}

/**
 * Privacy Operation record
 * Tracks GDPR data export/deletion requests
 */
export interface PrivacyOperation extends Timestamps {
  /** Operation ID */
  id: UUID;

  /** User ID */
  userId: UUID;

  /** Operation type */
  type: PrivacyOpType;

  /** Current operation status */
  status: PrivacyOpStatus;

  /** When operation was requested */
  requestedAt: Date;

  /** When operation was completed */
  completedAt?: Date;

  /** Result URL (for exports) */
  resultUrl?: string;

  /** Result expiration date */
  expiresAt?: Date;

  /** Additional processing metadata */
  metadata?: Record<string, any>;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * API Response: User with Profile
 * Common response type that includes user's profile information
 */
export interface UserWithProfile extends Omit<User, 'sub' | 'deletedAt' | 'tombstoneId'> {
  /** User profile information */
  profile?: UserProfile;
}

/**
 * API Response: User with Roles
 * Response type that includes user's role assignments
 */
export interface UserWithRoles extends Omit<User, 'sub' | 'deletedAt' | 'tombstoneId'> {
  /** Assigned roles with details */
  roles?: Array<{
    name: string;
    description?: string;
  }>;
}

/**
 * API Response: Complete User Details
 * Full user information including profile, roles, and designer profile
 */
export interface UserDetail extends Omit<User, 'sub' | 'deletedAt' | 'tombstoneId'> {
  /** User profile information */
  profile?: UserProfile;

  /** Assigned roles */
  roles?: Array<{
    name: string;
    description?: string;
  }>;

  /** Designer verification profile (if user is a designer) */
  designerProfile?: DesignerProfile;
}

/**
 * Minimal User Info
 * Lightweight user representation for lists and references
 */
export interface UserInfo {
  /** User ID */
  id: UUID;

  /** User email */
  email?: string;

  /** Display name from profile */
  displayName?: string;

  /** Avatar URL from profile */
  avatarUrl?: string;

  /** Account status */
  status: UserStatus;
}

// ============================================================================
// Authentication & Authorization Types
// ============================================================================

/**
 * Authentication Tokens
 * JWT tokens returned after successful authentication
 */
export interface AuthTokens {
  /** JWT access token */
  accessToken: string;

  /** JWT refresh token */
  refreshToken: string;

  /** Token expiration time in seconds */
  expiresIn: number;
}

/**
 * Login Credentials
 * Username/password login request
 */
export interface LoginCredentials {
  /** User email address */
  email: string;

  /** User password */
  password: string;
}

/**
 * Registration Data
 * User registration request payload
 */
export interface RegisterData {
  /** User email address */
  email: string;

  /** User password */
  password: string;

  /** Display name */
  displayName?: string;

  /** Desired role (subject to validation) */
  role?: UserRoleName;

  /** User locale preference */
  locale?: string;

  /** User timezone */
  timezone?: string;
}

/**
 * Password Reset Request
 */
export interface PasswordResetRequest {
  /** Email address to send reset link */
  email: string;
}

/**
 * Password Reset Confirmation
 */
export interface PasswordResetConfirmation {
  /** Reset token from email */
  token: string;

  /** New password */
  newPassword: string;
}

/**
 * Email Verification
 */
export interface EmailVerification {
  /** Verification token from email */
  token: string;
}

// ============================================================================
// Update/Mutation Types
// ============================================================================

/**
 * User Profile Update
 * Fields that can be updated by the user themselves
 */
export interface UpdateUserProfile {
  /** Display name */
  displayName?: string;

  /** Avatar URL */
  avatarUrl?: string;

  /** Locale preference */
  locale?: string;

  /** Timezone */
  timezone?: string;

  /** Notification preferences */
  notifPrefs?: Record<string, any>;
}

/**
 * User Update (Admin)
 * Fields that can be updated by administrators
 */
export interface UpdateUser {
  /** Email address */
  email?: string;

  /** Email verification status */
  emailVerified?: boolean;

  /** Account status */
  status?: UserStatus;
}

/**
 * Designer Profile Update
 * Fields for updating designer verification information
 */
export interface UpdateDesignerProfile {
  /** Business name */
  businessName?: string;

  /** Legal name */
  legalName?: string;

  /** Website URL */
  website?: string;

  /** Portfolio URL */
  portfolioUrl?: string;

  /** License number */
  licenseNumber?: string;

  /** License state */
  licenseState?: string;
}

// ============================================================================
// Backward Compatibility (DEPRECATED)
// ============================================================================

/**
 * @deprecated Use UserWithProfile or UserDetail instead
 * Legacy User type with firstName/lastName fields for backward compatibility
 * This type maps the old schema to the new one
 *
 * Note: The new User type uses displayName in the profile, not firstName/lastName
 * Code using this type should be migrated to use UserWithProfile
 */
export interface LegacyUser extends Timestamps {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRoleName;
  status: 'active' | 'inactive' | 'pending' | 'archived';
  avatarUrl?: string;
  phoneNumber?: string;
}

/**
 * @deprecated Use RegisterData with displayName instead
 * Legacy registration data with firstName/lastName
 */
export interface LegacyRegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRoleName;
}

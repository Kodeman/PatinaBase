import { UUID, Address } from './common';
import { UserDetail, DesignerProfile, DesignerVerificationStatus } from './user';

/**
 * @deprecated Use DesignerProfile from user.ts instead.
 * This type is maintained for backward compatibility.
 *
 * Designer entity - extended profile information
 * Maps to the DesignerProfile model in the user-management service
 */
export interface Designer {
  /** Profile ID */
  id: UUID;

  /** Associated user ID */
  userId: UUID;

  /** Business/company name */
  businessName: string;

  /** Business description/bio */
  bio?: string;

  /** Portfolio URL */
  portfolioUrl?: string;

  /** Verification workflow status */
  verificationStatus: DesignerVerificationStatus;

  /** Business address */
  address?: Address;

  /** Design specialties (e.g., 'modern', 'traditional', 'minimalist') */
  specialties: string[];

  /** Years of professional experience */
  yearsOfExperience: number;

  /** Website URL */
  website?: string;

  /** Professional license number */
  licenseNumber?: string;

  /** State/region where license is valid */
  licenseState?: string;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Complete Designer Profile with User Information
 * Combines user account details with designer-specific information
 */
export interface DesignerWithUser extends UserDetail {
  /** Designer profile must be present */
  designerProfile: DesignerProfile;

  /** Design specialties */
  specialties?: string[];

  /** Years of experience */
  yearsOfExperience?: number;
}

/**
 * Designer Directory Listing
 * Lightweight representation for designer search/browse
 */
export interface DesignerListing {
  /** User ID */
  userId: UUID;

  /** Display name */
  displayName?: string;

  /** Avatar URL */
  avatarUrl?: string;

  /** Business name */
  businessName?: string;

  /** Short bio */
  bio?: string;

  /** Portfolio URL */
  portfolioUrl?: string;

  /** Verification status */
  verificationStatus: DesignerVerificationStatus;

  /** Design specialties */
  specialties: string[];

  /** Years of experience */
  yearsOfExperience: number;

  /** Location (city, state) */
  location?: string;
}

/**
 * Designer Verification Submission
 * Data required to submit a designer profile for verification
 */
export interface DesignerVerificationSubmission {
  /** Business/company name */
  businessName: string;

  /** Legal entity name */
  legalName?: string;

  /** Business website */
  website?: string;

  /** Portfolio URL */
  portfolioUrl?: string;

  /** Professional license number */
  licenseNumber?: string;

  /** License state/region */
  licenseState?: string;

  /** Document references (uploaded to object storage) */
  documentIds?: string[];
}

/**
 * Designer Verification Review
 * Admin review decision for designer verification
 */
export interface DesignerVerificationReview {
  /** Approval decision */
  approved: boolean;

  /** Review notes (required if rejected) */
  reviewNotes?: string;

  /** Verification expiration date (if approved) */
  expiresAt?: Date;
}

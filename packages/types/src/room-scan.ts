// ═══════════════════════════════════════════════════════════════════════════
// ROOM SCAN ASSOCIATION TYPES
// Types for sharing room scans between consumers and designers
// ═══════════════════════════════════════════════════════════════════════════

import type { UUID } from './common';

// ─── Enums ────────────────────────────────────────────────────────────────

export type AssociationType = 'explicit' | 'project_bound' | 'suggested';
export type AssociationStatus = 'pending' | 'active' | 'revoked' | 'expired';
export type AccessLevel = 'full' | 'preview' | 'measurements_only';

// ─── Core Association ─────────────────────────────────────────────────────

export interface RoomScanAssociation {
  id: UUID;
  scanId: UUID;
  consumerId: UUID;
  designerId: UUID;

  associationType: AssociationType;
  status: AssociationStatus;
  accessLevel: AccessLevel;

  expiresAt: string | null;
  sharedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;

  requestMessage: string | null;
  requestedAt: string | null;

  projectId: UUID | null;
  leadId: UUID | null;

  createdAt: string;
  updatedAt: string;
}

// ─── Associated Data (joined) ─────────────────────────────────────────────

export interface RoomScanSummary {
  id: UUID;
  name: string;
  roomType: string | null;
  thumbnailUrl: string | null;
  floorArea: number | null;
  status: string;
  dimensions: RoomDimensions | null;
}

export interface RoomDimensions {
  width: number;
  length: number;
  height: number;
  unit: 'ft' | 'm';
}

export interface DesignerSummary {
  id: UUID;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  businessName: string | null;
}

export interface ConsumerSummary {
  id: UUID;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}

// ─── Enriched Association (with joined data) ──────────────────────────────

export interface RoomScanAssociationWithDetails extends RoomScanAssociation {
  scan?: RoomScanSummary;
  designer?: DesignerSummary;
  consumer?: ConsumerSummary;
}

// ─── Request/Response Types ───────────────────────────────────────────────

export interface ShareScanRequest {
  scanId: UUID;
  designerId: UUID;
  accessLevel?: AccessLevel;
  expiresInDays?: number;
  projectId?: UUID;
  leadId?: UUID;
}

export interface ShareScanResponse {
  associationId: UUID;
  status: AssociationStatus;
  sharedAt: string;
  designer: DesignerSummary;
}

export interface RequestAccessRequest {
  scanId: UUID;
  consumerId: UUID;
  message?: string;
  leadId?: UUID;
}

export interface RequestAccessResponse {
  requestId: UUID;
  status: 'pending';
  requestedAt: string;
}

export interface RespondToAccessRequest {
  associationId: UUID;
  action: 'approve' | 'deny';
  accessLevel?: AccessLevel;
  expiresInDays?: number;
}

export interface RevokeAccessRequest {
  associationId: UUID;
  reason?: string;
}

// ─── Filter Types ─────────────────────────────────────────────────────────

export interface AssociationFilters {
  scanId?: UUID;
  consumerId?: UUID;
  designerId?: UUID;
  status?: AssociationStatus | AssociationStatus[];
  associationType?: AssociationType | AssociationType[];
  projectId?: UUID;
  leadId?: UUID;
  includeExpired?: boolean;
}

// ─── Viewer Types ─────────────────────────────────────────────────────────

export type NavigationMode = 'orbit' | 'walkthrough' | 'floorplan' | 'elevation';
export type ActiveTool = 'none' | 'measure' | 'annotate' | 'furniture';
export type AnnotationCategory = 'note' | 'question' | 'issue' | 'opportunity';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Measurement {
  id: UUID;
  startPoint: Vector3;
  endPoint: Vector3;
  distance: number; // meters
  distanceFormatted: {
    metric: string; // "3.42 m"
    imperial: string; // "11' 2\""
  };
  label: string | null;
  createdAt: string;
  createdBy: UUID;
}

export interface Annotation {
  id: UUID;
  position: Vector3;
  normal: Vector3; // Surface normal for pin orientation
  text: string;
  category: AnnotationCategory;
  createdAt: string;
  createdBy: UUID;
  resolvedAt: string | null;
}

export interface FurniturePlacement {
  id: UUID;
  productId: UUID;
  productName: string;
  position: Vector3;
  rotation: number; // Y-axis rotation in radians
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  createdAt: string;
  createdBy: UUID;
}

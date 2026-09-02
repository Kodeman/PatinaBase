import { NextResponse } from 'next/server';
import { serverError } from '@/lib/supabase-admin';
import type { Studio, StudioMember, StudioOwner } from '@/types';

// Not a route.ts — a plain helper module shared by every route under
// api/admin/studios/** (and api/users/[id]/studios). Next.js only allows a
// fixed export set (GET/POST/…) from a route.ts file, so shared mapping and
// error-code logic lives here instead.

export interface StudioOverviewRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscription_tier: string;
  subscription_expires_at: string | null;
  website: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  address: unknown;
  business_verified: boolean;
  business_verified_at: string | null;
  created_at: string;
  updated_at: string;
  owner_user_id: string | null;
  active_member_count: number;
  invited_count: number;
  project_count: number;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function mapProfileToOwner(profile: ProfileRow | null | undefined): StudioOwner | null {
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email ?? '',
    displayName: profile.display_name ?? undefined,
    avatarUrl: profile.avatar_url ?? undefined,
  };
}

export function mapStudioOverviewRow(
  row: StudioOverviewRow,
  ownerProfile: ProfileRow | null,
): Studio {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as Studio['status'],
    subscriptionTier: row.subscription_tier as Studio['subscriptionTier'],
    subscriptionExpiresAt: row.subscription_expires_at ?? undefined,
    website: row.website ?? undefined,
    description: row.description ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    address: (row.address as Record<string, unknown>) ?? null,
    businessVerified: row.business_verified,
    businessVerifiedAt: row.business_verified_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    owner: mapProfileToOwner(ownerProfile),
    memberCount: row.active_member_count ?? 0,
    invitedCount: row.invited_count ?? 0,
    projectCount: row.project_count ?? 0,
  };
}

export interface MemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
  job_title: string | null;
  staff_role: string | null;
  invited_by: string | null;
  invitation_expires_at: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapMemberRow(row: MemberRow, profile: ProfileRow | null): StudioMember {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role as StudioMember['role'],
    status: row.status as StudioMember['status'],
    jobTitle: row.job_title ?? undefined,
    staffRole: row.staff_role ?? undefined,
    invitedBy: row.invited_by ?? undefined,
    invitationExpiresAt: row.invitation_expires_at ?? undefined,
    joinedAt: row.joined_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    profile: mapProfileToOwner(profile),
  };
}

/**
 * Map a known RAISE code from the 00556 admin_* RPCs (and
 * workspace-member-invite's error codes) to an HTTP status. Postgres RAISE
 * messages arrive verbatim as error.message, so this matches on substring.
 */
export function mapStudioRpcError(message: string) {
  const code = (message ?? '').trim();
  const map: Record<string, number> = {
    user_not_found: 404,
    invalid_name: 400,
    studio_not_found: 404,
    member_not_found: 404,
    organization_not_active: 409,
    already_member: 409,
    use_transfer_ownership: 400,
    job_title_too_long: 400,
    target_not_active_member: 400,
    owner_remove_requires_transfer: 409,
    already_owner: 409,
    invalid_role: 400,
    invalid_status_transition: 409,
    actor_not_platform_admin: 403,
    service_role_only: 403,
    forbidden: 403,
  };
  const matchedKey = Object.keys(map).find((key) => code.includes(key));
  if (!matchedKey) {
    console.error('[studios] unmapped RPC error:', message);
    return serverError('Studio operation failed');
  }
  return NextResponse.json({ error: message }, { status: map[matchedKey] });
}

/**
 * Parse a pagination-ish query param. Returns `fallback` when the value is
 * missing or not a number (parseInt('abc') is NaN, which silently poisoned
 * Math.max/Math.min arithmetic), then clamps into [min, max].
 */
export function toInt(
  value: string | null | undefined,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  const parsed = parseInt(value ?? '', 10);
  const n = Number.isNaN(parsed) ? fallback : parsed;
  return Math.min(max, Math.max(min, n));
}

/**
 * Strip the characters PostgREST treats as filter syntax before a user-supplied
 * term is interpolated into `.or(...)` / `.ilike(...)`. Without this a comma or
 * paren in the search box injects extra filter clauses.
 */
export function sanitizeFilterTerm(term: string): string {
  return term.replace(/[,()\\*%]/g, '');
}

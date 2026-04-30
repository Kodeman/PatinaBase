import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
export type DeletionStatus = 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';

export interface ExportRequestRow {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  status: ExportStatus;
  includedData: string[];
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  approvedAt: string | null;
  approvedByEmail: string | null;
}

export interface DeletionRequestRow {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  status: DeletionStatus;
  reason: string | null;
  requestedAt: string;
  scheduledFor: string;
  cancelledAt: string | null;
  approvedAt: string | null;
  approvedByEmail: string | null;
}

export interface ConsentRow {
  id: string;
  userId: string;
  userEmail: string | null;
  consentType: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  consentVersion: string | null;
  updatedAt: string;
}

export interface PrivacyOverviewResponse {
  exports: ExportRequestRow[];
  deletions: DeletionRequestRow[];
  consents: ConsentRow[];
  totals: {
    openExports: number;
    openDeletions: number;
    overdueExports: number;
    revokedConsents30d: number;
  };
}

const SLA_HOURS = 30 * 24; // GDPR default — 30 days

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(10, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
  );

  try {
    // Fetch the three queues. user_id on these tables references auth.users
    // (NOT profiles), so PostgREST can't embed profiles by default — we batch-
    // resolve profiles in a follow-up query and merge in JS.
    const [exportsRes, deletionsRes, consentsRes] = await Promise.all([
      adminClient
        .from('data_export_requests')
        .select(
          `
          id, user_id, status, included_data, requested_at, completed_at, expires_at,
          approved_at,
          approver:approved_by ( email )
          `,
        )
        .order('requested_at', { ascending: false })
        .limit(limit),
      adminClient
        .from('account_deletion_requests')
        .select(
          `
          id, user_id, status, reason, requested_at, scheduled_for, cancelled_at,
          approved_at,
          approver:approved_by ( email )
          `,
        )
        .order('requested_at', { ascending: false })
        .limit(limit),
      adminClient
        .from('consent_records')
        .select(
          `
          id, user_id, consent_type, granted, granted_at, revoked_at,
          consent_version, updated_at
          `,
        )
        .order('updated_at', { ascending: false })
        .limit(limit),
    ]);

    if (exportsRes.error) throw exportsRes.error;
    if (deletionsRes.error) throw deletionsRes.error;
    if (consentsRes.error) throw consentsRes.error;

    type RawExport = {
      id: string;
      user_id: string;
      status: ExportStatus;
      included_data: string[] | null;
      requested_at: string;
      completed_at: string | null;
      expires_at: string | null;
      approved_at: string | null;
      approver: { email: string | null } | null;
    };

    type RawDeletion = {
      id: string;
      user_id: string;
      status: DeletionStatus;
      reason: string | null;
      requested_at: string;
      scheduled_for: string;
      cancelled_at: string | null;
      approved_at: string | null;
      approver: { email: string | null } | null;
    };

    type RawConsent = {
      id: string;
      user_id: string;
      consent_type: string;
      granted: boolean;
      granted_at: string | null;
      revoked_at: string | null;
      consent_version: string | null;
      updated_at: string;
    };

    const rawExports = (exportsRes.data ?? []) as unknown as RawExport[];
    const rawDeletions = (deletionsRes.data ?? []) as unknown as RawDeletion[];
    const rawConsents = (consentsRes.data ?? []) as unknown as RawConsent[];

    // Collect all subject user_ids and resolve profile email/display_name
    // in a single query. profiles.id has a 1:1 FK to auth.users.id, so this
    // is safe.
    const subjectUserIds = Array.from(
      new Set([
        ...rawExports.map((r) => r.user_id),
        ...rawDeletions.map((r) => r.user_id),
        ...rawConsents.map((r) => r.user_id),
      ]),
    ).filter(Boolean);

    type ProfileRow = { id: string; email: string | null; display_name: string | null };
    const profileById = new Map<string, ProfileRow>();
    if (subjectUserIds.length > 0) {
      const { data: profiles, error: profilesErr } = await adminClient
        .from('profiles')
        .select('id, email, display_name')
        .in('id', subjectUserIds);
      if (profilesErr) throw profilesErr;
      for (const p of (profiles ?? []) as ProfileRow[]) {
        profileById.set(p.id, p);
      }
    }

    const exports: ExportRequestRow[] = rawExports.map((r) => {
      const profile = profileById.get(r.user_id);
      return {
        id: r.id,
        userId: r.user_id,
        userEmail: profile?.email ?? null,
        userName: profile?.display_name ?? null,
        status: r.status,
        includedData: r.included_data ?? [],
        requestedAt: r.requested_at,
        completedAt: r.completed_at,
        expiresAt: r.expires_at,
        approvedAt: r.approved_at,
        approvedByEmail: r.approver?.email ?? null,
      };
    });

    const deletions: DeletionRequestRow[] = rawDeletions.map((r) => {
      const profile = profileById.get(r.user_id);
      return {
        id: r.id,
        userId: r.user_id,
        userEmail: profile?.email ?? null,
        userName: profile?.display_name ?? null,
        status: r.status,
        reason: r.reason,
        requestedAt: r.requested_at,
        scheduledFor: r.scheduled_for,
        cancelledAt: r.cancelled_at,
        approvedAt: r.approved_at,
        approvedByEmail: r.approver?.email ?? null,
      };
    });

    const consents: ConsentRow[] = rawConsents.map((r) => {
      const profile = profileById.get(r.user_id);
      return {
        id: r.id,
        userId: r.user_id,
        userEmail: profile?.email ?? null,
        consentType: r.consent_type,
        granted: r.granted,
        grantedAt: r.granted_at,
        revokedAt: r.revoked_at,
        consentVersion: r.consent_version,
        updatedAt: r.updated_at,
      };
    });

    const now = Date.now();
    const slaMs = SLA_HOURS * 60 * 60 * 1000;
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const totals: PrivacyOverviewResponse['totals'] = {
      openExports: exports.filter((e) => e.status === 'pending' || e.status === 'processing')
        .length,
      openDeletions: deletions.filter(
        (d) => d.status === 'pending' || d.status === 'processing',
      ).length,
      overdueExports: exports.filter(
        (e) =>
          (e.status === 'pending' || e.status === 'processing') &&
          now - new Date(e.requestedAt).getTime() > slaMs,
      ).length,
      revokedConsents30d: consents.filter(
        (c) => c.revokedAt !== null && c.revokedAt > thirtyDaysAgo,
      ).length,
    };

    const payload: PrivacyOverviewResponse = { exports, deletions, consents, totals };
    return NextResponse.json({ data: payload });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load privacy data');
  }
}

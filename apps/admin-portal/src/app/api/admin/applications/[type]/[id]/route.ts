import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  notFound,
  serverError,
  createAuditLog,
  getClientIp,
} from '@/lib/supabase-admin';
import {
  APPLICATION_TABLES,
  APPLICATION_STATUSES,
  getApplication,
  reconcileActiveStatus,
  type ApplicationType,
  type ApplicationStatus,
} from '@/lib/applications';
import { sendApplicationEmail } from '@/lib/application-emails';
import { EMAIL_PRESETS, AUTO_PRESET_BY_STATUS } from '@/components/applications/email-presets';

function parseType(raw: string): ApplicationType | null {
  if (raw === 'designers') return 'designer';
  if (raw === 'makers') return 'maker';
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const { type: rawType, id } = await params;
  const type = parseType(rawType);
  if (!type) return badRequest('Unknown application type');

  try {
    const raw = await getApplication(adminClient, type, id);
    const application = await reconcileActiveStatus(adminClient, type, raw);
    const { data: comms } = await (adminClient as any)
      .from('application_communications')
      .select('*')
      .eq('application_type', type)
      .eq('application_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({
      data: { application, communications: comms ?? [] },
    });
  } catch (err: any) {
    if (err.message?.includes('No rows')) return notFound('Application not found');
    return serverError(err.message ?? 'Failed to load application');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: adminUser, adminClient } = auth;

  const { type: rawType, id } = await params;
  const type = parseType(rawType);
  if (!type) return badRequest('Unknown application type');

  let body: { status?: ApplicationStatus; reviewNotes?: string; suppressEmail?: boolean };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    if (!APPLICATION_STATUSES.includes(body.status)) {
      return badRequest(`Invalid status: ${body.status}`);
    }
    updates.status = body.status;
    updates.reviewed_by = adminUser.id;
    updates.reviewed_at = new Date().toISOString();
  }

  if (body.reviewNotes !== undefined) {
    updates.review_notes = body.reviewNotes;
  }

  if (Object.keys(updates).length === 1) {
    return badRequest('No changes supplied');
  }

  const table = APPLICATION_TABLES[type];

  try {
    const { data: previous } = await (adminClient as any)
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    const { data, error } = await (adminClient as any)
      .from(table)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return serverError(error.message);

    await createAuditLog(adminClient, {
      userId: adminUser.id,
      action: `application.${type}.update`,
      resourceType: 'application',
      resourceId: id,
      oldValues: (previous as Record<string, unknown>) ?? undefined,
      newValues: updates,
      ipAddress: getClientIp(request),
    });

    // Auto-fire status-change email (approved/waitlisted/rejected) unless suppressed
    // or the status didn't actually change from its previous value.
    const newStatus = body.status;
    const previousStatus = (previous as any)?.status;
    const autoTriggerable =
      newStatus === 'approved' || newStatus === 'waitlisted' || newStatus === 'rejected';
    if (
      autoTriggerable &&
      previousStatus !== newStatus &&
      !body.suppressEmail
    ) {
      const presetSlug = AUTO_PRESET_BY_STATUS[newStatus]?.[type];
      const preset = EMAIL_PRESETS[type].find((p) => p.slug === presetSlug);
      if (preset) {
        try {
          const sendResult = await sendApplicationEmail(adminClient, {
            type,
            application: data as any,
            subject: preset.subject,
            html: preset.html,
            presetSlug: preset.slug,
            source: 'status_change',
            sentBy: adminUser.id,
          });
          await createAuditLog(adminClient, {
            userId: adminUser.id,
            action: `application.${type}.auto_email`,
            resourceType: 'application',
            resourceId: id,
            newValues: {
              presetSlug: preset.slug,
              transitionedTo: newStatus,
              providerId: sendResult.providerId,
              status: sendResult.success ? 'sent' : 'failed',
              error: sendResult.error,
            },
            ipAddress: getClientIp(request),
            status: sendResult.success ? 'success' : 'failure',
          });
        } catch (err: any) {
          console.error('[PATCH application] auto-email failed', err?.message ?? err);
        }
      }
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to update application');
  }
}

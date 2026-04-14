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
  type ApplicationType,
  type ApplicationStatus,
} from '@/lib/applications';

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
    const application = await getApplication(adminClient, type, id);
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

  let body: { status?: ApplicationStatus; reviewNotes?: string };
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

    return NextResponse.json({ data });
  } catch (err: any) {
    return serverError(err.message ?? 'Failed to update application');
  }
}

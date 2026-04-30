import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  notFound,
  serverError,
} from '@/lib/supabase-admin';
import { VendorPipeline } from '@patina/types';

type CoworkTask = VendorPipeline.CoworkTask;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  const { id } = await params;

  try {
    const { data, error } = await db
      .from('cowork_tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound(`Task ${id} not found`);
    return NextResponse.json({ data: data as CoworkTask });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load task');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (body.action !== 'cancel') {
    return badRequest('Only { action: "cancel" } is supported from the admin portal');
  }

  try {
    const { data, error } = await db
      .from('cowork_tasks')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return badRequest('Task can only be cancelled while pending');
    }
    return NextResponse.json({ data: data as CoworkTask });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to cancel task');
  }
}

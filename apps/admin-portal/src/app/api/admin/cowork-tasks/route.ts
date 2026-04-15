import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  badRequest,
  serverError,
} from '@/lib/supabase-admin';
import { VendorPipeline } from '@patina/types';

type CoworkTask = VendorPipeline.CoworkTask;
type CoworkTaskType = VendorPipeline.CoworkTaskType;

// TODO: remove LooseClient once generated Supabase types include pipeline tables.
type LooseClient = { from: (table: string) => any };

const VALID_TASK_TYPES: CoworkTaskType[] = [
  'prospect_scan',
  'auto_score',
  'generate_brief',
  'draft_email',
  'ingest_feed',
  'normalize_data',
  'image_audit',
  'feed_sync',
  'rescore',
];

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;
  const vendorId = url.searchParams.get('vendor_id') ?? undefined;
  const taskType = url.searchParams.get('task_type') ?? undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10))) : 100;

  try {
    let query = db.from('cowork_tasks').select('*');
    if (status) query = query.eq('status', status);
    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (taskType) query = query.eq('task_type', taskType);
    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data as CoworkTask[] });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to list tasks');
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const db = auth.adminClient as unknown as LooseClient;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const taskType = body.task_type as CoworkTaskType;
  if (!VALID_TASK_TYPES.includes(taskType)) {
    return badRequest(`Invalid task_type: ${taskType}`);
  }

  try {
    const { data, error } = await db
      .from('cowork_tasks')
      .insert({
        task_type: taskType,
        vendor_id: (body.vendor_id as string | null | undefined) ?? null,
        input_payload: body.input_payload ?? {},
        status: 'pending',
        is_recurring: Boolean(body.is_recurring),
        cron_expression: (body.cron_expression as string | null | undefined) ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ data: data as CoworkTask }, { status: 201 });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to enqueue task');
  }
}

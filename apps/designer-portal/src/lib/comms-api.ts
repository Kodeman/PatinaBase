import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Designer-scoped comms API helpers (People Room — Outreach).
//
// Ported from apps/admin-portal/src/lib/admin-api.ts. The structural difference:
// these handlers run inside the *designer* portal, where every authenticated
// user is a designer and there is no admin-domain role gate. Auth is reduced to
// "valid Bearer token → a user", and every read/mutate path self-scopes the row
// to `created_by = user.id` (see the route handlers).
//
// The service-role key NEVER leaves this server module — it is read from the
// server-only `SUPABASE_SERVICE_ROLE_KEY` env var inside getServiceClient().
// ─────────────────────────────────────────────────────────────────────────────

export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Designer-auth check. Verifies the Bearer token via supabase.auth.getUser(token)
 * and returns the user. Unlike admin-api's verifyAdmin(), there is NO admin-domain
 * role gate — any authenticated user is a designer in this portal.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function verifyDesigner(supabase: any, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return user;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status: 400 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

// Re-export the shared zod validation schemas reused by the comms route handlers,
// so the routes import them from one place (mirrors the admin-portal layout where
// handlers import these from @patina/shared/validation directly).
export {
  campaignCreateSchema,
  campaignUpdateSchema,
  emailTemplateCreateSchema,
  emailTemplateUpdateSchema,
  audienceSegmentCreateSchema,
  audienceSegmentUpdateSchema,
  segmentRulesSchema,
} from '@patina/shared/validation';

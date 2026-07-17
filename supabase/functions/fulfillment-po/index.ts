// fulfillment-po — PO Composer render/transmit worker (S3, spec §5.3).
//
// Server-to-server only: the admin-portal composer routes
// (/api/admin/fulfillment/pos/[poId]/{preview,transmit}) call this with a
// service-role Bearer. verify_jwt = false (config.toml) — the gateway does NOT
// verify (sidesteps the local HS256/ES256 status-vs-vault key mismatch); this
// shell REQUIRES role == 'service_role' in-code (parse-room-scan idiom). A
// normal authenticated user can never reach the render/transmit path.
//
// Modes (body { po_id, mode, method?, reference?, actor? }):
//   preview          → 200 application/pdf (the paper the composer previews)
//   send             → 200 JSON, emailed from orders@ + po.transmitted logged
//   mark_transmitted → 200 JSON, archived + po.transmitted logged (portal/csv)
//
// All logic lives in core.ts (pure + injectable) so the Deno test drives it
// without this shell. This file only wires the service-role client + deps.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { runFulfillmentPo, type FulfillmentPoRequest } from './core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Kong-internal host (http://kong:8000) → browser-reachable public host, so
// signed URLs come back usable (po-send idiom; set PUBLIC_SUPABASE_URL locally).
const PUBLIC_SUPABASE_URL = Deno.env.get('PUBLIC_SUPABASE_URL') ?? 'https://api.patina.cloud';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Decode (without verifying — verify_jwt is off) the `role` claim of a Bearer
 *  JWT. The service-role key is a JWT carrying {"role":"service_role"}. */
function decodeJwtRole(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const pad = parts[1].length % 4 === 0 ? '' : '='.repeat(4 - (parts[1].length % 4));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/') + pad));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── auth: require role == service_role (verify_jwt is off — checked here) ──
  if (decodeJwtRole(req.headers.get('Authorization')) !== 'service_role') {
    return json({ error: 'forbidden: service_role required' }, 403);
  }

  let body: FulfillmentPoRequest;
  try {
    body = (await req.json()) as FulfillmentPoRequest;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!body?.po_id || !body?.mode) return json({ error: 'po_id and mode are required' }, 400);
  if (!['preview', 'send', 'mark_transmitted'].includes(body.mode)) {
    return json({ error: `unknown mode: ${body.mode}` }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const result = await runFulfillmentPo(
      {
        supabase,
        sendEmail: sendCompliantEmail,
        now: () => new Date(),
        internalSupabaseUrl: SUPABASE_URL,
        publicSupabaseUrl: PUBLIC_SUPABASE_URL,
      },
      body,
    );

    if (result.kind === 'pdf') {
      return new Response(result.bytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${result.poNumber}.pdf"`,
        },
      });
    }
    return json(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Map the loader/validation cases to 4xx; everything else is a 500.
    if (message.startsWith('po_not_found') || message.startsWith('order_not_found')) {
      return json({ error: message }, 404);
    }
    if (message.startsWith('no_recipient')) return json({ error: message }, 422);
    console.error('fulfillment-po:', message);
    return json({ error: message }, 500);
  }
});

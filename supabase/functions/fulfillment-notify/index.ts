// fulfillment-notify — the client-notification dispatcher (S4, spec §6).
//
// Service-role-invoked ONLY: the admin-portal API routes
// (apps/admin-portal/src/app/api/admin/fulfillment/notifications/{draft,
// [id]/send}/route.ts) call this via `adminClient.functions.invoke(...)`,
// which sends the service-role key as the bearer — verify_jwt stays at the
// platform default (true), matching every other service-role-invoked BOH
// function (fulfillment-intake, apns-send). No browser calls this directly.
//
// Body: { action: 'draft', order_id, transition, context, actor? }
//     -> { note_id, order_id, transition, template_key, subject, drafted_body }
//   | { action: 'send', notification_id, edited_body?, actor? }
//     -> { notification_id, transition, email, push, edited }
//
// Both actions delegate entirely to core.ts, which is where the actual
// render/RPC/send orchestration lives (kept separate so the leak test and the
// send-flow tests import pure, dependency-injected functions — no live stack,
// no network — mirroring fulfillment-intake's core.ts/index.ts split).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  draftClientNote,
  sendClientNote,
  type NotifyDeps,
} from './core.ts';
import { sendCompliantEmail } from '../_shared/send-email.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const functionsUrl = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/apns-send`;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const deps: NotifyDeps = {
    supabase: supabase as unknown as NotifyDeps['supabase'],
    sendEmail: async (opts) => {
      const res = await sendCompliantEmail(supabase, {
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        from: opts.from,
        category: 'operational',
        userId: opts.userId,
        templateId: opts.templateId,
        metadata: opts.metadata,
      });
      return { success: res.success, id: res.id, error: res.error };
    },
    sendPush: async (opts) => {
      try {
        const res = await fetch(functionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify(opts),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { skipped: `apns_http_${res.status}` };
        return body as { sent?: number; failed?: number; skipped?: string };
      } catch (err) {
        return { skipped: `apns_fetch_error: ${String(err)}` };
      }
    },
  };

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  try {
    if (payload.action === 'draft') {
      const result = await draftClientNote(deps, {
        order_id: payload.order_id as string,
        transition: payload.transition as never,
        context: (payload.context ?? {}) as never,
        actor: payload.actor as string | undefined,
      });
      return json({ success: true, ...result });
    }
    if (payload.action === 'send') {
      const result = await sendClientNote(deps, {
        notification_id: payload.notification_id as string,
        edited_body: payload.edited_body as string | undefined,
        actor: payload.actor as string | undefined,
      });
      return json({ success: true, ...result });
    }
    return json({ error: "action must be 'draft' or 'send'" }, 400);
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

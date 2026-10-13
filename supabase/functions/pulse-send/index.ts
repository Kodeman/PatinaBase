import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import { canSendOutbound } from "../_shared/outbound-can-send.ts";
import { pulseEmailOptions } from "./lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const pulseId = typeof body?.pulseId === "string" ? body.pulseId : "";
    const html = typeof body?.html === "string" ? body.html : "";
    const subject = typeof body?.subject === "string" ? body.subject : "";
    if (!pulseId || !html || !subject) return json({ error: "invalid_request" }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: pulse } = await admin
      .from("weekly_pulses")
      .select("id, project_id, status, body, subject")
      .eq("id", pulseId)
      .single();
    if (!pulse) return json({ error: "pulse_not_found" }, 404);
    if (pulse.status !== "sent" || !pulse.body) return json({ error: "pulse_not_sent" }, 409);

    const { data: project } = await admin
      .from("projects")
      .select("id, name, client_id, studio_id")
      .eq("id", pulse.project_id)
      .single();
    if (!project) return json({ error: "project_not_found" }, 404);
    if (!(await canSendOutbound(admin, { organization_id: project.studio_id, project_id: project.id }, user.id))) {
      return json({ error: "not_authorized" }, 403);
    }

    const { data: client } = await admin
      .from("profiles")
      .select("id, email")
      .eq("id", project.client_id)
      .single();
    const recipient = client?.email?.trim();
    if (!recipient) return json({ ok: true, emailSent: false, reason: "no_recipient" });

    const expectedSubject = pulse.subject?.trim() || `This week on ${project.name}`;
    if (subject !== expectedSubject) return json({ error: "invalid_subject" }, 400);

    const result = await sendCompliantEmail(
      admin,
      pulseEmailOptions({
        senderUserId: user.id,
        recipientUserId: client?.id ?? null,
        pulseId,
        recipient,
        subject,
        html,
        organizationId: project.studio_id,
      }),
    );
    return json({ ok: true, emailSent: result.success, id: result.id, error: result.error });
  } catch (error) {
    console.error("[pulse-send] failed", error);
    return json({ error: "internal_error" }, 500);
  }
});

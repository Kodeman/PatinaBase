// Comms Mute Handler — Edge Function
// Spec: docs/prds/in-app-messaging-prd.md §11
//
// Endpoint: GET /functions/v1/comms-mute?t=<token>
//
// Mutes a thread for a specific recipient based on a signed token embedded
// in the email "Mute this conversation" link. Idempotent: applying mute to
// an already-muted participant returns success without changing state.
//
// The token is a JWT HS256 with purpose='comms_mute', signed by the same
// secret used for unsubscribe links. See _shared/comms-token.ts.
//
// CRITICAL: this endpoint deliberately bypasses Supabase Auth — the JWT is
// the auth. The recipient is identified by the token's `sub` claim. We use
// the service-role client to apply the mute, with manual checks that:
//   - the token is valid (issuer, purpose, signature, not expired)
//   - the participant row exists and matches the token's recipient
//   - the request isn't a CSRF (GET-only is fine for an idempotent action,
//     and the token can't be forged without the secret)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCommsMuteToken } from "../_shared/comms-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUCCESS_HTML = (threadId: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Conversation muted — Patina</title>
  <style>
    body { font-family: -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif;
           background:#FAF7F2; color:#2C2926; margin:0; padding:48px 24px;
           min-height:100vh; box-sizing:border-box; display:flex;
           align-items:center; justify-content:center; }
    .card { max-width: 520px; background:#FFFFFF; border:1px solid #EEE6DB;
            border-radius:12px; padding:32px 32px 28px; box-shadow:0 1px 3px rgba(0,0,0,.04);}
    h1 { font-family: "Playfair Display", Georgia, serif; font-weight:600;
         color:#2C2926; font-size:22px; margin:0 0 12px; }
    p { color:#4A453F; line-height:1.55; font-size:15px; margin:0 0 16px; }
    .meta { color:#7A736C; font-size:13px; margin-top:16px; }
    a { color:#A3927C; text-decoration:underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Conversation muted</h1>
    <p>You won't receive email about new messages in this conversation.
       It will still appear in your inbox, and any unread badge updates
       will continue.</p>
    <p>Changed your mind? Open the conversation in the
       <a href="https://app.patina.cloud/portal/messages/${threadId}">designer portal</a>
       or
       <a href="https://client.patina.cloud/messages/${threadId}">client portal</a>
       and tap the bell to unmute.</p>
    <p class="meta">Thread ID: <code>${threadId}</code></p>
  </div>
</body>
</html>`;

const ERROR_HTML = (msg: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Mute link error — Patina</title>
  <style>
    body { font-family: -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif;
           background:#FAF7F2; color:#2C2926; margin:0; padding:48px 24px;
           min-height:100vh; box-sizing:border-box; display:flex;
           align-items:center; justify-content:center; }
    .card { max-width: 520px; background:#FFFFFF; border:1px solid #E5D2BB;
            border-radius:12px; padding:32px 32px 28px; box-shadow:0 1px 3px rgba(0,0,0,.04);}
    h1 { font-family: "Playfair Display", Georgia, serif; font-weight:600;
         color:#A55B3F; font-size:22px; margin:0 0 12px; }
    p { color:#4A453F; line-height:1.55; font-size:15px; margin:0 0 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>That link didn't work</h1>
    <p>${msg}</p>
    <p>You can still mute the conversation from inside Patina by tapping
       the bell icon at the top of the thread.</p>
  </div>
</body>
</html>`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!token) {
    return new Response(ERROR_HTML("This link is missing its security token."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let payload: { threadId: string; profileId: string };
  try {
    payload = await verifyCommsMuteToken(token);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "verification failed";
    return new Response(
      ERROR_HTML(
        `We couldn't verify this link. It may have expired or been generated for a different account. (${reason})`,
      ),
      {
        status: 401,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(ERROR_HTML("Server is not configured to handle this."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Confirm the participant row actually exists for this user+thread.
  const { data: participant, error: pErr } = await supabase
    .from("comms_thread_participants")
    .select("muted_at, left_at")
    .eq("thread_id", payload.threadId)
    .eq("profile_id", payload.profileId)
    .maybeSingle();

  if (pErr) {
    return new Response(ERROR_HTML("We couldn't load your participant record."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (!participant) {
    return new Response(
      ERROR_HTML(
        "You're no longer a participant in this conversation, so there's nothing to mute.",
      ),
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
  if (participant.left_at) {
    return new Response(
      ERROR_HTML(
        "You've already left this conversation. No further emails will be sent.",
      ),
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  // Idempotent: only update if not already muted.
  if (!participant.muted_at) {
    const { error: updErr } = await supabase
      .from("comms_thread_participants")
      .update({ muted_at: new Date().toISOString() })
      .eq("thread_id", payload.threadId)
      .eq("profile_id", payload.profileId);
    if (updErr) {
      return new Response(
        ERROR_HTML("We couldn't apply the mute. Please try again."),
        {
          status: 500,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      );
    }
  }

  return new Response(SUCCESS_HTML(payload.threadId), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

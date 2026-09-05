// apns-send — APNs pusher for the client iOS app (Arrival Arc, R106/I66).
//
// Service-role-invoked ONLY: callers are SQL RPCs going through
// public.invoke_edge_function (accept_design_request 00330, ceremony_complete
// 00331, refresh_offered_slots 00334), which sends the service-role Bearer.
// verify_jwt stays at the platform default (true) — no config stanza needed,
// no CORS (no browser ever calls this).
//
// Input:  { user_id?, tokens?, title, body, entity_type?, entity_id?,
//           notification_log_id? }
// Reads device_push_tokens for user_id unless explicit tokens are passed, and
// — when a user_id is given — counts that user's unread in_app notification_log
// rows, collapsed on the entity key the bell collapses on, into aps.badge, so
// the springboard number moves while the app is backgrounded (R5, ruled at the
// Wave 1 close) and says what the bell behind it says.
// Per token: POST to api.push.apple.com or api.sandbox.push.apple.com — host
// chosen PER TOKEN from its registered environment column (I66: never inferred
// from build config). Provider auth: ES256 JWT via jose (importPKCS8 + kid
// header), cached ~40 minutes in module scope (Apple allows 20–60 min).
//
// Failure posture:
//  - Missing APNS_* secrets → log + 200 {skipped:'apns_not_configured'}. This
//    path fires from live RPCs BEFORE Kody provisions the key — it must never
//    error the caller.
//  - 410/BadDeviceToken/Unregistered → delete the dead token row.
//  - notification_log_id given → update that row's status ('delivered' on ≥1
//    success, else 'failed') + provider_id (apns-id header), mirroring
//    _shared/send-email.ts's log-update pattern.
//
// Secrets (names only): APNS_AUTH_KEY (.p8 contents — full PEM or a bare
// base64 body; normalizePkcs8Pem in core.ts handles either shape, since
// jose's importPKCS8 hard-requires BEGIN/END PRIVATE KEY framing), APNS_KEY_ID,
// APNS_TEAM_ID, APNS_TOPIC.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "https://deno.land/x/jose@v5.2.0/index.ts";
import {
  apnsDeviceUrl,
  type ApnsSendInput,
  bearerRole,
  buildApnsPayload,
  collapsedBadgeCount,
  isDeadTokenResponse,
  normalizePkcs8Pem,
  type ResolvedToken,
  resolveTokens,
  type UnreadBadgeRow,
} from "./core.ts";

/** The bell's own page size (`NotificationsAPIClient.list(limit: 50)`). */
const BADGE_WINDOW = 50;

/**
 * The springboard number (R5): how many in-app notifications this person has
 * not opened. `notification_log` holds one in_app row and one push row per
 * event (00534's notify_client_attention writes the pair), so the count is
 * taken over the in_app leg alone — the same leg the bell reads — or the icon
 * would say twice what the app does.
 *
 * The rows themselves are read rather than counted in the database, because the
 * bell does not count rows either: it collapses them on the entity key first
 * (`collapsedBadgeCount`), and producers other than 00534 leave two unread
 * in_app rows on one entity. The window matches the bell's own
 * (`NotificationsAPIClient.list(limit: 50)`), so neither surface can see rows
 * the other cannot.
 *
 * Returns undefined on any failure, and the payload then omits `aps.badge`
 * rather than sending 0 and clearing a number that is still true.
 */
async function unreadInAppBadge(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<number | undefined> {
  if (!userId) return undefined;
  try {
    const { data, error } = await supabase
      .from("notification_log")
      .select("metadata")
      .eq("user_id", userId)
      .eq("channel", "in_app")
      .is("opened_at", null)
      .order("created_at", { ascending: false })
      .limit(BADGE_WINDOW);
    if (error || !Array.isArray(data)) {
      console.warn("[apns-send] badge count unavailable", error ?? null);
      return undefined;
    }
    return collapsedBadgeCount(data as UnreadBadgeRow[]);
  } catch (err) {
    console.warn("[apns-send] badge count threw", err);
    return undefined;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Provider JWT cache (module scope survives across invocations) ───────────
const JWT_TTL_MS = 40 * 60 * 1000;
let cachedJwt: { value: string; mintedAt: number } | null = null;

async function providerJwt(
  authKeyPem: string,
  keyId: string,
  teamId: string,
): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.mintedAt < JWT_TTL_MS) {
    return cachedJwt.value;
  }
  // Secrets stores vary: full PEM (maybe with literal \n escapes) or a bare
  // base64 body with the BEGIN/END framing stripped — normalize either shape
  // into what importPKCS8 requires.
  const pem = normalizePkcs8Pem(authKeyPem);
  const key = await importPKCS8(pem, "ES256");
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .sign(key);
  cachedJwt = { value, mintedAt: Date.now() };
  return value;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (bearerRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "service_role_required" }, 403);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let input: ApnsSendInput;
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  if (!input.title || !input.body) {
    return json({ error: "Missing required fields: title, body" }, 400);
  }
  if (!input.user_id && !input.tokens?.length) {
    return json({ error: "Provide user_id or tokens" }, 400);
  }

  // ── Not configured yet → skip cleanly (never error the SQL caller) ────────
  const authKey = Deno.env.get("APNS_AUTH_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const topic = Deno.env.get("APNS_TOPIC");
  if (!authKey || !keyId || !teamId || !topic) {
    console.log(
      "[apns-send] APNS_* secrets not configured; skipping push",
      {
        user_id: input.user_id ?? null,
        log_id: input.notification_log_id ?? null,
      },
    );
    return json({ skipped: "apns_not_configured" });
  }

  try {
    // ── Resolve target tokens (+ their per-token environments) ──────────────
    let targets: ResolvedToken[] = [];
    let unresolved: string[] = [];

    if (input.tokens?.length) {
      const plain = input.tokens.map((
        t,
      ) => (typeof t === "string" ? t : t.token));
      const { data: rows } = await supabase
        .from("device_push_tokens")
        .select("token, environment")
        .in("token", plain);
      ({ resolved: targets, unresolved } = resolveTokens(
        input.tokens,
        rows ?? [],
      ));
    } else {
      const { data: rows, error } = await supabase
        .from("device_push_tokens")
        .select("token, environment")
        .eq("user_id", input.user_id!);
      if (error) throw error;
      ({ resolved: targets, unresolved } = resolveTokens(
        (rows ?? []).map((r) => r.token),
        rows ?? [],
      ));
    }

    if (unresolved.length) {
      console.warn(
        "[apns-send] dropping tokens with unknown environment",
        unresolved,
      );
    }
    if (!targets.length) {
      return json({ sent: 0, skipped: "no_tokens" });
    }

    const jwt = await providerJwt(authKey, keyId, teamId);
    const badge = await unreadInAppBadge(supabase, input.user_id);
    const payload = JSON.stringify(buildApnsPayload(input, badge));

    let successes = 0;
    let providerId: string | undefined;
    const failures: Array<{ token: string; status: number; reason?: string }> =
      [];

    for (const target of targets) {
      try {
        const res = await fetch(apnsDeviceUrl(target), {
          method: "POST",
          headers: {
            authorization: `bearer ${jwt}`,
            "apns-topic": topic,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "content-type": "application/json",
          },
          body: payload,
        });

        if (res.ok) {
          successes++;
          providerId = res.headers.get("apns-id") ?? providerId;
          // drain the (empty) body so the connection can be reused
          await res.text();
          continue;
        }

        let reason: string | undefined;
        try {
          reason = (await res.json())?.reason;
        } catch {
          /* non-JSON error body */
        }
        failures.push({ token: target.token, status: res.status, reason });

        if (isDeadTokenResponse(res.status, reason)) {
          await supabase.from("device_push_tokens").delete().eq(
            "token",
            target.token,
          );
          console.log("[apns-send] deleted dead token", {
            status: res.status,
            reason: reason ?? null,
          });
        }
      } catch (err) {
        failures.push({
          token: target.token,
          status: 0,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Mirror send-email.ts: stamp the notification_log row ────────────────
    if (input.notification_log_id) {
      if (successes > 0) {
        await supabase
          .from("notification_log")
          .update({
            status: "delivered",
            provider_id: providerId,
            sent_at: new Date().toISOString(),
          })
          .eq("id", input.notification_log_id);
      } else {
        await supabase
          .from("notification_log")
          .update({
            status: "failed",
            error: `apns: 0/${targets.length} accepted — ${
              failures.map((f) =>
                `${f.status}${f.reason ? `:${f.reason}` : ""}`
              ).join(", ")
            }`.slice(0, 500),
          })
          .eq("id", input.notification_log_id);
      }
    }

    return json({
      sent: successes,
      failed: failures.length,
      provider_id: providerId ?? null,
      failures,
    });
  } catch (err) {
    console.error("[apns-send] error", err);
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

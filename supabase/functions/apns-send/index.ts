// apns-send — APNs pusher for the client iOS app (Arrival Arc, R106/I66).
//
// Service-role-invoked ONLY: callers are SQL RPCs going through
// public.invoke_edge_function (accept_design_request 00330, ceremony_complete
// 00331, refresh_offered_slots 00334), which sends the service-role Bearer.
// verify_jwt stays at the platform default (true) — no config stanza needed,
// no CORS (no browser ever calls this).
//
// Input:  { user_id?, tokens?, title, body, entity_type?, entity_id?,
//           notification_log_id?, audience? }
// Reads device_push_tokens for user_id unless explicit tokens are passed,
// keeping only the audience's app (00668): `audience` when the caller names
// it, else derived from entity_type (core.ts `audienceFor`, default 'app').
// Each token is sent under its own app's topic. When a user_id is given and a
// Patina token is among the targets, it counts that user's unopened in_app
// notification_log rows, collapsed on the entity key the bell collapses on and
// under the bell's own read rule (one read row reads its whole entity), so
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
//    error the caller. The same skip answers when the only targets belong to
//    an app with no topic configured.
//  - 410/BadDeviceToken/Unregistered → delete the dead token row.
//  - notification_log_id given → update that row's status ('delivered' on ≥1
//    success, else 'failed') + provider_id (apns-id header), mirroring
//    _shared/send-email.ts's log-update pattern.
//
// Secrets (names only): APNS_AUTH_KEY (.p8 contents — full PEM or a bare
// base64 body; normalizePkcs8Pem in core.ts handles either shape, since
// jose's importPKCS8 hard-requires BEGIN/END PRIVATE KEY framing), APNS_KEY_ID,
// APNS_TEAM_ID, APNS_TOPIC_APP (falls back to APNS_TOPIC), APNS_TOPIC_FIELD.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "https://deno.land/x/jose@v5.2.0/index.ts";
import {
  type AddressedToken,
  addressTokens,
  apnsDeviceUrl,
  type ApnsSendInput,
  apnsTopicFor,
  badgeForApp,
  type BadgeRow,
  bearerRole,
  buildApnsHeaders,
  buildApnsPayload,
  collapsedBadgeCount,
  isDeadTokenResponse,
  normalizePkcs8Pem,
  pickProjectThreadId,
  projectTableFor,
  PUSH_APP,
  type PushApp,
  pushAudience,
  tokensForAudience,
} from "./core.ts";

/** The bell's own page size (`NotificationsAPIClient.list(limit: 50)`). */
const BADGE_WINDOW = 50;

/** The bell's own status filter (`NotificationsAPIClient.visibleStatusFilter`):
 *  failed and suppressed rows never reach the feed, so they must never reach
 *  the icon either. */
const BADGE_VISIBLE_STATUSES = [
  "queued",
  "sending",
  "delivered",
  "unconfirmed",
  "opened",
  "clicked",
];

/**
 * The springboard number (R5): how many in-app notifications this person has
 * not opened. `notification_log` holds one in_app row and one push row per
 * event (00534's notify_client_attention writes the pair), so the count is
 * taken over the in_app leg alone — the same leg the bell reads — or the icon
 * would say twice what the app does.
 *
 * The rows themselves are read rather than counted in the database, because the
 * bell does not count rows either: it collapses them on the entity key
 * (`collapsedBadgeCount`), and producers other than 00534 leave two in_app rows
 * on one entity. Read rows come back too, unfiltered: the bell's rule is that
 * one read row of an entity marks that entity read, so the unread ones alone
 * cannot answer the question. Window, order and visible statuses match the
 * bell's own list, so neither surface can see rows the other cannot.
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
      .select("metadata, opened_at, status")
      .eq("user_id", userId)
      .eq("channel", "in_app")
      .in("status", BADGE_VISIBLE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(BADGE_WINDOW);
    if (error || !Array.isArray(data)) {
      console.warn("[apns-send] badge count unavailable", error ?? null);
      return undefined;
    }
    return collapsedBadgeCount(data as BadgeRow[]);
  } catch (err) {
    console.warn("[apns-send] badge count threw", err);
    return undefined;
  }
}

/**
 * The conversation the lock screen's "Ask a question" opens (P-22, ruled
 * mid-Wave-2): the project thread belonging to the entity this notice names.
 *
 * Two hops, both by id: entity → its project, project → its 'project' thread.
 * A project with no thread, or somehow more than one, yields nothing and the
 * action falls back to the entity's own screen — which is the whole point of
 * the ruling, since the alternative is landing her in an inbox with nothing
 * selected.
 *
 * Returns null on any failure. A thread that cannot be resolved must never
 * cost the homeowner the notification itself.
 */
async function resolveProjectThreadId(
  supabase: SupabaseClient,
  input: ApnsSendInput,
): Promise<string | null> {
  const table = projectTableFor(input.entity_type);
  const entityId = input.entity_id;
  if (!table || typeof entityId !== "string" || !entityId) return null;
  try {
    const { data: entity, error: entityError } = await supabase
      .from(table)
      .select("project_id")
      .eq("id", entityId)
      .maybeSingle();
    if (entityError) {
      console.warn("[apns-send] entity project lookup failed", entityError);
      return null;
    }
    const projectId = (entity as { project_id?: string | null } | null)
      ?.project_id;
    if (typeof projectId !== "string" || !projectId) return null;

    // Two rows are enough to know there is no single thread to open.
    const { data: threads, error: threadError } = await supabase
      .from("comms_threads")
      .select("id")
      .eq("project_id", projectId)
      .eq("kind", "project")
      .limit(2);
    if (threadError) {
      console.warn("[apns-send] project thread lookup failed", threadError);
      return null;
    }
    return pickProjectThreadId(threads as Array<{ id?: unknown }> | null);
  } catch (err) {
    console.warn("[apns-send] project thread lookup threw", err);
    return null;
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
  const audience = pushAudience(input);
  if (!audience) {
    return json({ error: "audience must be 'app' or 'field'" }, 400);
  }

  // ── Not configured yet → skip cleanly (never error the SQL caller) ────────
  const authKey = Deno.env.get("APNS_AUTH_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const env = (name: string) => Deno.env.get(name);
  const topics: Record<PushApp, string | null> = {
    "cloud.patina.app": apnsTopicFor("cloud.patina.app", env),
    "cloud.patina.field": apnsTopicFor("cloud.patina.field", env),
  };
  if (
    !authKey || !keyId || !teamId ||
    (!topics[PUSH_APP.app] && !topics[PUSH_APP.field])
  ) {
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
    // ── Resolve target tokens (+ their per-token environment and app) ───────
    let addressed: AddressedToken[] = [];
    let unresolved: string[] = [];

    if (input.tokens?.length) {
      const plain = input.tokens.map((
        t,
      ) => (typeof t === "string" ? t : t.token));
      const { data: rows } = await supabase
        .from("device_push_tokens")
        .select("token, environment, app")
        .in("token", plain);
      ({ resolved: addressed, unresolved } = addressTokens(
        input.tokens,
        rows ?? [],
        audience,
      ));
    } else {
      const { data: rows, error } = await supabase
        .from("device_push_tokens")
        .select("token, environment, app")
        .eq("user_id", input.user_id!);
      if (error) throw error;
      const own = tokensForAudience(rows ?? [], audience);
      ({ resolved: addressed, unresolved } = addressTokens(
        own.map((r) => r.token),
        own,
        audience,
      ));
    }

    if (unresolved.length) {
      console.warn(
        "[apns-send] dropping tokens with unknown environment or app",
        unresolved,
      );
    }
    const targets = addressed.filter((t) => topics[t.app]);
    if (targets.length < addressed.length) {
      console.warn("[apns-send] dropping tokens whose app has no topic", {
        apps: [
          ...new Set(addressed.filter((t) => !topics[t.app]).map((t) => t.app)),
        ],
        log_id: input.notification_log_id ?? null,
      });
    }
    if (!targets.length) {
      return addressed.length
        ? json({ sent: 0, skipped: "apns_not_configured" })
        : json({ sent: 0, skipped: "no_tokens" });
    }

    const jwt = await providerJwt(authKey, keyId, teamId);
    const badge = targets.some((t) => t.app === PUSH_APP.app)
      ? await unreadInAppBadge(supabase, input.user_id)
      : undefined;
    const conversationThreadId = await resolveProjectThreadId(supabase, input);
    const payloadFor = (app: PushApp): string =>
      JSON.stringify(
        buildApnsPayload(input, badgeForApp(app, badge), conversationThreadId),
      );

    let successes = 0;
    let providerId: string | undefined;
    const failures: Array<{ token: string; status: number; reason?: string }> =
      [];

    for (const target of targets) {
      try {
        const res = await fetch(apnsDeviceUrl(target), {
          method: "POST",
          headers: buildApnsHeaders(input, topics[target.app]!, jwt),
          body: payloadFor(target.app),
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

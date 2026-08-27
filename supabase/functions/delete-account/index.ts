// Supabase Edge Function: delete-account
//
// SP-20. Deletes the CALLER's account: their auth user, and with it every row
// that cascades from profiles.id (00013:12) — rooms, saved_items,
// notification_log, device_push_tokens, style profiles, companion history, the
// roster row. The designer's proposals, projects, invoices and decisions
// survive with the person detached (purge_client_account, migration 00536).
//
// A DESIGNER calling this is refused before anything is written (review B-D3):
// verify_jwt admits any Strata token, a designer-portal session included, and
// designer-owned rows cascade from profiles(id) rather than detaching.
//
// verify_jwt stays at the platform default TRUE, and is stated explicitly in
// config.toml: the gateway must never be relaxed here. The function then
// re-reads the caller through a client carrying their own Authorization header
// (the invoice-send pattern), and only then constructs the service-role client.
// The id acted on is the token's own — the request body is never read.
//
// Secrets (names only): SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY — all platform-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createDeleteAccountHandler,
  type DeleteAccountGateway,
} from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const gateway: DeleteAccountGateway = {
  async authenticate(req) {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return null;
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await callerClient.auth.getUser();
    if (error || !data?.user?.id) return null;
    return { userId: data.user.id };
  },

  // Three independent reads, any one of which makes this a designer account.
  // profiles.is_designer is the flag; the two counts catch a studio member
  // whose flag was never set. A read error THROWS, so the handler fails closed.
  async isDesigner(userId) {
    const db = admin();
    const profile = await db
      .from("profiles")
      .select("is_designer")
      .eq("id", userId)
      .maybeSingle();
    if (profile.error) throw new Error(profile.error.message);
    if (profile.data?.is_designer) return true;

    for (const table of ["projects", "designer_clients"] as const) {
      const owned = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("designer_id", userId);
      if (owned.error) throw new Error(owned.error.message);
      if ((owned.count ?? 0) > 0) return true;
    }
    return false;
  },

  async purge(userId) {
    const { data, error } = await admin().rpc("purge_client_account", {
      p_user_id: userId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, purgeId: typeof data === "string" ? data : undefined };
  },

  async deleteAuthUser(userId) {
    const { error } = await admin().auth.admin.deleteUser(userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async markPurgeComplete(purgeId) {
    const { error } = await admin().rpc("mark_client_account_purge_complete", {
      p_purge_id: purgeId,
    });
    if (error) throw new Error(error.message);
  },
};

Deno.serve(createDeleteAccountHandler(gateway));

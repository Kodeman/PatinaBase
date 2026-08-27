// Supabase Edge Function: delete-account
//
// SP-20. Deletes the CALLER's account: their auth user, and with it every row
// that cascades from profiles.id (00013:12) — rooms, saved_items,
// notification_log, device_push_tokens, style profiles, companion history, the
// roster row. The designer's proposals, projects, invoices and decisions
// survive with the person detached (purge_client_account, migration 00536).
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

  async purge(userId) {
    const { error } = await admin().rpc("purge_client_account", {
      p_user_id: userId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async deleteAuthUser(userId) {
    const { error } = await admin().auth.admin.deleteUser(userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },
};

Deno.serve(createDeleteAccountHandler(gateway));

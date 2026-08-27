// delete-account — the testable core.
//
// SP-20 / App Store Review Guideline 5.1.1(v): an app that lets a user create
// an account must let them close it. The order below is the whole design:
//
//   1. authenticate the CALLER. The id deleted is the token's own, never
//      anything from the request body — this endpoint must not be a way to
//      delete someone else.
//   2. purge_client_account (00536) detaches the person from the designer's
//      documents and clears the road the auth delete would otherwise be
//      blocked on.
//   3. delete the auth user. profiles.id cascades from auth.users, and every
//      client-owned table cascades from profiles.
//
// If (2) fails, (3) MUST NOT run: half-detached rows under a live account are
// recoverable, an auth user deleted over rows that would not detach is not.
//
// Nothing a provider or Postgres says is ever returned to the caller — the app
// renders these codes in Patina's voice and never vendor text (C5).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export interface DeleteAccountGateway {
  /** Resolves the caller from the request's own Authorization header. */
  authenticate(req: Request): Promise<{ userId: string } | null>;
  /** rpc purge_client_account (00536), service-role. */
  purge(userId: string): Promise<{ ok: boolean; error?: string }>;
  /** auth.admin.deleteUser, service-role. */
  deleteAuthUser(userId: string): Promise<{ ok: boolean; error?: string }>;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createDeleteAccountHandler(
  gateway: DeleteAccountGateway,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const caller = await gateway.authenticate(req);
    if (!caller?.userId) {
      return json({ error: "unauthorized" }, 401);
    }

    const purged = await gateway.purge(caller.userId);
    if (!purged.ok) {
      console.error("delete-account: purge failed", purged.error);
      return json({ error: "purge_failed" }, 500);
    }

    const deleted = await gateway.deleteAuthUser(caller.userId);
    if (!deleted.ok) {
      console.error("delete-account: auth delete failed", deleted.error);
      return json({ error: "auth_delete_failed" }, 500);
    }

    return json({ ok: true, userId: caller.userId });
  };
}

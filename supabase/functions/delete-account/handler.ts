// delete-account — the testable core.
//
// SP-20 / App Store Review Guideline 5.1.1(v): an app that lets a user create
// an account must let them close it. The order below is the whole design:
//
//   1. authenticate the CALLER. The id deleted is the token's own, never
//      anything from the request body — this endpoint must not be a way to
//      delete someone else.
//   2. refuse a DESIGNER outright (review B-D3). verify_jwt only proves the
//      caller holds a Strata token, and a designer-portal session is one.
//      Designer-owned rows CASCADE from profiles(id) rather than detaching
//      (00014:74,124,301,349; 00020:18), so the same call that closes a
//      homeowner's account would permanently delete a designer's projects,
//      proposals, invoices and roster. purge_client_account refuses on its own
//      too; this is the half that answers before anything is written.
//   3. purge_client_account (00538) tombstones the PII on the caller's
//      profiles row, deletes what they owned — rooms, scans, saved items, the
//      threads they started, notifications, push tokens, companion history —
//      and journals it into client_account_purges. It writes nothing to the
//      designer's proposals, projects, invoices, decisions or roster: those
//      keep naming the tombstone (W1b ruling 2).
//   4. DETACH the auth user — a SOFT admin delete. GoTrue obfuscates the email
//      and phone, empties the user metadata and the identity, nulls the
//      password and drops every session, so the login is destroyed and the
//      address is freed. A HARD delete would cascade profiles.id away
//      (00013:12) and take the tombstone — and with it the client identity on
//      every document the designer keeps.
//   5. stamp the journal row complete.
//
// If (3) fails, (4) MUST NOT run: nothing has been detached, and the caller
// retries.
//
// If (4) fails, the anonymization has ALREADY COMMITTED and the login is still
// live — the two are separate transactions and cannot be one, because the auth
// detach goes through GoTrue's admin API. That state is recoverable only
// because step 3 journalled it: client_account_purges holds the row with
// auth_deleted_at NULL and every detached id under `detached`. The response
// carries that row's id so an operator can either retry the delete or
// re-attach. Without the journal the ids would be gone for good, which is what
// an earlier cut of this comment wrongly called "recoverable".
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
  /** True when the caller owns designer-side rows that would cascade. */
  isDesigner(userId: string): Promise<boolean>;
  /** rpc purge_client_account (00538), service-role. Returns the journal id. */
  purge(
    userId: string,
  ): Promise<{ ok: boolean; purgeId?: string; error?: string }>;
  /**
   * auth.admin.deleteUser, service-role. `soft` MUST be true: the tombstone
   * profile the designer's records point at cascades from auth.users, so a
   * hard delete would erase it.
   */
  deleteAuthUser(
    userId: string,
    soft: boolean,
  ): Promise<{ ok: boolean; error?: string }>;
  /** rpc mark_client_account_purge_complete (00536), service-role. */
  markPurgeComplete(purgeId: string): Promise<void>;
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

    // Fail CLOSED: an unreadable designer check refuses the deletion rather
    // than risking a designer's book of business on a transient error.
    let designer: boolean;
    try {
      designer = await gateway.isDesigner(caller.userId);
    } catch (err) {
      console.error("delete-account: designer check threw", err);
      return json({ error: "designer_check_failed" }, 500);
    }
    if (designer) {
      console.error("delete-account: refused a designer caller", caller.userId);
      return json({ error: "designer_account" }, 403);
    }

    const purged = await gateway.purge(caller.userId);
    if (!purged.ok) {
      console.error("delete-account: purge failed", purged.error);
      return json({ error: "purge_failed" }, 500);
    }

    const deleted = await gateway.deleteAuthUser(caller.userId, true);
    if (!deleted.ok) {
      // The detachment is committed and the account is still live. Say so with
      // the journal id, and never silently report success.
      console.error(
        "delete-account: auth delete failed AFTER a committed purge",
        { purgeId: purged.purgeId ?? null, error: deleted.error },
      );
      return json(
        { error: "auth_delete_failed", purgeRef: purged.purgeId ?? null },
        500,
      );
    }

    if (purged.purgeId) {
      try {
        await gateway.markPurgeComplete(purged.purgeId);
      } catch (err) {
        // The account is gone; an unstamped journal row is a reconciliation
        // nuisance, not a failure to report to the person who just left.
        console.error("delete-account: journal stamp failed", err);
      }
    }

    return json({ ok: true, userId: caller.userId });
  };
}

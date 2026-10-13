import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isServiceCaller } from "../board-deck-import-resolve/auth.ts";

export interface ResolvedCaller {
  userId: string | null;
  studioId: string | null;
  service: boolean;
  /** The studio RPC errored, so studioId is unknown rather than absent. */
  studioLookupFailed?: true;
}

export async function resolveCaller(
  req: Request,
  admin: SupabaseClient,
): Promise<ResolvedCaller> {
  const authorization = req.headers.get("authorization");
  if (isServiceCaller(authorization, Deno.env.get("SUPABASE_SECRET_KEYS"))) {
    return { service: true, userId: null, studioId: null };
  }

  const bearer = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return { service: false, userId: null, studioId: null };
  const { data, error } = await admin.auth.getUser(bearer);
  const userId = error ? null : data.user?.id ?? null;
  if (!userId) return { service: false, userId: null, studioId: null };

  const { data: studioId, error: studioError } = await admin.rpc(
    "_primary_studio_for",
    { p_user: userId },
  );
  if (studioError) {
    return { service: false, userId, studioId: null, studioLookupFailed: true };
  }
  return { service: false, userId, studioId: studioId as string | null };
}

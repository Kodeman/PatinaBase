// Which caller is this: the service role (pg_cron dispatch) or a designer?
//
// The service role arrives in two shapes during Supabase's key-format
// migration (see client-invite/lib.ts isServiceRoleCaller):
//   • the legacy HS256 JWT, which the verify_jwt=true gateway has already
//     verified, so its decoded role claim is read at face value and the token
//     is never string-compared against anything;
//   • a new `sb_secret_…` key, which is opaque, so it is admitted only by a
//     timing-safe match against one of the SUPABASE_SECRET_KEYS entries.

import { isServiceRoleCaller } from "../client-invite/lib.ts";
import { bearerRole } from "../board-asset-cleanup/core.ts";

const SECRET_KEY_PREFIX = "sb_secret_";

export function isServiceCaller(authorization: string | null, secretKeys: string | null | undefined): boolean {
  if (bearerRole(authorization) === "service_role") return true;
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith(SECRET_KEY_PREFIX)) return false;
  // No service-role key and no project ref: only the SUPABASE_SECRET_KEYS arm.
  return isServiceRoleCaller(`Bearer ${token}`, "", secretKeys, null);
}

import { rc7OwnedStackSql } from "./owned-stack";

/**
 * RC-7 E8 write guard. The lane's storage uploads and DB writes refuse the
 * shared local stack (API 54321, DB 54322) outright: unlike round8Stack(),
 * ROUND8_ALLOW_SHARED_DB does not override this, so a shared DB that happens
 * to carry an owned marker still cannot take E8 writes. Returns the
 * rc7OwnedStackSql() prefix (loopback host + rc7_owned.stack marker check).
 */
export function e8OwnedStackSql(purpose: string): string {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const db = new URL(process.env.SUPABASE_DB_URL ?? "");
  const apiPort = api.port || (api.protocol === "https:" ? "443" : "80");
  const dbPort = db.port || "5432";
  if (
    ["54321", "54322"].includes(apiPort) ||
    ["54321", "54322"].includes(dbPort)
  )
    throw new Error(
      `${purpose}: RC-7 E8 never writes to the shared local stack (API :${apiPort}, DB :${dbPort}), ` +
        "whatever ROUND8_ALLOW_SHARED_DB says; refusing.",
    );
  return rc7OwnedStackSql(purpose);
}

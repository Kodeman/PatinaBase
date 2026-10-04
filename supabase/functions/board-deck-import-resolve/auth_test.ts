// deno test --allow-all --config supabase/functions/deno.json supabase/functions/board-deck-import-resolve/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isServiceCaller } from "./auth.ts";

function jwt(claims: Record<string, unknown>): string {
  const b64 = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.signature`;
}

const SECRET = "sb_secret_abcdefghijklmnop";

Deno.test("F9: an sb_secret_ bearer matching SUPABASE_SECRET_KEYS is the service caller", () => {
  assert(isServiceCaller(`Bearer ${SECRET}`, JSON.stringify({ default: SECRET })));
  assert(isServiceCaller(`Bearer ${SECRET}`, `sb_secret_other,${SECRET}`));
});

Deno.test("F9: an sb_secret_ bearer matching no listed key is not the service caller", () => {
  assertEquals(isServiceCaller(`Bearer ${SECRET}x`, JSON.stringify({ default: SECRET })), false);
  assertEquals(isServiceCaller(`Bearer ${SECRET}`, null), false);
  assertEquals(isServiceCaller(`Bearer ${SECRET}`, ""), false);
});

Deno.test("F9: the legacy JWT is admitted by its role claim, never by string comparison", () => {
  const legacy = jwt({ role: "service_role", iss: "supabase" });
  assert(isServiceCaller(`Bearer ${legacy}`, null));
  // A designer JWT is not admitted even when the env (wrongly) lists it.
  const designer = jwt({ role: "authenticated", sub: "u" });
  assertEquals(isServiceCaller(`Bearer ${designer}`, JSON.stringify({ default: designer })), false);
});

Deno.test("F9: no header, or a non-bearer header, is not the service caller", () => {
  assertEquals(isServiceCaller(null, JSON.stringify({ default: SECRET })), false);
  assertEquals(isServiceCaller("", JSON.stringify({ default: SECRET })), false);
  assertEquals(isServiceCaller(`Basic ${SECRET}`, JSON.stringify({ default: SECRET })), false);
});

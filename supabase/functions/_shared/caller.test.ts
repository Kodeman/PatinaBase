import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveCaller } from "./caller.ts";

function adminStub(userId: string | null, studioId: string | null) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const admin = {
    auth: {
      getUser: async (token: string) => {
        calls.push({ name: "getUser", args: token });
        return {
          data: { user: userId ? { id: userId } : null },
          error: userId ? null : new Error("unauthorized"),
        };
      },
    },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: studioId, error: null };
    },
  };
  return { admin: admin as never, calls };
}

Deno.test("resolveCaller verifies user then resolves the primary studio", async () => {
  const { admin, calls } = adminStub("user-1", "studio-1");
  const req = new Request("https://example.test", {
    headers: { authorization: "Bearer user-token" },
  });
  assertEquals(await resolveCaller(req, admin), {
    userId: "user-1",
    studioId: "studio-1",
    service: false,
  });
  assertEquals(calls, [
    { name: "getUser", args: "user-token" },
    { name: "_primary_studio_for", args: { p_user: "user-1" } },
  ]);
});

Deno.test("resolveCaller returns null identity when authentication fails", async () => {
  const { admin, calls } = adminStub(null, null);
  const req = new Request("https://example.test", {
    headers: { authorization: "Bearer invalid" },
  });
  assertEquals(await resolveCaller(req, admin), {
    userId: null,
    studioId: null,
    service: false,
  });
  assertEquals(calls.length, 1);
});

Deno.test("resolveCaller recognizes service bearer without treating it as a user token", async () => {
  const prior = Deno.env.get("SUPABASE_SECRET_KEYS");
  Deno.env.set(
    "SUPABASE_SECRET_KEYS",
    JSON.stringify({ default: "sb_secret_test_service_key" }),
  );
  try {
    const { admin, calls } = adminStub(null, null);
    const req = new Request("https://example.test", {
      headers: { authorization: "Bearer sb_secret_test_service_key" },
    });
    assertEquals(await resolveCaller(req, admin), {
      userId: null,
      studioId: null,
      service: true,
    });
    assertEquals(calls.length, 0);
  } finally {
    if (prior === undefined) Deno.env.delete("SUPABASE_SECRET_KEYS");
    else Deno.env.set("SUPABASE_SECRET_KEYS", prior);
  }
});

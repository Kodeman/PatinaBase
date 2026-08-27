import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createDeleteAccountHandler,
  type DeleteAccountGateway,
} from "./handler.ts";

const CALLER = "d8000000-0000-4000-8000-000000000001";
const SOMEONE_ELSE = "d8000000-0000-4000-8000-0000000000ff";

interface Spy {
  gateway: DeleteAccountGateway;
  purged: string[];
  deleted: string[];
  order: string[];
}

function spy(opts: {
  userId?: string | null;
  purge?: { ok: boolean; error?: string };
  deleteAuthUser?: { ok: boolean; error?: string };
} = {}): Spy {
  const purged: string[] = [];
  const deleted: string[] = [];
  const order: string[] = [];
  return {
    purged,
    deleted,
    order,
    gateway: {
      // deno-lint-ignore require-await
      authenticate: async () =>
        opts.userId === null ? null : { userId: opts.userId ?? CALLER },
      // deno-lint-ignore require-await
      purge: async (userId) => {
        purged.push(userId);
        order.push("purge");
        return opts.purge ?? { ok: true };
      },
      // deno-lint-ignore require-await
      deleteAuthUser: async (userId) => {
        deleted.push(userId);
        order.push("delete");
        return opts.deleteAuthUser ?? { ok: true };
      },
    },
  };
}

function post(body?: unknown): Request {
  return new Request("https://x.invalid/functions/v1/delete-account", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.test("OPTIONS is answered with CORS and nothing is touched", async () => {
  const s = spy();
  const res = await createDeleteAccountHandler(s.gateway)(
    new Request("https://x.invalid/", { method: "OPTIONS" }),
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(s.order, []);
});

Deno.test("a non-POST is refused", async () => {
  const s = spy();
  const res = await createDeleteAccountHandler(s.gateway)(
    new Request("https://x.invalid/", { method: "GET" }),
  );
  assertEquals(res.status, 405);
  assertEquals((await res.json()).error, "method_not_allowed");
  assertEquals(s.order, []);
});

Deno.test("an unauthenticated caller deletes nothing", async () => {
  const s = spy({ userId: null });
  const res = await createDeleteAccountHandler(s.gateway)(post());
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "unauthorized");
  assertEquals(s.order, []);
});

Deno.test("the happy path purges first, then deletes the auth user", async () => {
  const s = spy();
  const res = await createDeleteAccountHandler(s.gateway)(post());
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, userId: CALLER });
  assertEquals(s.order, ["purge", "delete"]);
  assertEquals(s.purged, [CALLER]);
  assertEquals(s.deleted, [CALLER]);
});

Deno.test("a body naming another user is ignored — only the token's own id acts", async () => {
  const s = spy();
  const res = await createDeleteAccountHandler(s.gateway)(
    post({ userId: SOMEONE_ELSE, user_id: SOMEONE_ELSE }),
  );
  assertEquals(res.status, 200);
  assertEquals(s.purged, [CALLER]);
  assertEquals(s.deleted, [CALLER]);
});

Deno.test("a failed purge never proceeds to the auth delete", async () => {
  const s = spy({ purge: { ok: false, error: "guard trigger refused" } });
  const res = await createDeleteAccountHandler(s.gateway)(post());
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "purge_failed");
  assertEquals(s.order, ["purge"]);
  assertEquals(s.deleted, []);
});

Deno.test("a failed auth delete is reported as its own code", async () => {
  const s = spy({ deleteAuthUser: { ok: false, error: "user not found" } });
  const res = await createDeleteAccountHandler(s.gateway)(post());
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "auth_delete_failed");
  assertEquals(s.order, ["purge", "delete"]);
});

Deno.test("no vendor or Postgres text ever reaches the response body (C5)", async () => {
  const leak = "PGRST301: JWSError JWSInvalidSignature";
  for (
    const s of [
      spy({ purge: { ok: false, error: leak } }),
      spy({ deleteAuthUser: { ok: false, error: leak } }),
    ]
  ) {
    const res = await createDeleteAccountHandler(s.gateway)(post());
    const body = await res.text();
    assert(
      !body.includes("PGRST") && !body.includes("JWS"),
      `provider text leaked to the caller: ${body}`,
    );
  }
});

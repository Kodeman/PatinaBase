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

const PURGE_ID = "d8000000-0000-4000-8000-00000000ab01";

interface Spy {
  gateway: DeleteAccountGateway;
  purged: string[];
  deleted: string[];
  stamped: string[];
  order: string[];
}

function spy(opts: {
  userId?: string | null;
  isDesigner?: boolean | Error;
  purge?: { ok: boolean; purgeId?: string; error?: string };
  deleteAuthUser?: { ok: boolean; error?: string };
} = {}): Spy {
  const purged: string[] = [];
  const deleted: string[] = [];
  const stamped: string[] = [];
  const order: string[] = [];
  return {
    purged,
    deleted,
    stamped,
    order,
    gateway: {
      // deno-lint-ignore require-await
      authenticate: async () =>
        opts.userId === null ? null : { userId: opts.userId ?? CALLER },
      // deno-lint-ignore require-await
      isDesigner: async () => {
        order.push("is_designer");
        if (opts.isDesigner instanceof Error) throw opts.isDesigner;
        return opts.isDesigner ?? false;
      },
      // deno-lint-ignore require-await
      purge: async (userId) => {
        purged.push(userId);
        order.push("purge");
        return opts.purge ?? { ok: true, purgeId: PURGE_ID };
      },
      // deno-lint-ignore require-await
      deleteAuthUser: async (userId) => {
        deleted.push(userId);
        order.push("delete");
        return opts.deleteAuthUser ?? { ok: true };
      },
      // deno-lint-ignore require-await
      markPurgeComplete: async (purgeId) => {
        stamped.push(purgeId);
        order.push("stamp");
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

Deno.test("the happy path checks the caller, purges, deletes, then stamps the journal", async () => {
  const s = spy();
  const res = await createDeleteAccountHandler(s.gateway)(post());
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, userId: CALLER });
  assertEquals(s.order, ["is_designer", "purge", "delete", "stamp"]);
  assertEquals(s.purged, [CALLER]);
  assertEquals(s.deleted, [CALLER]);
  assertEquals(s.stamped, [PURGE_ID]);
});

// ── review B-D3 ──────────────────────────────────────────────────────────────
// verify_jwt admits any Strata token, a designer-portal session included, and
// designer_id is `REFERENCES profiles(id) ON DELETE CASCADE` everywhere
// (00014:74,124,301,349; 00020:18) — so a designer reaching this endpoint would
// not detach, she would erase her own projects, proposals, invoices and roster.
Deno.test("a designer caller is refused before anything is written", async () => {
  const s = spy({ isDesigner: true });
  const res = await createDeleteAccountHandler(s.gateway)(post());
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "designer_account");
  assertEquals(s.order, ["is_designer"]);
  assertEquals(s.purged, []);
  assertEquals(s.deleted, []);
});

Deno.test("an unreadable designer check fails CLOSED", async () => {
  const s = spy({ isDesigner: new Error("connection reset") });
  const res = await createDeleteAccountHandler(s.gateway)(post());
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "designer_check_failed");
  assertEquals(s.purged, []);
  assertEquals(s.deleted, []);
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
  assertEquals(s.order, ["is_designer", "purge"]);
  assertEquals(s.deleted, []);
});

// ── review M-D4 ──────────────────────────────────────────────────────────────
// The purge and the auth delete are two transactions and cannot be one. When
// the second fails the detachment has ALREADY committed under a live account,
// so the response must carry the journal row that says exactly what was
// detached — and must never stamp that row complete.
Deno.test("a failed auth delete is reported as its own code, with the journal ref", async () => {
  const s = spy({ deleteAuthUser: { ok: false, error: "user not found" } });
  const res = await createDeleteAccountHandler(s.gateway)(post());
  assertEquals(res.status, 500);
  assertEquals(await res.json(), {
    error: "auth_delete_failed",
    purgeRef: PURGE_ID,
  });
  assertEquals(s.order, ["is_designer", "purge", "delete"]);
  assertEquals(s.stamped, []);
});

Deno.test("a journal stamp that throws does not fail a completed deletion", async () => {
  const s = spy();
  const gateway = {
    ...s.gateway,
    markPurgeComplete: () => Promise.reject(new Error("stamp failed")),
  };
  const res = await createDeleteAccountHandler(gateway)(post());
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, userId: CALLER });
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

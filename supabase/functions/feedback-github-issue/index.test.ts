// handler() driven with a stubbed Supabase client and a stubbed fetch — no
// network, no stack. The fake client implements exactly the chain handler.ts
// uses: select/eq/maybeSingle for reads, update/eq/is[/or/select] for writes.

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handler, type HandlerDeps } from "./handler.ts";

const SERVICE_JWT = `x.${btoa(JSON.stringify({ role: "service_role" }))}.y`;
const ANON_JWT = `x.${btoa(JSON.stringify({ role: "anon" }))}.y`;

const AUTHOR = "99999999-8888-7777-6666-555555555555";

function bugRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    created_at: "2026-09-02T17:04:00.000Z",
    created_by: AUTHOR,
    bucket: "not_working",
    note: "Totals go blank",
    weight: "high",
    screen_name: "Document",
    route: "/doc/abc",
    app_version: "2026.09.02",
    viewport: "1512x857",
    user_agent: "Mozilla/5.0",
    screenshot_path: `${AUTHOR}/shot.png`,
    report_kind: "bug",
    github_issue_number: null,
    github_issue_url: null,
    github_issue_error: null,
    ...overrides,
  };
}

interface FakeState {
  row: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  claimAllowed: boolean;
  /**
   * Governs only the final write-back (the update that sets
   * github_issue_number to a real value) — independent of claimAllowed, so a
   * test can let the claim through and still lose the write-back race, the
   * way a stale claim reclaimed by a second invocation would.
   */
  writeBackAllowed: boolean;
  updates: Record<string, unknown>[];
  /**
   * The filters each write carried, positionally parallel to `updates`. The
   * guards ARE the concurrency design here — an update that reaches the row
   * without them is a lost claim or an overwritten issue link — so they are
   * recorded and asserted rather than taken on trust.
   */
  filters: string[][];
  signedFor: [string, number][];
}

function fakeClient(state: FakeState) {
  class Builder {
    isUpdate = false;
    isFeedback: boolean;
    updateValues: Record<string, unknown> | null = null;
    // Filled as the chain is built; handed to state.filters at update() time,
    // by reference, because the filters follow the update in the chain.
    filters: string[] = [];
    constructor(table: string) {
      this.isFeedback = table === "feedback";
    }
    select() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push(`eq:${column}:${String(value)}`);
      return this;
    }
    is(column: string, value: unknown) {
      this.filters.push(`is:${column}:${String(value)}`);
      return this;
    }
    neq(column: string, value: unknown) {
      this.filters.push(`neq:${column}:${String(value)}`);
      return this;
    }
    or(filter: string) {
      this.filters.push(`or:${filter}`);
      return this;
    }
    update(values: Record<string, unknown>) {
      this.isUpdate = true;
      this.updateValues = values;
      state.updates.push(values);
      state.filters.push(this.filters);
      return this;
    }
    maybeSingle() {
      return Promise.resolve({
        data: this.isFeedback ? state.row : state.profile,
        error: null,
      });
    }
    // Awaiting the builder resolves the write; a claim that lost returns no
    // rows. The write-back (the update that actually sets a real
    // github_issue_number) is gated by its own flag so a test can let the
    // claim through and still lose the final write.
    then(
      resolve: (value: { data: unknown; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      const isWriteBack =
        this.isUpdate &&
        this.updateValues != null &&
        Object.prototype.hasOwnProperty.call(this.updateValues, "github_issue_number") &&
        this.updateValues.github_issue_number != null;
      const allowed = isWriteBack ? state.writeBackAllowed : state.claimAllowed;
      const data = allowed ? [{ id: state.row?.id }] : [];
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    }
  }

  return {
    from: (table: string) => new Builder(table),
    storage: {
      from: () => ({
        createSignedUrl: (path: string, ttl: number) => {
          state.signedFor.push([path, ttl]);
          return Promise.resolve({
            data: { signedUrl: `https://signed.example/${path}` },
            error: null,
          });
        },
      }),
    },
  };
}

function makeDeps(
  state: FakeState,
  {
    env = {} as Record<string, string>,
    fetchImpl,
  }: { env?: Record<string, string>; fetchImpl?: HandlerDeps["fetch"] } = {},
): HandlerDeps {
  return {
    createClient: () => fakeClient(state),
    fetch: fetchImpl ?? (() => Promise.reject(new Error("fetch not stubbed"))),
    env: (key: string) =>
      ({
        SUPABASE_URL: "http://localhost",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        GITHUB_REPO: "Kodeman/PatinaBase",
        ...env,
      })[key],
  };
}

function state(overrides: Partial<FakeState> = {}): FakeState {
  return {
    row: bugRow(),
    profile: { email: "leah@example.com", full_name: "Leah", display_name: null },
    claimAllowed: true,
    writeBackAllowed: true,
    updates: [],
    filters: [],
    signedFor: [],
    ...overrides,
  };
}

/**
 * The claim write: the marker plus a fresh `updated_at`, which is what lets a
 * later invocation tell a live claim from one a crash stranded. The timestamp
 * is `now()`, so it is asserted by shape.
 */
function assertClaimWrite(values: Record<string, unknown>) {
  assertEquals(values.github_issue_error, "filing");
  assertEquals(typeof values.updated_at, "string");
  assertEquals(
    Number.isNaN(Date.parse(values.updated_at as string)),
    false,
  );
  assertEquals(Object.keys(values).sort(), ["github_issue_error", "updated_at"]);
}

function post(body: unknown, jwt = SERVICE_JWT): Request {
  return new Request("https://fn.local/feedback-github-issue", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
}

Deno.test("rejects a caller that is not service_role", async () => {
  const s = state();
  const res = await handler(post({ record: { id: s.row!.id } }, ANON_JWT), makeDeps(s));
  assertEquals(res.status, 403);
  assertEquals(s.updates.length, 0);
});

Deno.test("rejects a GET", async () => {
  const s = state();
  const req = new Request("https://fn.local/feedback-github-issue", {
    method: "GET",
    headers: { Authorization: `Bearer ${SERVICE_JWT}` },
  });
  const res = await handler(req, makeDeps(s));
  assertEquals(res.status, 405);
  assertEquals(s.updates.length, 0);
});

Deno.test("skips a row that is not a bug report", async () => {
  const s = state({ row: bugRow({ report_kind: "note" }) });
  const res = await handler(post({ record: { id: s.row!.id } }), makeDeps(s));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).skipped, "not a bug report");
  assertEquals(s.updates.length, 0);
});

Deno.test("skips a row whose issue is already filed", async () => {
  const s = state({ row: bugRow({ github_issue_number: 12 }) });
  const res = await handler(post({ record: { id: s.row!.id } }), makeDeps(s));
  assertEquals((await res.json()).skipped, "issue already filed");
  assertEquals(s.updates.length, 0);
});

Deno.test("skips when another invocation already claimed the row", async () => {
  const s = state({ claimAllowed: false });
  const res = await handler(
    post({ record: { id: s.row!.id } }),
    makeDeps(s, { env: { GITHUB_TOKEN: "t" } }),
  );
  assertEquals(res.status, 200);
  assertStringIncludes((await res.json()).skipped, "another invocation");
  // Only the claim attempt itself was written; GitHub was never called.
  assertEquals(s.updates.length, 1);
  assertClaimWrite(s.updates[0]);
});

Deno.test("writes the reason when GITHUB_TOKEN is unset", async () => {
  const s = state();
  const res = await handler(post({ record: { id: s.row!.id } }), makeDeps(s));
  assertEquals(res.status, 200);
  assertEquals(s.updates, [{ github_issue_error: "GITHUB_TOKEN not configured" }]);
});

Deno.test("writes a terse reason and 502s on a GitHub error", async () => {
  const s = state();
  const res = await handler(
    post({ record: { id: s.row!.id } }),
    makeDeps(s, {
      env: { GITHUB_TOKEN: "t" },
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify({ message: "Validation Failed" }), {
            status: 422,
          }),
        ),
    }),
  );

  assertEquals(res.status, 502);
  assertEquals(s.updates.length, 2);
  assertClaimWrite(s.updates[0]);
  assertEquals(s.updates[1], { github_issue_error: "github 422" });
  // The response body never reaches the row.
  assertEquals(JSON.stringify(s.updates).includes("Validation Failed"), false);
});

Deno.test("writes the issue number and url on success", async () => {
  const s = state();
  let sentBody = "";
  const res = await handler(
    post({ record: { id: s.row!.id } }),
    makeDeps(s, {
      env: { GITHUB_TOKEN: "t" },
      fetchImpl: (_input, init) => {
        sentBody = String(init?.body ?? "");
        return Promise.resolve(
          new Response(
            JSON.stringify({ number: 7, html_url: "https://github.com/o/r/issues/7" }),
            { status: 201 },
          ),
        );
      },
    }),
  );

  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    ok: true,
    number: 7,
    url: "https://github.com/o/r/issues/7",
  });
  assertEquals(s.updates.length, 2);
  assertClaimWrite(s.updates[0]);
  assertEquals(s.updates[1], {
    github_issue_number: 7,
    github_issue_url: "https://github.com/o/r/issues/7",
    github_issue_error: null,
  });
  assertStringIncludes(sentBody, "[Tester] Document: Totals go blank");
  // The author owns the path, so it was signed — for two weeks.
  assertEquals(s.signedFor, [[`${AUTHOR}/shot.png`, 14 * 24 * 60 * 60]]);
});

Deno.test("returns lost-race and logs when another invocation already won the write-back", async () => {
  const s = state({ writeBackAllowed: false });
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    const res = await handler(
      post({ record: { id: s.row!.id } }),
      makeDeps(s, {
        env: { GITHUB_TOKEN: "t" },
        fetchImpl: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({ number: 7, html_url: "https://github.com/o/r/issues/7" }),
              { status: 201 },
            ),
          ),
      }),
    );

    assertEquals(res.status, 409);
    assertEquals(await res.clone().json(), {
      ok: false,
      error: "lost-race",
      number: 7,
      url: "https://github.com/o/r/issues/7",
    });
    // The claim succeeded and GitHub was called (an issue was filed), but the
    // write-back lost — logged, not silently dropped.
    assertEquals(errors.length, 1);
    assertStringIncludes(String(errors[0][0]), "lost the write-back race");
    // Both issue numbers: the one this invocation just filed (#7)…
    assertStringIncludes(String(errors[0][0]), "#7");
  } finally {
    console.error = originalError;
  }
});

Deno.test("guards the claim on the issue number and lets a stale claim through", async () => {
  const s = state();
  await handler(
    post({ record: { id: s.row!.id } }),
    makeDeps(s, {
      env: { GITHUB_TOKEN: "t" },
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify({ number: 9, html_url: "u" }), { status: 201 }),
        ),
    }),
  );

  const [claim, success] = s.filters;

  // A row that already carries a number is never re-claimed…
  assertEquals(claim.includes("is:github_issue_number:null"), true);
  // …and among the unfiled, the claim is available to an unclaimed row, to one
  // carrying some other error (a retry after a failure), or to a claim that a
  // crash stranded more than the TTL ago.
  const or = claim.find((f) => f.startsWith("or:")) ?? "";
  assertStringIncludes(or, "github_issue_error.is.null");
  assertStringIncludes(or, "github_issue_error.neq.filing");
  assertStringIncludes(or, "and(github_issue_error.eq.filing,updated_at.lt.");

  // The cutoff is a real timestamp, and it is in the past.
  const cutoff = or.match(/updated_at\.lt\.([^),]+)/)?.[1] ?? "";
  assertEquals(Number.isNaN(Date.parse(cutoff)), false);
  assertEquals(Date.parse(cutoff) < Date.now(), true);

  // The write-back carries the same guard: a link filed by another invocation
  // is never overwritten.
  assertEquals(success.includes("is:github_issue_number:null"), true);
});

Deno.test("never signs a screenshot path the author does not own", async () => {
  const s = state({ row: bugRow({ screenshot_path: "someone-else/shot.png" }) });
  let sentBody = "";
  await handler(
    post({ record: { id: s.row!.id } }),
    makeDeps(s, {
      env: { GITHUB_TOKEN: "t" },
      fetchImpl: (_input, init) => {
        sentBody = String(init?.body ?? "");
        return Promise.resolve(
          new Response(JSON.stringify({ number: 8, html_url: "u" }), { status: 201 }),
        );
      },
    }),
  );

  assertEquals(s.signedFor, []);
  assertStringIncludes(sentBody, "screenshot path not owned by author");
});

import {
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPaperHashHandler } from "./handler.ts";

const projectId = "11111111-1111-4111-8111-111111111111";
const intakeId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const objectId = "44444444-4444-4444-8444-444444444444";
const name = "55555555-5555-4555-8555-555555555555.pdf";
const sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
interface Options {
  denied?: boolean;
  noIntake?: boolean;
  wrongProject?: boolean;
  authDenied?: boolean;
  moved?: "id" | "version" | "etag";
  initialMismatch?: boolean;
  notFound?: boolean;
  paged?: boolean;
  beyondTwoThousand?: boolean;
  nonAdvancing?: boolean;
  exhausted?: boolean;
  replayed?: boolean;
  stampError?: { code: string; message: string };
  storageError?: boolean;
  intakeMissing?: boolean;
  intakeLookupError?: { code: string; message: string; details: string };
  objectName?: string;
  fileSize?: number;
}
function harness(options: Options = {}) {
  const calls: string[] = [];
  let serviceCreated = 0;
  let infoCalls = 0;
  let stampBody: unknown;
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const headers = new Headers(init?.headers);
    if (url.pathname === "/auth/v1/user") {
      assertEquals(headers.get("Authorization"), "Bearer caller-jwt");
      return options.authDenied
        ? reply({ message: "bad token" }, 401)
        : reply({ id: "user" });
    }
    if (url.pathname.endsWith("/rpc/get_project_service_acceptance")) {
      assertEquals(headers.get("Authorization"), "Bearer caller-jwt");
      assertEquals(body, { p_project_id: projectId });
      if (options.denied) {
        return reply({ code: "42501", message: "denied" }, 403);
      }
      return reply({
        projectId: options.wrongProject ? "another" : projectId,
        requests: [
          { requestId, paperIntakes: options.noIntake ? [] : [{ intakeId }] },
        ],
      });
    }
    assertEquals(headers.get("Authorization"), "Bearer service-key");
    if (url.pathname.endsWith("/service_acceptance_paper_intakes")) {
      assertEquals(url.searchParams.get("id"), `eq.${intakeId}`);
      assertEquals(url.searchParams.get("request_id"), `eq.${requestId}`);
      if (options.intakeLookupError) {
        return reply(options.intakeLookupError, 406);
      }
      if (options.intakeMissing) {
        return headers.get("Accept") === "application/vnd.pgrst.object+json"
          ? reply({
            code: "PGRST116",
            message: "Cannot coerce the result to a single JSON object",
            details: "The result contains 0 rows",
          }, 406)
          : reply([]);
      }
      return reply({
        id: intakeId,
        request_id: requestId,
        storage_object_id: objectId,
        storage_object_version: "v1",
        storage_object_etag: "etag1",
      });
    }
    if (url.pathname.endsWith("/object/list/service-acceptance-paper")) {
      assertEquals(body.prefix, projectId);
      assertEquals(body.limit, 100);
      assertEquals(body.sortBy, { column: "name", order: "asc" });
      if (options.storageError) {
        return reply({ message: "secret internal detail" }, 500);
      }
      if (
        (options.exhausted && body.offset < 2100) ||
        (options.beyondTwoThousand && body.offset < 2100) ||
        (options.nonAdvancing && body.offset < 200) ||
        (options.paged && body.offset === 0)
      ) {
        return reply(
          Array.from(
            { length: 100 },
            (_, i) => ({
              id: `other-${i}`,
              name: `${String(options.nonAdvancing ? i : body.offset + i).padStart(6, "0")}.pdf`,
            }),
          ),
        );
      }
      if (options.paged) assertEquals(body.offset, 100);
      if (options.exhausted || options.beyondTwoThousand) {
        assertEquals(body.offset, 2100);
      }
      return reply(
        options.notFound || options.exhausted ? [] : [{
          id: objectId,
          name: options.objectName ?? name,
        }],
      );
    }
    if (url.pathname.includes("/object/info/")) {
      assertEquals(url.pathname.endsWith(`/${projectId}/${name}`), true);
      infoCalls++;
      const info: Record<string, unknown> = {
        id: objectId,
        version: "v1",
        etag: "etag1",
      };
      if (options.initialMismatch) info.version = "other";
      if (infoCalls === 2 && options.moved) info[options.moved] = "changed";
      return reply(info);
    }
    if (url.pathname.includes("/storage/v1/object/")) {
      assertEquals(url.pathname.endsWith(`/${projectId}/${name}`), true);
      return new Response(
        options.fileSize === undefined
          ? "abc"
          : new Uint8Array(options.fileSize),
        { headers: { "Content-Type": "application/pdf" } },
      );
    }
    if (url.pathname.endsWith("/rpc/stamp_service_acceptance_paper_hash")) {
      stampBody = body;
      return options.stampError
        ? reply(options.stampError, 400)
        : reply({ replayed: options.replayed ?? false });
    }
    throw new Error(`Unexpected mock request ${url.pathname}`);
  };
  const client = (key: string, authorization?: string) =>
    createClient("https://mock.supabase.test", key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: fetcher,
        ...(authorization ? { headers: { Authorization: authorization } } : {}),
      },
    });
  const handler = createPaperHashHandler({
    caller: (auth) => client("anon", auth),
    service: () => {
      serviceCreated++;
      return client("service-key");
    },
  });
  const post = (body: unknown = { projectId, intakeId }) =>
    handler(
      new Request("https://edge.test", {
        method: "POST",
        headers: {
          Authorization: "Bearer caller-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  return {
    handler,
    post,
    calls,
    serviceCreated: () => serviceCreated,
    stampBody: () => stampBody,
  };
}

Deno.test("authorized fixed bytes stamp their known SHA256 and recorded version/eTag", async () => {
  const h = harness();
  const response = await h.post();
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    intakeId,
    documentSha256: sha,
    replayed: false,
  });
  assertEquals(h.stampBody(), {
    p_intake_id: intakeId,
    p_document_sha256: sha,
    p_object_version: "v1",
    p_object_etag: "etag1",
  });
  assertEquals(h.calls.filter((c) => c.includes("/info/")).length, 2);
});
Deno.test("studio read must contain the intake before any service client or I/O", async () => {
  for (
    const options of [{ denied: true }, { noIntake: true }, {
      wrongProject: true,
    }]
  ) {
    const h = harness(options);
    const r = await h.post();
    assertEquals(r.status, 403);
    assertEquals(await r.json(), { code: "forbidden" });
    assertEquals(h.serviceCreated(), 0);
  }
});
Deno.test("object id, version or eTag moving during hashing refuses without stamp", async () => {
  for (const moved of ["id", "version", "etag"] as const) {
    const h = harness({ moved });
    const r = await h.post();
    assertEquals(r.status, 409);
    assertEquals(await r.json(), { code: "paper_document_changed" });
    assertEquals(h.stampBody(), undefined);
  }
});
Deno.test("initial identity mismatch refuses before downloading bytes", async () => {
  const h = harness({ initialMismatch: true });
  const r = await h.post();
  assertEquals(r.status, 409);
  assertEquals(h.stampBody(), undefined);
  assertEquals(
    h.calls.filter((c) => c.includes("/storage/v1/object/")).length,
    2,
  );
});
Deno.test("native Storage listing finds an object beyond 2,000 entries and distinguishes exhaustion", async () => {
  const found = harness({ beyondTwoThousand: true });
  const foundResponse = await found.post();
  assertEquals(foundResponse.status, 200);
  assertEquals((await foundResponse.json()).documentSha256, sha);
  assertEquals(found.calls.filter((c) => c.includes("/object/list/")).length, 22);
  const missing = harness({ exhausted: true });
  const missingResponse = await missing.post();
  assertEquals(missingResponse.status, 404);
  assertEquals(await missingResponse.json(), {
    code: "paper_document_not_found",
  });
  assertEquals(
    missing.calls.filter((c) => c.includes("/object/list/")).length,
    22,
  );
});
Deno.test("native Storage listing follows multiple pages", async () => {
  const h = harness({ paged: true });
  const r = await h.post();
  assertEquals(r.status, 200);
  await r.body?.cancel();
  assertEquals(h.calls.filter((c) => c.includes("/object/list/")).length, 2);
});
Deno.test("non-advancing Storage pages fail distinctly instead of looping or returning not-found", async () => {
  const h = harness({ nonAdvancing: true });
  const r = await h.post();
  assertEquals(r.status, 502);
  assertEquals(await r.json(), { code: "paper_document_listing_stalled" });
  assertEquals(h.calls.filter((c) => c.includes("/object/list/")).length, 2);
  assertEquals(h.stampBody(), undefined);
});
Deno.test("missing object returns clear 404 without download or stamp", async () => {
  const h = harness({ notFound: true });
  const r = await h.post();
  assertEquals(r.status, 404);
  assertEquals(await r.json(), { code: "paper_document_not_found" });
  assertEquals(h.stampBody(), undefined);
  assertEquals(h.calls.some((c) => c.includes("/info/")), false);
});
Deno.test("revoked inactive stamp and named SQL refusals are clear 4xx codes", async () => {
  for (
    const [message, status, code] of [
      [
        "permission denied for function stamp_service_acceptance_paper_hash",
        403,
        "service_acceptance_inactive",
      ],
      ["request_not_open", 409, "request_not_open"],
      ["paper_document_hash_invalid", 400, "paper_document_hash_invalid"],
      ["paper_document_changed", 409, "paper_document_changed"],
      ["paper_document_hash_conflict", 409, "paper_document_hash_conflict"],
    ] as const
  ) {
    const h = harness({
      stampError: { code: status === 403 ? "42501" : "23514", message },
    });
    const r = await h.post();
    assertEquals(r.status, status);
    assertEquals(await r.json(), { code });
  }
});
Deno.test("same-byte stamp replay is returned unchanged", async () => {
  const h = harness({ replayed: true });
  const r = await h.post();
  assertEquals(await r.json(), {
    intakeId,
    documentSha256: sha,
    replayed: true,
  });
});
Deno.test("validation, JWT authentication and CORS fail closed", async () => {
  const h = harness();
  const missing = await h.handler(
    new Request("https://edge.test", { method: "POST" }),
  );
  assertEquals(missing.status, 401);
  await missing.body?.cancel();
  for (
    const body of [null, {}, { projectId, intakeId: "bad" }, {
      projectId: [projectId],
      intakeId,
    }]
  ) {
    const r = await h.post(body);
    assertEquals(r.status, 400);
    await r.body?.cancel();
  }
  const denied = harness({ authDenied: true });
  const r = await denied.post();
  assertEquals(r.status, 401);
  await r.body?.cancel();
  assertEquals(denied.serviceCreated(), 0);
  const options = await h.handler(
    new Request("https://edge.test", { method: "OPTIONS" }),
  );
  assertEquals(options.status, 200);
  assertMatch(options.headers.get("Access-Control-Allow-Methods")!, /POST/);
  await options.body?.cancel();
  const get = await h.handler(new Request("https://edge.test"));
  assertEquals(get.status, 405);
  await get.body?.cancel();
  assertEquals(h.serviceCreated(), 0);
});
Deno.test("authorized intake missing from service lookup returns 404 before Storage", async () => {
  const h = harness({ intakeMissing: true });
  const r = await h.post();
  assertEquals(r.status, 404);
  assertEquals(await r.json(), { code: "paper_intake_not_found" });
  assertEquals(h.calls.some((c) => c.startsWith("/storage/")), false);
  assertEquals(h.stampBody(), undefined);
});
Deno.test("non-missing intake lookup errors remain generic upstream failures", async () => {
  const h = harness({
    intakeLookupError: {
      code: "PGRST116",
      message: "Cannot coerce the result to a single JSON object",
      details: "The result contains 2 rows",
    },
  });
  const r = await h.post();
  assertEquals(r.status, 500);
  assertEquals(await r.json(), { code: "paper_hash_failed" });
  assertEquals(h.calls.some((c) => c.startsWith("/storage/")), false);
  assertEquals(h.stampBody(), undefined);
});
Deno.test("inactive capability and revoked stamp permission return the paused response", async () => {
  for (
    const stampError of [
      { code: "55000", message: "scope_editions_inactive" },
      {
        code: "42501",
        message:
          "permission denied for function stamp_service_acceptance_paper_hash",
      },
    ]
  ) {
    const h = harness({ stampError });
    const r = await h.post();
    assertEquals(r.status, 403);
    assertEquals(await r.json(), { code: "service_acceptance_inactive" });
    assertEquals(h.stampBody() !== undefined, true);
  }
});
Deno.test("bad PDF filename refuses before metadata, download or stamp", async () => {
  const h = harness({ objectName: "not-an-object-id.pdf" });
  const r = await h.post();
  assertEquals(r.status, 409);
  assertEquals(await r.json(), { code: "paper_document_changed" });
  assertEquals(h.calls.filter((c) => c.startsWith("/storage/")).length, 1);
  assertEquals(h.stampBody(), undefined);
});
for (
  const [label, fileSize, accepted] of [
    ["empty", 0, false],
    ["one byte", 1, true],
    ["20 MiB", 20971520, true],
    ["20 MiB plus one byte", 20971521, false],
  ] as const
) {
  Deno.test(`PDF size boundary: ${label}`, async () => {
    const h = harness({ fileSize });
    const r = await h.post();
    assertEquals(r.status, accepted ? 200 : 400);
    if (accepted) {
      const result = await r.json();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array(fileSize),
      );
      const expectedSha = Array.from(
        new Uint8Array(digest),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      assertEquals(result, {
        intakeId,
        documentSha256: expectedSha,
        replayed: false,
      });
      assertEquals(h.stampBody(), {
        p_intake_id: intakeId,
        p_document_sha256: expectedSha,
        p_object_version: "v1",
        p_object_etag: "etag1",
      });
      assertEquals(h.calls.filter((c) => c.includes("/info/")).length, 2);
    } else {
      assertEquals(await r.json(), { code: "paper_document_invalid" });
      assertEquals(h.stampBody(), undefined);
      assertEquals(h.calls.filter((c) => c.includes("/info/")).length, 1);
    }
  });
}
Deno.test("upstream storage failure does not leak internal details", async () => {
  const h = harness({ storageError: true });
  const r = await h.post();
  assertEquals(r.status, 500);
  assertEquals(await r.json(), { code: "paper_hash_failed" });
  assertEquals(h.stampBody(), undefined);
});

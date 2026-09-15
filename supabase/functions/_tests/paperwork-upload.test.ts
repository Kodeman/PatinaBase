// paperwork-upload — the trade-side compliance door's edge half (PR-a / V10).
//
// Drives core.ts with a fake client, so no stack and no network. What is proved
// here is the door's own discipline: a token that is not live reaches nothing,
// the firm is never taken from the request body, and the write is an INSERT
// path that cannot touch a verified document.
//
//   deno test --allow-all --config supabase/functions/deno.json \
//     supabase/functions/_tests/paperwork-upload.test.ts

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handlePaperwork,
  type PaperworkDeps,
  sanitizeFilename,
  uploadPaperwork,
} from "../paperwork-upload/core.ts";

const LIVE_TOKEN = "a".repeat(64);
const DEAD_TOKEN = "b".repeat(64);
const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";

interface Call {
  name: string;
  args: Record<string, unknown>;
}

/** Every RPC the door can reach, answering the way 00637 does: a token that is
 *  not live returns nothing at all, from every one of them. */
function fake(options: {
  liveTokens?: string[];
  rateLimited?: boolean;
  uploadError?: string;
  recordError?: string;
  calls?: Call[];
  uploads?: string[];
} = {}) {
  const live = new Set(options.liveTokens ?? [LIVE_TOKEN]);
  const calls = options.calls ?? [];
  const uploads = options.uploads ?? [];
  return {
    calls,
    uploads,
    client: {
      // deno-lint-ignore require-await
      async rpc(name: string, args: Record<string, unknown> = {}) {
        calls.push({ name, args });
        const token = String(args.p_token ?? "");
        switch (name) {
          case "paperwork_link_rate_limit_hit":
            return { data: !options.rateLimited, error: null };
          case "resolve_paperwork_link":
            return live.has(token)
              ? {
                data: {
                  studio_name: "Leah Chen Studio",
                  company_name: "Twin Cities Drywall & Plaster",
                  documents: [],
                },
                error: null,
              }
              : { data: null, error: null };
          case "paperwork_link_storage_context":
            return live.has(token)
              ? {
                data: [{ organization_id: ORG, company_id: COMPANY }],
                error: null,
              }
              : { data: [], error: null };
          case "record_inbound_compliance_document":
            if (!live.has(token)) {
              return { data: null, error: { message: "paperwork_token_invalid" } };
            }
            if (options.recordError) {
              return { data: null, error: { message: options.recordError } };
            }
            return { data: "33333333-3333-4333-8333-333333333333", error: null };
          default:
            return { data: null, error: { message: `unexpected rpc ${name}` } };
        }
      },
      storage: {
        from(_bucket: string) {
          return {
            // deno-lint-ignore require-await
            async upload(path: string) {
              if (options.uploadError) {
                return { data: null, error: { message: options.uploadError } };
              }
              uploads.push(path);
              return { data: { path }, error: null };
            },
          };
        },
      },
    } as unknown as PaperworkDeps["supabase"],
  };
}

function pdf(name = "coi.pdf"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

function multipart(fields: Record<string, string>, file: File): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file);
  return new Request("http://x/paperwork-upload", { method: "POST", body: form });
}

Deno.test("a live token resolves the firm's paperwork context", async () => {
  const f = fake();
  const res = await handlePaperwork(
    { supabase: f.client },
    new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "context", token: LIVE_TOKEN }),
    }),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.valid, true);
  assertEquals(body.company_name, "Twin Cities Drywall & Plaster");
});

Deno.test("an expired, revoked or unknown token gives one answer and no oracle", async () => {
  const f = fake();
  const res = await handlePaperwork(
    { supabase: f.client },
    new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "context", token: DEAD_TOKEN }),
    }),
  );
  const body = await res.json();
  // 200 + {valid:false}: the same answer a live-but-empty firm's page would
  // never distinguish, and the same one a malformed token gets below.
  assertEquals(res.status, 200);
  assertEquals(body, { valid: false });
});

Deno.test("a malformed token never reaches the database", async () => {
  const f = fake();
  const res = await handlePaperwork(
    { supabase: f.client },
    new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "context", token: "not-a-token" }),
    }),
  );
  assertEquals(await res.json(), { valid: false });
  assertEquals(f.calls.filter((c) => c.name === "resolve_paperwork_link").length, 0);
});

Deno.test("an upload on a dead token stores nothing and writes nothing", async () => {
  const f = fake();
  const result = await uploadPaperwork(
    { supabase: f.client },
    { token: DEAD_TOKEN, doc_type: "coi_gl", expires_on: "2027-03-31" },
    pdf(),
  );
  assertEquals(result.status, 403);
  assertEquals(f.uploads.length, 0);
  assertEquals(
    f.calls.filter((c) => c.name === "record_inbound_compliance_document").length,
    0,
  );
});

Deno.test("the storage key takes its studio and firm from the token, never the form", async () => {
  const f = fake();
  const res = await handlePaperwork(
    { supabase: f.client },
    multipart({
      token: LIVE_TOKEN,
      doc_type: "coi_gl",
      expires_on: "2027-03-31",
      // A forged scope in the body. It must reach nothing (spec acceptance 3).
      company_id: "99999999-9999-4999-8999-999999999999",
      organization_id: "99999999-9999-4999-8999-999999999999",
    }, pdf("Certificate Of Insurance.PDF")),
  );
  assertEquals(res.status, 200);
  assertEquals(f.uploads.length, 1);
  assertStringIncludes(f.uploads[0], `${ORG}/${COMPANY}/`);
  assert(!f.uploads[0].includes("9999999"));
  // Every segment before the filename is a uuid; the filename is last and
  // sanitized (spec §4 — project-documents' 22P02 trap).
  const parts = f.uploads[0].split("/");
  assertEquals(parts.length, 4);
  assertEquals(parts[3], "certificate-of-insurance.pdf");
});

Deno.test("the write is the insert-only RPC — no update path exists on this door", async () => {
  const f = fake();
  await handlePaperwork(
    { supabase: f.client },
    multipart({
      token: LIVE_TOKEN,
      doc_type: "coi_gl",
      issuer: "Western National",
      expires_on: "2027-03-31",
    }, pdf()),
  );
  const writes = f.calls.filter((c) =>
    c.name === "record_inbound_compliance_document"
  );
  assertEquals(writes.length, 1);
  // The only document-writing call the door can make is the one that always
  // INSERTs (00637); there is no confirm, no supersede and no update here, so
  // a verified document cannot be touched by an upload (spec §5.4).
  assertEquals(
    f.calls.filter((c) => c.name.includes("confirm") || c.name.includes("update")).length,
    0,
  );
  assertEquals(writes[0].args.p_file_path, f.uploads[0]);
  assertEquals(writes[0].args.p_expires_on, "2027-03-31");
});

Deno.test("a token that dies between the context read and the write is a 4xx, not a 500", async () => {
  const f = fake({ recordError: "paperwork_token_invalid" });
  const res = await handlePaperwork(
    { supabase: f.client },
    multipart({ token: LIVE_TOKEN, doc_type: "w9" }, pdf("w9.pdf")),
  );
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "invalid or expired token");
});

Deno.test("a file outside the mime allowlist or over 15 MB never uploads", async () => {
  const f = fake();
  const bad = await uploadPaperwork(
    { supabase: f.client },
    { token: LIVE_TOKEN, doc_type: "coi_gl", expires_on: "2027-03-31" },
    new File(["x"], "sheet.xlsx", { type: "application/vnd.ms-excel" }),
  );
  assertEquals(bad.status, 400);

  const huge = new File([new Uint8Array(16 * 1024 * 1024)], "big.pdf", {
    type: "application/pdf",
  });
  const over = await uploadPaperwork(
    { supabase: f.client },
    { token: LIVE_TOKEN, doc_type: "coi_gl", expires_on: "2027-03-31" },
    huge,
  );
  assertEquals(over.status, 400);
  assertEquals(f.uploads.length, 0);
});

Deno.test("other_named without a label is refused before anything is stored", async () => {
  const f = fake();
  const result = await uploadPaperwork(
    { supabase: f.client },
    { token: LIVE_TOKEN, doc_type: "other_named", doc_label: "  " },
    pdf(),
  );
  assertEquals(result.status, 400);
  assertEquals(f.uploads.length, 0);
});

Deno.test("one bucket covers both calls, and a rate-limited caller is refused", async () => {
  const f = fake({ rateLimited: true });
  const res = await handlePaperwork(
    { supabase: f.client, ip: "203.0.113.9" },
    new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "context", token: LIVE_TOKEN }),
    }),
  );
  assertEquals(res.status, 429);
  assertEquals(f.calls[0].name, "paperwork_link_rate_limit_hit");
  assertEquals(f.calls.filter((c) => c.name === "resolve_paperwork_link").length, 0);
});

Deno.test("sanitizeFilename keeps the name last and harmless", () => {
  assertEquals(sanitizeFilename("../../etc/passwd"), "passwd");
  assertEquals(sanitizeFilename("Ünsafe Name!.pdf"), "nsafe-name-.pdf");
  assertEquals(sanitizeFilename(""), "document");
});

Deno.test("dated paper may not be recorded without the date it runs out", async () => {
  const f = fake();
  const result = await uploadPaperwork(
    { supabase: f.client },
    { token: LIVE_TOKEN, doc_type: "coi_gl" },
    pdf(),
  );
  // 00623's dated_expiry CHECK would refuse this at the door with a constraint
  // name; the firm gets a sentence, and nothing is stored on the way.
  assertEquals(result.status, 400);
  assertEquals(result.body.error, "give the date it expires");
  assertEquals(f.uploads.length, 0);

  // A W-9 is not dated paper and needs no date.
  const w9 = await uploadPaperwork(
    { supabase: f.client },
    { token: LIVE_TOKEN, doc_type: "w9" },
    pdf("w9.pdf"),
  );
  assertEquals(w9.status, 200);
});

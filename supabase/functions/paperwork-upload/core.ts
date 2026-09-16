// paperwork-upload/core.ts — the trade-side compliance upload door (PR-a, V10).
//
// Kody overruled the panel's park on 2026-09-11: the firm's paperwork contact
// uploads COI, W-9, licence and signed waivers to the studio's company card
// over a tokened page, and every document lands UNVERIFIED until a studio
// member confirms it. Contract: build/upload-door-spec.md §3, §4, §5.
//
// Public, browser-called, token-gated IN CODE — the fulfillment-evidence
// posture, which is the closest sibling: there is no session, the 64-hex token
// minted by mint_paperwork_link IS the authority, and it is verified against
// paperwork_link_tokens inside the RPCs this file calls (service_role only,
// 00637). verify_jwt = false in config.toml so the gateway does not demand a
// caller JWT; CORS is wired in index.ts.
//
// THE FIRM IS NEVER TAKEN FROM THE REQUEST. The studio and company ids come
// from the token row (paperwork_link_storage_context), so a forged company_id
// in the form body reaches nothing — spec acceptance 3.
//
// Two behaviours, dispatched by Content-Type (both POST), fulfillment-evidence's
// own shape:
//   application/json      { action: 'context', token }
//     -> the page's payload: studio name, firm name, the paper it owes and what
//        each lapse blocks. { valid: false } for a dead token, with no branch
//        that could tell a guesser the token once existed.
//   multipart/form-data   token, doc_type, [doc_label, number, issuer,
//                         issued_on, expires_on], file
//     -> uploads to compliance-documents at
//        {organization_id}/{company_id}/{upload_id}/{filename}, then records an
//        unverified inbound document and notifies the studio.
//
// All logic is here (pure + injectable) so the Deno test drives it with a fake
// client — no live stack, no network. index.ts only builds the real
// service-role client and layers CORS on.

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Mirrors studio_compliance_documents' doc_type CHECK (00623). Held here too
 *  so a bad type is a 400 the page can read, not a 500 from a constraint. */
export const DOC_TYPES = [
  "coi_gl",
  "coi_wc",
  "coi_auto",
  "w9",
  "license",
  "bond",
  "lien_waiver_conditional",
  "lien_waiver_unconditional",
  "other_named",
] as const;

/** Mirrors studio_compliance_documents' dated-expiry CHECK (00623): a
 *  certificate, a licence and a bond are dated paper and may not be recorded
 *  without the date they run out. Held here so the firm reads a sentence
 *  rather than a constraint name. */
export const DATED_DOC_TYPES = [
  "coi_gl",
  "coi_wc",
  "coi_auto",
  "license",
  "bond",
] as const;

/** Mirrors the bucket's allowed_mime_types (spec §4). The bucket is the
 *  enforcement; this is the message. */
export const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

/** Spec §4: 15 MB, the evidence-upload posture rather than project-documents'
 *  50 MB — compliance paper is a scan, not project media. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** An ISO calendar date, which is what both date inputs on the firm's page
 *  send and the only shape two dates may be compared in as strings. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 00623's `studio_compliance_documents_dates_check` is
 *  `expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on`, so
 *  the same day is allowed and only a reversed pair is refused. The firm reads
 *  this sentence instead of the constraint's name — or, worse, instead of a
 *  sentence about its token, which is what it used to read (W4 r8 MAJOR-1). */
export const REVERSED_DATES_MESSAGE =
  "the date it expires cannot come before the date it was issued";

export interface PaperworkRpcResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}

export interface PaperworkSupabaseLike {
  rpc(name: string, args?: Record<string, unknown>): Promise<PaperworkRpcResult>;
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Blob | ArrayBuffer | Uint8Array | File,
        opts?: { contentType?: string; upsert?: boolean },
      ): Promise<{ data: unknown; error: { message: string } | null }>;
      remove(
        paths: string[],
      ): Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

export interface PaperworkDeps {
  supabase: PaperworkSupabaseLike;
  /** The caller's address, VALIDATED (callerIp), for the shared bucket
   *  (spec §2). Null when no header carried a usable one — the bucket then
   *  falls to the link token, never to nothing (R-CA). */
  ip?: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A filename safe to sit at the END of a storage key. Every earlier segment is
 * a uuid by construction, so this is the only free text in the path and it
 * never reaches a policy's uuid cast (spec §4 — the trap project-documents
 * fell into).
 */
export function sanitizeFilename(name: string): string {
  const base = (name ?? "").split(/[/\\]/).pop() ?? "";
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 120);
  return clean || "document";
}

/**
 * THE FILE LANDED AND THE ROW DID NOT, SO THE FILE GOES (W4 r8 MAJOR-1/F3).
 *
 * The spec's order puts the object in the bucket before the row is written
 * (§5.2 → §5.3), so every failure of the write leaves an object no row points
 * at, under a fresh upload id each retry. QA found one sitting in
 * `compliance-documents` from a single reversed date, with no row anywhere
 * pointing at it. Nothing but this call can collect them: the firm has no
 * delete door and the studio's queue reads rows.
 *
 * A removal that itself fails is logged and swallowed — the firm is owed the
 * true answer about its document, not a second failure about housekeeping.
 */
async function discardUpload(deps: PaperworkDeps, key: string): Promise<void> {
  try {
    const { error } = await deps.supabase.storage
      .from("compliance-documents")
      .remove([key]);
    if (error) {
      console.error("paperwork-upload: orphan left in the bucket", key, error.message);
    }
  } catch (err) {
    console.error(
      "paperwork-upload: orphan left in the bucket",
      key,
      err instanceof Error ? err.message : String(err),
    );
  }
}

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]{2,45}$/;

/**
 * THE ADDRESS IS CALLER-SUPPLIED, SO IT IS VALIDATED BEFORE IT IS BELIEVED
 * (R-CA, W4 r10 MAJOR-2).
 *
 * `cf-connecting-ip` and `x-forwarded-for` are both writable by anyone on a
 * `verify_jwt = false` door. Passed through raw, `not-an-ip` reached
 * `paperwork_link_rate_limit_hit(p_ip inet)` and raised 22P02; the limiter
 * swallowed the error and answered "within limit", so one header switched the
 * door's only abuse control off. `1.2.3.4:5678` did the same by accident — an
 * `ip:port` forwarded-for value is what some proxies emit.
 *
 * So: the port is stripped from an `ip:port` or `[v6]:port` value and the rest
 * must read as a v4 or v6 address. Anything else is not an address, and the
 * caller is bucketed by the link it is knocking on instead (see below) — never
 * waved through.
 */
export function normalizeCallerIp(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  // [2001:db8::1]:443 → 2001:db8::1
  const bracketed = /^\[([0-9a-fA-F:.]+)\](?::\d{1,5})?$/.exec(value);
  const candidate = bracketed
    ? bracketed[1]
    // 1.2.3.4:5678 → 1.2.3.4. A bare v6 address has many colons and no port.
    : /^[0-9.]+:\d{1,5}$/.test(value)
      ? value.slice(0, value.lastIndexOf(":"))
      : value;

  if (IPV4_PATTERN.test(candidate)) return candidate;
  // A v6 address: hex groups and colons, at least one colon, never two dots
  // (a v4-mapped tail is allowed and Postgres parses it).
  if (candidate.includes(":") && IPV6_PATTERN.test(candidate.replace(/\./g, ""))) {
    return candidate;
  }
  return null;
}

/** Cloudflare's own header first; the proxy chain's first hop otherwise. Both
 *  are validated — a header that is not an address yields null, and the bucket
 *  falls to the link token instead. */
export function callerIp(headers: Headers): string | null {
  const direct = normalizeCallerIp(headers.get("cf-connecting-ip"));
  if (direct) return direct;
  return normalizeCallerIp(headers.get("x-forwarded-for")?.split(",")[0]);
}

/**
 * One rolling-minute bucket, shared by BOTH calls so volume cannot be split
 * across them (spec §2).
 *
 * THE DOOR FAILS CLOSED (R-CA). The old rule — "a limiter that cannot be read
 * lets the request through" — made the limiter optional for anyone who could
 * make it fail, which on this door is everyone: an `inet` parameter and a
 * caller-written header is all it took. An unreadable limiter is now a
 * refusal, and a caller with no usable address is bucketed by the link's row
 * id (the RPC resolves it from the token; the token itself never lands in a
 * table) rather than left unbucketed.
 */
export async function withinRateLimit(
  deps: PaperworkDeps,
  token: string | null,
): Promise<boolean> {
  const { data, error } = await deps.supabase.rpc(
    "paperwork_link_rate_limit_hit",
    { p_ip: deps.ip ?? null, p_token: token && TOKEN_PATTERN.test(token) ? token : null },
  );
  if (error) {
    console.error("paperwork-upload: rate limit unavailable", error.message);
    return false;
  }
  return data !== false;
}

/** The page's read. Any refusal is the same `{ valid: false }` (spec §3). */
export async function getPaperworkContext(
  deps: PaperworkDeps,
  token: string,
): Promise<Record<string, unknown>> {
  if (!TOKEN_PATTERN.test(token)) return { valid: false };
  const { data, error } = await deps.supabase.rpc("resolve_paperwork_link", {
    p_token: token,
    p_record_use: true,
  });
  if (error || !data) return { valid: false };
  return { valid: true, ...(data as Record<string, unknown>) };
}

interface UploadFields {
  token: string;
  doc_type: string;
  doc_label?: string | null;
  number?: string | null;
  issuer?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
}

/**
 * Validate the token, put the file in the bucket, then record the document.
 *
 * The order is the spec's (§5.2 → §5.3): a file that never lands writes no row,
 * and a row is only ever written by the RPC, which re-verifies the token
 * itself. Nothing here ever updates an existing document — the never-overwrite
 * rule (§5.4) lives in the RPC, which only ever INSERTs.
 */
export async function uploadPaperwork(
  deps: PaperworkDeps,
  fields: UploadFields,
  file: File,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!TOKEN_PATTERN.test(fields.token)) {
    return { status: 403, body: { error: "invalid or expired token" } };
  }
  if (!(DOC_TYPES as readonly string[]).includes(fields.doc_type)) {
    return { status: 400, body: { error: "unknown document type" } };
  }
  if (
    fields.doc_type === "other_named" &&
    !(fields.doc_label ?? "").trim()
  ) {
    return { status: 400, body: { error: "name the document" } };
  }
  if (
    (DATED_DOC_TYPES as readonly string[]).includes(fields.doc_type) &&
    !(fields.expires_on ?? "").trim()
  ) {
    return { status: 400, body: { error: "give the date it expires" } };
  }
  // TWO DATES THE WRONG WAY ROUND ARE A TYPO, AND THE FIRM IS TOLD SO HERE
  // (W4 r8 MAJOR-1/F3). Both are bare date inputs on the firm's page: reversing
  // them raised 00623's dates CHECK inside the write, after the file had
  // already landed, and the door answered with a sentence about the token. The
  // common case now never reaches the bucket at all.
  const issuedOn = (fields.issued_on ?? "").trim();
  const expiresOn = (fields.expires_on ?? "").trim();
  if (
    ISO_DATE.test(issuedOn) && ISO_DATE.test(expiresOn) && expiresOn < issuedOn
  ) {
    return { status: 400, body: { error: REVERSED_DATES_MESSAGE } };
  }

  const contentType = file.type || "application/octet-stream";
  if (!(ALLOWED_MIME as readonly string[]).includes(contentType)) {
    return { status: 400, body: { error: "send a PDF, a JPEG or a PNG" } };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { status: 400, body: { error: "that file is over 15 MB" } };
  }

  // The studio and the firm come from the TOKEN. Nothing the browser sent is
  // consulted for either (spec acceptance 3).
  const { data: ctx, error: ctxError } = await deps.supabase.rpc(
    "paperwork_link_storage_context",
    { p_token: fields.token },
  );
  const rows = (ctx ?? []) as Array<
    { organization_id: string; company_id: string }
  >;
  const scope = Array.isArray(rows) ? rows[0] : undefined;
  if (ctxError || !scope) {
    return { status: 403, body: { error: "invalid or expired token" } };
  }

  // Every segment before the filename is a real uuid (spec §4). The third is an
  // UPLOAD id, not the document id: the document does not exist until the RPC
  // below writes it, and a key cannot name a row that is not there yet.
  const uploadId = crypto.randomUUID();
  const key =
    `${scope.organization_id}/${scope.company_id}/${uploadId}/${
      sanitizeFilename(file.name ?? "")
    }`;

  const { error: uploadError } = await deps.supabase.storage
    .from("compliance-documents")
    .upload(key, file, { contentType, upsert: false });
  if (uploadError) {
    return { status: 500, body: { error: `upload failed: ${uploadError.message}` } };
  }

  const { data, error } = await deps.supabase.rpc(
    "record_inbound_compliance_document",
    {
      p_token: fields.token,
      p_doc_type: fields.doc_type,
      p_doc_label: fields.doc_label ?? null,
      p_number: fields.number ?? null,
      p_issuer: fields.issuer ?? null,
      p_issued_on: fields.issued_on || null,
      p_expires_on: fields.expires_on || null,
      p_file_path: key,
    },
  );
  if (error) {
    // NOTHING WAS RECORDED, SO NOTHING IS KEPT: the object is an orphan on
    // every arm below, and this is the only call that can collect it.
    await discardUpload(deps, key);

    // The token can die between the context read and this call — a narrow
    // TOCTOU window the RPC closes by re-verifying. That is a 4xx, not a 500,
    // and it is the ONLY error that may be answered with a sentence about the
    // token (W4 r8 MAJOR-1/F3). Every other error used to be answered with the
    // same sentence: a firm that reversed two dates was told the one thing it
    // could not fix about the one thing that was fine, and the act was
    // unreachable for good — a second link would fail identically.
    if (/paperwork_token_invalid/i.test(error.message)) {
      return { status: 403, body: { error: "invalid or expired token" } };
    }
    if (/studio_compliance_documents_dates_check/i.test(error.message)) {
      return { status: 400, body: { error: REVERSED_DATES_MESSAGE } };
    }
    // A malformed date (22007), an over-length label (22001), any other
    // constraint: the firm is told plainly that Patina failed, because that is
    // what happened, and the studio's log carries the reason.
    console.error("paperwork-upload: record failed", error.message);
    return {
      status: 500,
      body: { error: "we could not record that — try again" },
    };
  }

  return { status: 200, body: { success: true, document_id: data } };
}

/** Entry point, dispatched by Content-Type. Returns a plain Response; index.ts
 *  merges CORS onto it. */
export async function handlePaperwork(
  deps: PaperworkDeps,
  req: Request,
): Promise<Response> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ valid: false });
    }
    // THE PAYLOAD IS READ BEFORE THE BUCKET IS CLAIMED, and nothing else is.
    // The token is what a caller with no usable address is bucketed by
    // (R-CA), so the bucket cannot be claimed until it is known. No row is
    // read and no object is written above this line.
    const token = typeof body.token === "string" ? body.token : "";
    if (!(await withinRateLimit(deps, token))) {
      return jsonResponse({ error: "too many attempts" }, 429);
    }
    if (body.action !== "context") {
      return jsonResponse({ error: "unknown action" }, 400);
    }
    return jsonResponse(await getPaperworkContext(deps, token));
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const str = (key: string): string =>
      typeof form.get(key) === "string" ? String(form.get(key)) : "";
    const token = str("token");
    if (!(await withinRateLimit(deps, token))) {
      return jsonResponse({ error: "too many attempts" }, 429);
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonResponse({ error: "no file provided" }, 400);
    }
    const result = await uploadPaperwork(deps, {
      token,
      doc_type: str("doc_type"),
      doc_label: str("doc_label") || null,
      number: str("number") || null,
      issuer: str("issuer") || null,
      issued_on: str("issued_on") || null,
      expires_on: str("expires_on") || null,
    }, file);
    return jsonResponse(result.body, result.status);
  }

  // Neither shape carries a token, so there is nothing to bucket by but the
  // address; the claim still happens, so a flood of junk content types counts.
  await withinRateLimit(deps, null);
  return jsonResponse({ error: "unsupported content type" }, 400);
}

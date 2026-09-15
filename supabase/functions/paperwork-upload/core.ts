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
    };
  };
}

export interface PaperworkDeps {
  supabase: PaperworkSupabaseLike;
  /** The caller's address, for the shared per-IP bucket (spec §2). */
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

/** One rolling-minute bucket per IP, shared by BOTH calls so volume cannot be
 *  split across them (spec §2). A limiter that cannot be read lets the request
 *  through: this is friction on guessing, not the credential. */
export async function withinRateLimit(deps: PaperworkDeps): Promise<boolean> {
  if (!deps.ip) return true;
  const { data, error } = await deps.supabase.rpc(
    "paperwork_link_rate_limit_hit",
    { p_ip: deps.ip },
  );
  if (error) {
    console.error("paperwork-upload: rate limit unavailable", error.message);
    return true;
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
    // The token can die between the context read and this call — a narrow
    // TOCTOU window the RPC closes by re-verifying. That is a 4xx, not a 500.
    const status = /paperwork_token_invalid/i.test(error.message) ? 403 : 400;
    return { status, body: { error: "invalid or expired token" } };
  }

  return { status: 200, body: { success: true, document_id: data } };
}

/** Entry point, dispatched by Content-Type. Returns a plain Response; index.ts
 *  merges CORS onto it. */
export async function handlePaperwork(
  deps: PaperworkDeps,
  req: Request,
): Promise<Response> {
  if (!(await withinRateLimit(deps))) {
    return jsonResponse({ error: "too many attempts" }, 429);
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ valid: false });
    }
    if (body.action !== "context") {
      return jsonResponse({ error: "unknown action" }, 400);
    }
    const token = typeof body.token === "string" ? body.token : "";
    return jsonResponse(await getPaperworkContext(deps, token));
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonResponse({ error: "no file provided" }, 400);
    }
    const str = (key: string): string =>
      typeof form.get(key) === "string" ? String(form.get(key)) : "";
    const result = await uploadPaperwork(deps, {
      token: str("token"),
      doc_type: str("doc_type"),
      doc_label: str("doc_label") || null,
      number: str("number") || null,
      issuer: str("issuer") || null,
      issued_on: str("issued_on") || null,
      expires_on: str("expires_on") || null,
    }, file);
    return jsonResponse(result.body, result.status);
  }

  return jsonResponse({ error: "unsupported content type" }, 400);
}

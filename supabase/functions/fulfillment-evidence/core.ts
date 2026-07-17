// fulfillment-evidence/core.ts — the client evidence-upload flow (S7).
//
// A designer mints a one-time evidence-upload token against an exception via
// fulfillment_mint_evidence_token (admin surface, not this file's concern).
// The client-portal /evidence/[token] page and its browser-side uploader hit
// THIS function directly (no session — the token IS the authority), which is
// why it's browser-facing: verify_jwt = false (config.toml) + CORS, mirroring
// fulfillment-po's public-token posture. The two RPCs this file calls
// (fulfillment_evidence_token_context, fulfillment_append_evidence) are
// SECURITY DEFINER and GRANTed to service_role ONLY (00364) — the browser
// never gets DB access, only this function's mediated surface.
//
// Two behaviors dispatched by request Content-Type (both POST):
//   application/json        { action: 'context', token }
//     -> the token's context jsonb verbatim: { valid, exception_id,
//        exception_type, order_no, item_name, already_uploaded, expires_at }
//        or { valid: false }. Lets the page show "order #… / item name"
//        before the uploader renders.
//   multipart/form-data     fields: token, one or more `files`
//     -> validates the token (context RPC), uploads each file to
//        project-documents at fulfillment/evidence/{exception_id}/{uuid}.{ext},
//        then calls fulfillment_append_evidence(token, keys, 'client').
//        Returns { success: true, added, keys }.
//
// All logic lives here (pure + injectable) so the Deno test drives it with a
// fake supabase — no live stack, no network (fulfillment-notify/core.ts idiom).
// index.ts only builds the real service-role client and wires CORS.

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

// ── The narrow Supabase surface this module needs (satisfied by both the
// real supabase-js client and _tests/fake-supabase.ts). ─────────────────────
export interface EvidenceRpcResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}
export interface EvidenceUploadResult {
  data: unknown;
  error: { message: string } | null;
}
export interface EvidenceSupabaseLike {
  rpc(name: string, args?: Record<string, unknown>): Promise<EvidenceRpcResult>;
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Blob | ArrayBuffer | Uint8Array | File,
        opts?: { contentType?: string; upsert?: boolean },
      ): Promise<EvidenceUploadResult>;
    };
  };
}

export interface EvidenceDeps {
  supabase: EvidenceSupabaseLike;
}

export interface EvidenceContext {
  valid: boolean;
  exception_id?: string;
  exception_type?: string;
  order_no?: number;
  item_name?: string | null;
  already_uploaded?: number;
  expires_at?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Extract a lowercase, sanitized extension from a filename. Defaults to 'jpg'
 *  when the name has no dot (not just an empty piece after sanitizing) —
 *  a dot-less name like "noext" is not itself a usable extension. */
function sanitizeExt(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const raw = dotIndex >= 0 ? filename.slice(dotIndex + 1) : '';
  const clean = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean || 'jpg';
}

/** Resolve a token's client-safe context via fulfillment_evidence_token_context.
 *  Any RPC error is treated as an invalid token (never leaks the DB error). */
export async function getEvidenceContext(deps: EvidenceDeps, token: string): Promise<EvidenceContext> {
  const { data, error } = await deps.supabase.rpc('fulfillment_evidence_token_context', { p_token: token });
  if (error || !data) return { valid: false };
  return data as EvidenceContext;
}

/** Validate the token, upload each file to project-documents, then append the
 *  resulting keys onto the exception via fulfillment_append_evidence. */
export async function uploadEvidence(
  deps: EvidenceDeps,
  token: string,
  files: File[],
): Promise<{ status: number; body: Record<string, unknown> }> {
  const ctx = await getEvidenceContext(deps, token);
  if (!ctx.valid || !ctx.exception_id) {
    return { status: 403, body: { error: 'invalid or expired token' } };
  }
  if (files.length === 0) {
    return { status: 400, body: { error: 'no files provided' } };
  }

  const keys: string[] = [];
  for (const file of files) {
    const ext = sanitizeExt(file.name ?? '');
    const key = `fulfillment/evidence/${ctx.exception_id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await deps.supabase.storage.from('project-documents').upload(key, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (uploadError) {
      return { status: 500, body: { error: `upload failed: ${uploadError.message}` } };
    }
    keys.push(key);
  }

  const { data, error } = await deps.supabase.rpc('fulfillment_append_evidence', {
    p_token: token,
    p_keys: keys,
    p_actor: 'client',
  });
  if (error) {
    // fulfillment_append_evidence RAISEs 'invalid or expired token' when the
    // token expired/was revoked between the context check and this call (a
    // narrow TOCTOU window) — surface as a 4xx, not a 500.
    const status = /invalid or expired token/i.test(error.message) ? 403 : 400;
    return { status, body: { error: error.message } };
  }
  const result = (data ?? {}) as { exception_id?: string; added?: number };
  return { status: 200, body: { success: true, added: result.added ?? keys.length, keys } };
}

/** Entry point dispatched by Content-Type. Returns a plain Response (no CORS
 *  headers — index.ts merges those in for both the real server and any
 *  future caller of this function). */
export async function handleEvidence(deps: EvidenceDeps, request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonResponse({ error: 'invalid multipart body' }, 400);
    }
    const token = form.get('token');
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      return jsonResponse({ error: 'invalid token format' }, 400);
    }
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return jsonResponse({ error: 'no files provided' }, 400);
    }
    const result = await uploadEvidence(deps, token, files);
    return jsonResponse(result.body, result.status);
  }

  // Default: JSON { action: 'context', token }.
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400);
  }
  if (payload.action !== 'context') {
    return jsonResponse({ error: "action must be 'context' for a JSON request" }, 400);
  }
  const token = payload.token;
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    return jsonResponse({ error: 'invalid token format' }, 400);
  }
  const ctx = await getEvidenceContext(deps, token);
  return jsonResponse(ctx, 200);
}

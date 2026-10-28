import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bucketName = "service-acceptance-paper";
const pageSize = 100;
const maxPages = 20;

interface Projection {
  projectId: string;
  requests: { requestId: string; paperIntakes?: { intakeId: string }[] }[];
}
interface Intake {
  storage_object_id: string;
  storage_object_version: string;
  storage_object_etag: string;
}
interface Clients {
  caller(authorization: string): SupabaseClient;
  service(): SupabaseClient;
}
class Refusal extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authorizedRequest(
  projection: Projection,
  projectId: string,
  intakeId: string,
): string {
  if (
    projection?.projectId !== projectId || !Array.isArray(projection.requests)
  ) throw new Refusal("forbidden", 403);
  const request = projection.requests.find((r) =>
    Array.isArray(r.paperIntakes) &&
    r.paperIntakes.some((i) => i.intakeId === intakeId)
  );
  if (!request?.requestId) throw new Refusal("forbidden", 403);
  return request.requestId;
}

async function objectPath(
  admin: SupabaseClient,
  projectId: string,
  objectId: string,
): Promise<string> {
  const bucket = admin.storage.from(bucketName);
  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await bucket.list(projectId, {
      limit: pageSize,
      offset: page * pageSize,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const object = data?.find((entry) => entry.id === objectId);
    if (object) {
      if (!/^[0-9a-f-]+\.pdf$/i.test(object.name)) {
        throw new Refusal("paper_document_changed", 409);
      }
      return `${projectId}/${object.name}`;
    }
    if (!data || data.length < pageSize) break;
  }
  throw new Refusal("paper_document_not_found", 404);
}

async function requireIdentity(
  admin: SupabaseClient,
  path: string,
  intake: Intake,
): Promise<void> {
  const { data, error } = await admin.storage.from(bucketName).info(path);
  if (error) throw error;
  if (
    !data || data.id !== intake.storage_object_id ||
    data.version !== intake.storage_object_version ||
    data.etag !== intake.storage_object_etag
  ) throw new Refusal("paper_document_changed", 409);
}

function stampRefusal(error: { code?: string; message: string }): never {
  if (error.code === "42501" || error.message === "scope_editions_inactive") {
    throw new Refusal("service_acceptance_inactive", 403);
  }
  const statuses: Record<string, number> = {
    request_not_open: 409,
    paper_document_hash_invalid: 400,
    paper_document_changed: 409,
    paper_document_hash_conflict: 409,
  };
  if (statuses[error.message]) {
    throw new Refusal(error.message, statuses[error.message]);
  }
  throw error;
}

async function stamp(
  admin: SupabaseClient,
  intakeId: string,
  requestId: string,
  projectId: string,
) {
  const { data: intake, error } = await admin.from(
    "service_acceptance_paper_intakes",
  )
    .select(
      "id,request_id,storage_object_id,storage_object_version,storage_object_etag",
    )
    .eq("id", intakeId).eq("request_id", requestId).single();
  if (error) throw error;
  if (!intake) throw new Refusal("paper_intake_not_found", 404);
  const path = await objectPath(admin, projectId, intake.storage_object_id);
  await requireIdentity(admin, path, intake);
  const { data: file, error: downloadError } = await admin.storage.from(
    bucketName,
  ).download(path);
  if (downloadError) throw downloadError;
  if (!file || file.size < 1 || file.size > 20971520) {
    throw new Refusal("paper_document_invalid", 400);
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const documentSha256 = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  await requireIdentity(admin, path, intake);
  const result = await admin.rpc("stamp_service_acceptance_paper_hash", {
    p_intake_id: intakeId,
    p_document_sha256: documentSha256,
    p_object_version: intake.storage_object_version,
    p_object_etag: intake.storage_object_etag,
  });
  if (result.error) stampRefusal(result.error);
  return { intakeId, documentSha256, replayed: result.data.replayed === true };
}

export function createPaperHashHandler(
  clients: Clients,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") return json({ code: "method_not_allowed" }, 405);
    try {
      const authorization = req.headers.get("Authorization");
      if (!authorization?.match(/^Bearer\s+\S+$/i)) {
        throw new Refusal("unauthorized", 401);
      }
      const caller = clients.caller(authorization);
      const { data, error } = await caller.auth.getUser();
      if (error || !data.user) throw new Refusal("unauthorized", 401);
      let body;
      try {
        body = await req.json();
      } catch {
        throw new Refusal("invalid_request", 400);
      }
      if (
        !body || typeof body.projectId !== "string" ||
        typeof body.intakeId !== "string" ||
        !uuid.test(body.projectId) || !uuid.test(body.intakeId)
      ) throw new Refusal("invalid_request", 400);
      const projection = await caller.rpc("get_project_service_acceptance", {
        p_project_id: body.projectId,
      });
      if (projection.error) throw new Refusal("forbidden", 403);
      const requestId = authorizedRequest(
        projection.data,
        body.projectId,
        body.intakeId,
      );
      return json(
        await stamp(
          clients.service(),
          body.intakeId,
          requestId,
          body.projectId,
        ),
      );
    } catch (error) {
      if (error instanceof Refusal) {
        return json({ code: error.code }, error.status);
      }
      return json({ code: "paper_hash_failed" }, 500);
    }
  };
}

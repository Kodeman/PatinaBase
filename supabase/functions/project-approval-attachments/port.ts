// The one real AttachmentsPort: the caller's JWT for get_project_decision_edition, the
// service role for the resolver, the recorder (through PostgREST, §C.3.1 N1) and the
// project-approval-editions bucket.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type AttachmentsPort, EDITIONS_BUCKET, type StoredObject } from "./lib.ts";

export interface PortConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function buildPort(config: PortConfig, authorization: string): AttachmentsPort {
  const caller = createClient(config.url, config.anonKey, {
    ...noSession,
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(config.url, config.serviceRoleKey, noSession);
  const editions = () => admin.storage.from(EDITIONS_BUCKET);
  return {
    getEdition: async (decisionId) =>
      await caller.rpc("get_project_decision_edition", { p_decision_id: decisionId }),
    resolveObjects: async (decisionId) =>
      await admin.rpc("project_approval_attachment_objects", { p_decision_id: decisionId }),
    copyToStaging: async (source, stagingPath) => {
      const result = await admin.storage.from(source.bucket).copy(source.path, stagingPath, {
        destinationBucket: EDITIONS_BUCKET,
      });
      return !result.error;
    },
    openObject: async (path) => {
      const signed = await editions().createSignedUrl(path, 60);
      if (signed.error || !signed.data?.signedUrl) return null;
      const response = await fetch(signed.data.signedUrl);
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        return null;
      }
      return {
        stream: response.body,
        contentType: response.headers.get("content-type")?.split(";")[0].trim() ?? null,
      };
    },
    move: async (fromPath, toPath) => !(await editions().move(fromPath, toPath)).error,
    remove: async (paths) => {
      const result = await editions().remove(paths);
      if (result.error) {
        console.error("project-approval-attachments: remove failed", result.error.message);
      }
    },
    record: async (args) => await admin.rpc("record_project_approval_edition_object", args),
    list: async (prefix) => {
      const objects: StoredObject[] = [];
      let cursor: string | undefined;
      do {
        const page = await editions().listV2({ prefix, cursor, limit: 1000 });
        if (page.error || !page.data) return null;
        for (const object of page.data.objects) {
          const createdAtMs = Date.parse(object.created_at);
          objects.push({
            path: object.key ?? object.name,
            // An unreadable timestamp is treated as brand new: never swept.
            createdAtMs: Number.isNaN(createdAtMs) ? Date.now() : createdAtMs,
          });
        }
        cursor = page.data.hasNext ? page.data.nextCursor : undefined;
      } while (cursor);
      return objects;
    },
    sign: (paths, expiresIn) => editions().createSignedUrls(paths, expiresIn),
    newAttemptId: () => crypto.randomUUID(),
    now: () => Date.now(),
  };
}

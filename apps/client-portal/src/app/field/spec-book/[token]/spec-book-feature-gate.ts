import "server-only";

import { createServiceClient } from "@patina/supabase/server";
import { PostHog } from "posthog-node";

export const SPEC_BOOK_WORKSPACE_FLAG = "spec-book-workspace-pilot";

const DEFAULT_FLAG_TIMEOUT_MS = 1_200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ServiceClient = ReturnType<typeof createServiceClient>;

interface ArtifactIdentityRow {
  revision_id: string;
}

interface RevisionIdentityRow {
  created_by: string;
  spec_book_id: string;
}

interface BookIdentityRow {
  project_id: string;
}

interface ProjectIdentityRow {
  studio_id: string | null;
}

interface SpecBookFlagIdentity {
  distinctId: string;
  studioId: string | null;
}

export interface SpecBookFeatureFlagClient {
  isFeatureEnabled(
    key: string,
    distinctId: string,
    options?: {
      groups?: Record<string, string>;
      personProperties?: Record<string, string>;
      sendFeatureFlagEvents?: boolean;
      disableGeoip?: boolean;
    },
  ): Promise<boolean | undefined>;
  shutdown(timeoutMs?: number): Promise<void>;
}

export interface SpecBookFeatureGateOptions {
  createPostHogClient?: (
    apiKey: string,
    host: string,
    timeoutMs: number,
  ) => SpecBookFeatureFlagClient;
  nodeEnv?: string;
  overrideRaw?: string;
  posthogHost?: string;
  posthogKey?: string;
  timeoutMs?: number;
}

function singleRowQuery<T>(
  client: ServiceClient,
  table:
    | "spec_book_artifacts"
    | "spec_book_revisions"
    | "spec_books"
    | "projects",
  columns: string,
  id: string,
): Promise<{ data: T | null; error: unknown }> {
  return client
    .from(table)
    .select(columns)
    .eq("id", id)
    .maybeSingle() as unknown as Promise<{ data: T | null; error: unknown }>;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseSpecBookFlagOverride(
  raw: string | undefined = process.env.NEXT_PUBLIC_FLAG_OVERRIDES,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean | undefined {
  // Overrides exist solely for local/test runners. Production rollback must
  // always consult PostHog and cannot be pinned accidentally at build time.
  if (nodeEnv === "production" || !raw) return undefined;

  for (const entry of raw.split(",")) {
    const colonIndex = entry.indexOf(":");
    if (colonIndex === -1) continue;
    const name = entry.slice(0, colonIndex).trim();
    const value = entry.slice(colonIndex + 1).trim();
    if (name === SPEC_BOOK_WORKSPACE_FLAG) return value === "true";
  }
  return undefined;
}

async function loadFlagIdentity(
  artifactId: string,
  client: ServiceClient,
): Promise<SpecBookFlagIdentity | null> {
  const { data: artifact, error: artifactError } =
    await singleRowQuery<ArtifactIdentityRow>(
      client,
      "spec_book_artifacts",
      "revision_id",
      artifactId,
    );
  if (artifactError || !artifact || !validUuid(artifact.revision_id)) {
    return null;
  }

  const { data: revision, error: revisionError } =
    await singleRowQuery<RevisionIdentityRow>(
      client,
      "spec_book_revisions",
      "created_by, spec_book_id",
      artifact.revision_id,
    );
  if (
    revisionError ||
    !revision ||
    !validUuid(revision.created_by) ||
    !validUuid(revision.spec_book_id)
  ) {
    return null;
  }

  const { data: book, error: bookError } =
    await singleRowQuery<BookIdentityRow>(
      client,
      "spec_books",
      "project_id",
      revision.spec_book_id,
    );
  if (bookError || !book || !validUuid(book.project_id)) return null;

  const { data: project, error: projectError } =
    await singleRowQuery<ProjectIdentityRow>(
      client,
      "projects",
      "studio_id",
      book.project_id,
    );
  if (
    projectError ||
    !project ||
    (project.studio_id !== null && !validUuid(project.studio_id))
  ) {
    return null;
  }

  return {
    distinctId: revision.created_by,
    studioId: project.studio_id,
  };
}

function defaultPostHogClient(
  apiKey: string,
  host: string,
  timeoutMs: number,
): SpecBookFeatureFlagClient {
  return new PostHog(apiKey, {
    host,
    requestTimeout: timeoutMs,
    featureFlagsRequestTimeoutMs: timeoutMs,
    fetchRetryCount: 0,
    disableGeoip: true,
  });
}

async function evaluateFlag(
  identity: SpecBookFlagIdentity,
  options: SpecBookFeatureGateOptions,
): Promise<boolean> {
  const apiKey =
    options.posthogKey ?? process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  if (!apiKey.trim()) return false;

  const host =
    options.posthogHost ??
    process.env.NEXT_PUBLIC_POSTHOG_HOST ??
    "https://us.i.posthog.com";
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_FLAG_TIMEOUT_MS);
  const createClient = options.createPostHogClient ?? defaultPostHogClient;
  let client: SpecBookFeatureFlagClient | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    client = createClient(apiKey, host, timeoutMs);
    const timedOut = new Promise<undefined>((resolve) => {
      timeout = setTimeout(() => resolve(undefined), timeoutMs);
    });
    const evaluation = client.isFeatureEnabled(
      SPEC_BOOK_WORKSPACE_FLAG,
      identity.distinctId,
      {
        groups: identity.studioId ? { studio: identity.studioId } : undefined,
        personProperties: identity.studioId
          ? { studio_id: identity.studioId }
          : undefined,
        sendFeatureFlagEvents: false,
        disableGeoip: true,
      },
    );
    return (await Promise.race([evaluation, timedOut])) === true;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (client) {
      try {
        await client.shutdown(100);
      } catch {
        // The decision already failed closed; shutdown must not change it.
      }
    }
  }
}

export async function isSpecBookGuestEntryEnabled(
  artifactId: string,
  client: ServiceClient,
  options: SpecBookFeatureGateOptions = {},
): Promise<boolean> {
  if (!validUuid(artifactId)) return false;

  const override = parseSpecBookFlagOverride(
    options.overrideRaw,
    options.nodeEnv,
  );
  if (override !== undefined) return override;

  const apiKey =
    options.posthogKey ?? process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  if (!apiKey.trim()) return false;

  try {
    const identity = await loadFlagIdentity(artifactId, client);
    if (!identity) return false;
    return await evaluateFlag(identity, { ...options, posthogKey: apiKey });
  } catch {
    return false;
  }
}

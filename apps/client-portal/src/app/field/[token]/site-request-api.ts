import type { SiteRequestBootstrapDTO } from "./site-request-types";

export interface SiteRequestApiOptions {
  baseUrl?: string;
  anonKey?: string;
  fetchImpl?: typeof fetch;
}

export interface SiteRequestUploadIntent {
  mediaId: string;
  deliverableId: string;
  bucketId: string;
  objectPath: string;
  uploadUrl: string;
  uploadToken: string;
}

export class SiteRequestApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

function config(options: SiteRequestApiOptions) {
  const baseUrl = (
    options.baseUrl ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  ).replace(/\/$/, "");
  const anonKey =
    options.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!baseUrl || !anonKey)
    throw new SiteRequestApiError(500, "site_request_api_not_configured");
  return { baseUrl, anonKey, fetchImpl: options.fetchImpl ?? fetch };
}

export async function requestSiteRequestGuest<T>(
  token: string,
  action: "bootstrap" | "upload-intent" | "receipt" | "deliver",
  body: Record<string, unknown> = {},
  options: SiteRequestApiOptions = {},
): Promise<T> {
  const { baseUrl, anonKey, fetchImpl } = config(options);
  const response = await fetchImpl(
    `${baseUrl}/functions/v1/site-request-guest/${action}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new SiteRequestApiError(
      response.status,
      typeof payload.error === "string"
        ? payload.error
        : "site_request_request_failed",
    );
  }
  return payload as T;
}

export async function bootstrapSiteRequest(
  token: string,
  options: SiteRequestApiOptions = {},
): Promise<SiteRequestBootstrapDTO | null> {
  try {
    const payload = await requestSiteRequestGuest<{
      request: SiteRequestBootstrapDTO;
    }>(token, "bootstrap", {}, options);
    return payload.request;
  } catch (error) {
    if (
      error instanceof SiteRequestApiError &&
      (error.status === 401 || error.status === 404)
    )
      return null;
    throw error;
  }
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function uploadToSignedIntent(
  intent: SiteRequestUploadIntent,
  blob: Blob,
  filename: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", blob, filename);
  const response = await fetchImpl(intent.uploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body: form,
  });
  if (!response.ok)
    throw new SiteRequestApiError(response.status, "signed_upload_failed");
  return response.headers.get("etag") ?? undefined;
}

import type { EditableMoodBoardItem } from "@patina/types";
import type { ExtractedProduct } from "@patina/utils";

export type MoodBoardUrlUnfurlErrorCode =
  | "invalid_url"
  | "rate_limited"
  | "site_unavailable"
  | "unauthorized"
  | "temporarily_unavailable"
  | "unreadable";

export interface MoodBoardUrlUnfurlErrorDetails {
  code: MoodBoardUrlUnfurlErrorCode;
  edgeCode?: string | null;
  status?: number | null;
  retryAfterSeconds?: number | null;
  resetAt?: string | null;
}

/** Stable controller/UI error preserving the edge function's quota metadata. */
export class MoodBoardUrlUnfurlError extends Error {
  readonly code: MoodBoardUrlUnfurlErrorCode;
  readonly edgeCode: string | null;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;
  readonly resetAt: string | null;

  constructor(message: string, details: MoodBoardUrlUnfurlErrorDetails) {
    super(message);
    this.name = "MoodBoardUrlUnfurlError";
    this.code = details.code;
    this.edgeCode = details.edgeCode ?? null;
    this.status = details.status ?? null;
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;
    this.resetAt = details.resetAt ?? null;
  }
}

/** User-facing room notice used when a failed rich import is preserved as a note. */
export function moodBoardUrlFallbackNotice(error: unknown): string {
  const reason = error instanceof MoodBoardUrlUnfurlError
    ? error.message
    : "This site could not be added as a rich pin.";
  return `${reason} An editable note with the URL was added instead.`;
}

export interface MoodBoardUrlUnfurlResult {
  sourceUrl: string;
  host: string;
  name: string | null;
  brand: string | null;
  description: string | null;
  priceRetailCents: number | null;
  images: string[];
}

export interface MoodBoardUrlPlaceholderInput {
  id: string;
  url: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  zIndex?: number;
  rotation?: number;
  sectionId?: string | null;
}

export interface MoodBoardUrlResolutionInput {
  placeholder: EditableMoodBoardItem;
  url: string;
}

interface FunctionErrorContext {
  status?: unknown;
  headers?: { get?: (name: string) => string | null };
  json?: () => Promise<unknown>;
}

interface FunctionInvokeError {
  message?: unknown;
  context?: FunctionErrorContext;
}

interface EdgeErrorBody {
  error?: unknown;
  code?: unknown;
  rate_limit?: unknown;
}

interface RateLimitBody {
  reason?: unknown;
  limit?: unknown;
  remaining?: unknown;
  retry_after_seconds?: unknown;
  reset_at?: unknown;
}

const DEFAULT_PIN_WIDTH = 280;
const DEFAULT_PIN_HEIGHT = 320;

function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function finiteNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    value = Number(value);
  }
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function validTimestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Validate a board source URL without rewriting the provenance string. */
export function normalizeMoodBoardSourceUrl(rawUrl: string): string {
  const url = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MoodBoardUrlUnfurlError(
      "Paste a complete http or https product URL.",
      {
        code: "invalid_url",
        edgeCode: "invalid_url",
        status: 400,
      },
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname
  ) {
    throw new MoodBoardUrlUnfurlError(
      "Paste a complete http or https product URL.",
      {
        code: "invalid_url",
        edgeCode: "unsupported_scheme",
        status: 400,
      },
    );
  }
  return url;
}

/** Matches the composition provenance label: a bare host without leading www. */
export function moodBoardSourceHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function rateLimitMessage(
  resetAt: string | null,
  retryAfterSeconds: number | null,
): string {
  if (resetAt) return `URL import limit reached. Try again after ${resetAt}.`;
  if (retryAfterSeconds) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return `URL import limit reached. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return "URL import limit reached. Try again later.";
}

function messageForEdgeError(edgeCode: string | null): {
  code: MoodBoardUrlUnfurlErrorCode;
  message: string;
} {
  switch (edgeCode) {
    case "invalid_url":
    case "url_required":
    case "unsupported_scheme":
    case "blocked_host":
      return {
        code: "invalid_url",
        message: "Paste a public http or https product URL.",
      };
    case "unauthorized":
      return {
        code: "unauthorized",
        message: "Sign in again to add a product from a URL.",
      };
    case "not_html":
      return {
        code: "unreadable",
        message:
          "That link is not a readable product page. The URL was kept as a note.",
      };
    case "response_too_large":
      return {
        code: "unreadable",
        message:
          "That page is too large to read automatically. The URL was kept as a note.",
      };
    case "dns_resolution_failed":
    case "request_timeout":
    case "fetch_failed":
    case "redirect_without_location":
    case "too_many_redirects":
      return {
        code: "site_unavailable",
        message:
          "That site blocked or could not complete the request. The URL was kept as a note.",
      };
    case "quota_check_failed":
      return {
        code: "temporarily_unavailable",
        message:
          "URL import is temporarily unavailable. The URL was kept as a note.",
      };
    default:
      return {
        code: "unreadable",
        message: "That URL could not be read. The URL was kept as a note.",
      };
  }
}

/** Translate Supabase FunctionsHttpError without depending on its concrete class. */
export async function translateMoodBoardUrlUnfurlError(
  error: unknown,
): Promise<MoodBoardUrlUnfurlError> {
  if (error instanceof MoodBoardUrlUnfurlError) return error;

  const invokeError = record(error) as FunctionInvokeError | null;
  const context = invokeError?.context;
  const status = typeof context?.status === "number" ? context.status : null;
  let body: EdgeErrorBody | null = null;
  try {
    body = record(await context?.json?.()) as EdgeErrorBody | null;
  } catch {
    // A missing/malformed response body is translated using status and the
    // stable fallback below; the raw FunctionsHttpError is never shown.
  }

  const edgeCode = trimmedString(body?.code) ?? trimmedString(body?.error);
  const rateLimit = record(body?.rate_limit) as RateLimitBody | null;
  const retryAfterSeconds =
    positiveInteger(rateLimit?.retry_after_seconds) ??
    positiveInteger(context?.headers?.get?.("Retry-After"));
  const resetAt = validTimestamp(rateLimit?.reset_at);

  if (status === 429 || edgeCode === "url_unfurl_rate_limited") {
    return new MoodBoardUrlUnfurlError(
      rateLimitMessage(resetAt, retryAfterSeconds),
      {
        code: "rate_limited",
        edgeCode: edgeCode ?? "url_unfurl_rate_limited",
        status: status ?? 429,
        retryAfterSeconds,
        resetAt,
      },
    );
  }

  const translated = messageForEdgeError(edgeCode);
  return new MoodBoardUrlUnfurlError(translated.message, {
    code: translated.code,
    edgeCode,
    status,
  });
}

/** Validate and normalize the edge success payload for the controller shell. */
export function parseMoodBoardUrlUnfurlResult(
  payload: unknown,
  requestedUrl: string,
): MoodBoardUrlUnfurlResult {
  const requested = normalizeMoodBoardSourceUrl(requestedUrl);
  const value = record(payload);
  if (!value) {
    throw new MoodBoardUrlUnfurlError(
      "That URL returned an unreadable response. The URL was kept as a note.",
      { code: "unreadable", edgeCode: "invalid_response", status: 502 },
    );
  }

  const extracted = value as ExtractedProduct;
  const candidateSourceUrl = trimmedString(extracted.sourceUrl) ?? requested;
  const sourceUrl = moodBoardSourceHost(candidateSourceUrl)
    ? candidateSourceUrl
    : requested;
  const host = moodBoardSourceHost(sourceUrl) ?? moodBoardSourceHost(requested);
  const name = trimmedString(extracted.name);
  const brand = trimmedString(extracted.brand);
  const description = trimmedString(extracted.description);
  const priceRetailCents = finiteNonNegativeNumber(extracted.priceRetailCents);
  const images = Array.isArray(extracted.images)
    ? extracted.images
        .map(trimmedString)
        .filter((url): url is string => url !== null)
    : [];

  if (
    !host ||
    (!name &&
      !brand &&
      !description &&
      priceRetailCents === null &&
      images.length === 0)
  ) {
    throw new MoodBoardUrlUnfurlError(
      "That page did not expose product details. The URL was kept as a note.",
      { code: "unreadable", edgeCode: "no_product_metadata", status: 422 },
    );
  }

  return {
    sourceUrl,
    host,
    name,
    brand,
    description,
    priceRetailCents,
    images,
  };
}

/** Immediate optimistic item. Caller supplies the id so the command is replayable. */
export function buildMoodBoardUrlPlaceholder(
  input: MoodBoardUrlPlaceholderInput,
): EditableMoodBoardItem {
  const sourceUrl = normalizeMoodBoardSourceUrl(input.url);
  return {
    id: input.id,
    type: "capture",
    x: input.x,
    y: input.y,
    width: input.width ?? DEFAULT_PIN_WIDTH,
    height: input.height ?? DEFAULT_PIN_HEIGHT,
    zIndex: input.zIndex ?? 0,
    rotation: input.rotation ?? 0,
    locked: false,
    productId: null,
    captureId: null,
    paletteId: null,
    imageUrl: null,
    content: null,
    data: {
      source_url: sourceUrl,
      name: "Reading product page…",
      section_id: input.sectionId ?? null,
      unfurl_status: "pending",
    },
  };
}

/** Resolve the optimistic item in place, retaining its id, geometry and section. */
export function buildResolvedMoodBoardUrlItem(input: {
  placeholder: EditableMoodBoardItem;
  result: MoodBoardUrlUnfurlResult;
}): EditableMoodBoardItem {
  const { placeholder, result } = input;
  const imageUrl = result.images[0] ?? null;
  return {
    ...placeholder,
    type: "capture",
    productId: null,
    captureId: null,
    paletteId: null,
    imageUrl,
    imageKey: null,
    content: null,
    data: {
      ...(placeholder.data ?? {}),
      name: result.name ?? result.host,
      vendor_name: result.brand,
      price_cents: result.priceRetailCents,
      image_url: imageUrl,
      source_url: result.sourceUrl,
      description: result.description,
      unfurl_status: "resolved",
    },
  };
}

/** Deterministic failure conversion: same id/geometry, editable note, URL retained. */
export function buildMoodBoardUrlFallbackNote(
  input: MoodBoardUrlResolutionInput,
): EditableMoodBoardItem {
  const sourceUrl = normalizeMoodBoardSourceUrl(input.url);
  return {
    ...input.placeholder,
    type: "note",
    productId: null,
    captureId: null,
    paletteId: null,
    imageUrl: null,
    imageKey: null,
    content: sourceUrl,
    data: {
      ...(input.placeholder.data ?? {}),
      name: "Source link",
      image_url: null,
      source_url: sourceUrl,
      unfurl_status: "failed",
    },
  };
}

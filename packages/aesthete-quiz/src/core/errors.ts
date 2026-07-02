/**
 * Typed errors for the quiz wire client.
 *
 * The RPCs raise plpgsql exceptions; PostgREST maps them to HTTP + a JSON body
 * `{ code, message, details, hint }`. Two things matter to callers:
 *
 *  1. Rate limits arrive as HTTP 400 (ERRCODE P0001), NOT 429 — the in-DB
 *     backstop is a RAISE EXCEPTION. Classification is therefore message-based
 *     (patterns below are verbatim from migration 00243).
 *  2. Capability violations (session key owned by another account, claim
 *     without auth) use ERRCODE 42501 → HTTP 403.
 */

export type QuizErrorKind =
  | 'rate_limited'
  | 'invalid_answers'
  | 'forbidden'
  | 'unknown_session'
  | 'auth_required'
  | 'network'
  | 'server';

export interface PostgrestErrorBody {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

export class AestheteQuizError extends Error {
  readonly kind: QuizErrorKind;
  /** HTTP status, when a response was received. */
  readonly status?: number;
  /** Postgres/PostgREST error code (e.g. 'P0001', '42501', 'PGRST202'). */
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;

  constructor(
    kind: QuizErrorKind,
    message: string,
    extra: { status?: number; code?: string | null; details?: string | null; hint?: string | null } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.kind = kind;
    this.status = extra.status;
    this.code = extra.code ?? undefined;
    this.details = extra.details ?? undefined;
    this.hint = extra.hint ?? undefined;
  }
}

/** In-DB backstop tripped: 3/hour/session_key or 10/hour/IP (HTTP 400, not 429). */
export class QuizRateLimitError extends AestheteQuizError {
  constructor(message: string, extra?: ConstructorParameters<typeof AestheteQuizError>[2]) {
    super('rate_limited', message, extra);
  }
}

/** Malformed/incomplete answers, unknown Q1/Q3/Q4 option keys, or the 8 KB cap. */
export class QuizInvalidAnswersError extends AestheteQuizError {
  constructor(message: string, extra?: ConstructorParameters<typeof AestheteQuizError>[2]) {
    super('invalid_answers', message, extra);
  }
}

/** Bearer-capability violation: the session key belongs to another account. */
export class QuizForbiddenError extends AestheteQuizError {
  constructor(message: string, extra?: ConstructorParameters<typeof AestheteQuizError>[2]) {
    super('forbidden', message, extra);
  }
}

/** claim_quiz_session: no current profile exists for this session key. */
export class QuizUnknownSessionError extends AestheteQuizError {
  constructor(message: string, extra?: ConstructorParameters<typeof AestheteQuizError>[2]) {
    super('unknown_session', message, extra);
  }
}

/** The request never produced a usable HTTP response (DNS, CORS, abort, bad JSON). */
export class QuizNetworkError extends AestheteQuizError {
  constructor(message: string, extra?: ConstructorParameters<typeof AestheteQuizError>[2]) {
    super('network', message, extra);
  }
}

// Message patterns verbatim from 00243 (submit_style_quiz / claim_quiz_session
// / _compute_quiz_profile RAISE EXCEPTION strings).
const RATE_LIMIT_RE = /too many submissions|submitted \d+ times in the last hour/i;
const UNKNOWN_SESSION_RE = /unknown session_key/i;
const INVALID_ANSWERS_RE =
  /must carry visual_resonance|must be a jsonb object|lifestyle must be an array|unknown (visual_resonance|material|investment) option|exceeds the 8 KB limit|p_session_key is required/i;
const FORBIDDEN_RE = /belongs to another account|already claimed by another account|authentication required/i;

/**
 * Map an RPC error response to a typed error. Exported for tests and for
 * callers with their own transport.
 */
export function classifyRpcError(status: number, body: PostgrestErrorBody | null): AestheteQuizError {
  const message = body?.message ?? `Quiz RPC failed with HTTP ${status}`;
  const extra = { status, code: body?.code, details: body?.details, hint: body?.hint };

  if (RATE_LIMIT_RE.test(message)) return new QuizRateLimitError(message, extra);
  if (UNKNOWN_SESSION_RE.test(message)) return new QuizUnknownSessionError(message, extra);
  if (INVALID_ANSWERS_RE.test(message)) return new QuizInvalidAnswersError(message, extra);
  if (status === 401 || status === 403 || body?.code === '42501' || FORBIDDEN_RE.test(message)) {
    return new QuizForbiddenError(message, extra);
  }
  return new AestheteQuizError('server', message, extra);
}

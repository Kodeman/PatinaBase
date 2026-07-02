/**
 * Plain-fetch PostgREST wire client — ZERO runtime dependencies (no
 * supabase-js), so the external marketing repo can consume it as-is.
 *
 * The wire contract is the interface (design §7.1); the shipped shape is
 * migration 00243 and is documented verbatim in ../../WIRE-CONTRACT.md.
 *
 * Endpoints:
 *   POST {baseUrl}/rest/v1/rpc/submit_style_quiz     (anon or authenticated)
 *   POST {baseUrl}/rest/v1/rpc/claim_quiz_session    (authenticated only)
 *
 * Headers on every call: `apikey: <anon key>` plus
 * `Authorization: Bearer <user JWT, else the anon key>` — the standard
 * Kong/PostgREST pair (matches what supabase-js sends).
 */
import type {
  ClaimQuizSessionResult,
  StyleQuizAnswers,
  StyleQuizAttribution,
  StyleQuizProfile,
  StyleQuizSource,
  StyleQuizTimings,
} from '@patina/types';
import { AestheteQuizError, classifyRpcError, QuizNetworkError, type PostgrestErrorBody } from './errors';

export interface QuizClientConfig {
  /** Supabase API origin, e.g. `https://api.patina.cloud` or `http://localhost:54321`. */
  baseUrl: string;
  /** The project anon key — always sent as `apikey`. */
  anonKey: string;
  /** Supabase user JWT; when present it becomes the Bearer token (authenticated role). */
  accessToken?: string;
  /** Injectable fetch (tests, SSR polyfills). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export interface SubmitStyleQuizParams extends QuizClientConfig {
  /** Client-generated uuidv4, persisted in localStorage (see session-key.ts). */
  sessionKey: string;
  answers: StyleQuizAnswers;
  timings?: StyleQuizTimings;
  /** Defaults to 'web' (the shipped server default). */
  source?: StyleQuizSource;
  attribution?: StyleQuizAttribution;
}

export interface ClaimQuizSessionParams extends QuizClientConfig {
  /** Required — claim_quiz_session is granted to authenticated only. */
  accessToken: string;
  sessionKey: string;
}

async function postRpc<T>(config: QuizClientConfig, fn: string, body: unknown): Promise<T> {
  const doFetch = config.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new QuizNetworkError('No fetch implementation available — pass one via `fetch`.');
  }
  const url = `${config.baseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${config.accessToken ?? config.anonKey}`,
      },
      body: JSON.stringify(body),
      signal: config.signal,
    });
  } catch (cause) {
    throw new QuizNetworkError(
      `Could not reach ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (!response.ok) {
    let errorBody: PostgrestErrorBody | null = null;
    try {
      errorBody = (await response.json()) as PostgrestErrorBody;
    } catch {
      errorBody = null;
    }
    throw classifyRpcError(response.status, errorBody);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new QuizNetworkError(`Malformed JSON in the ${fn} response`, { status: response.status });
  }
}

/**
 * Submit the five quiz answers; returns the full style profile (§7.1 keys plus
 * the additive `spectrum_confidence` / `patina_affinity` / `version`).
 * Resubmitting the same session key is an update — a new profile version, not
 * a duplicate.
 */
export async function submitStyleQuiz(params: SubmitStyleQuizParams): Promise<StyleQuizProfile> {
  const { sessionKey, answers, timings, source, attribution, ...config } = params;
  return postRpc<StyleQuizProfile>(config, 'submit_style_quiz', {
    p_session_key: sessionKey,
    p_answers: answers,
    p_timings: timings ?? {},
    p_source: source ?? 'web',
    p_attribution: attribution ?? {},
  });
}

/**
 * Bind an anonymous quiz session to the signed-in user (idempotent; refuses
 * keys already claimed by another account).
 */
export async function claimQuizSession(params: ClaimQuizSessionParams): Promise<ClaimQuizSessionResult> {
  const { sessionKey, ...config } = params;
  if (!config.accessToken) {
    throw new AestheteQuizError('auth_required', 'claim_quiz_session requires a signed-in user (accessToken)');
  }
  return postRpc<ClaimQuizSessionResult>(config, 'claim_quiz_session', {
    p_session_key: sessionKey,
  });
}

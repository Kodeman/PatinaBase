/**
 * Wire-client request-shape tests — mocked fetch, NO network. Asserts the
 * exact endpoint paths, the apikey/Authorization header pair, the §7.1 body
 * shape, and the 00243 error classification (rate limits arrive as HTTP 400
 * with a message, NOT 429).
 */
import { describe, expect, it, vi } from 'vitest';
import type { StyleQuizAnswers } from '@patina/types';
import {
  AestheteQuizError,
  classifyRpcError,
  QuizForbiddenError,
  QuizInvalidAnswersError,
  QuizNetworkError,
  QuizRateLimitError,
  QuizUnknownSessionError,
} from '../core/errors';
import { claimQuizSession, submitStyleQuiz } from '../core/wire-client';

const ANSWERS: StyleQuizAnswers = {
  visual_resonance: 'warm_minimal',
  lifestyle: ['family', 'entertaining'],
  material: 'weathered_oak',
  investment: 'heirloom',
  catalyst: 'new_home',
};

const SESSION_KEY = 'c1f00000-0000-4000-8000-000000000000';
const BASE = 'http://localhost:54321';
const ANON = 'anon-key-123';

function okFetch(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  });
}

function errorFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  });
}

describe('submitStyleQuiz — request shape', () => {
  it('POSTs the exact §7.1 body to /rest/v1/rpc/submit_style_quiz with apikey + Authorization', async () => {
    const fetchMock = okFetch({ profile_id: 'p', session_key: SESSION_KEY, version: 1 });
    await submitStyleQuiz({
      baseUrl: BASE,
      anonKey: ANON,
      fetch: fetchMock as unknown as typeof fetch,
      sessionKey: SESSION_KEY,
      answers: ANSWERS,
      timings: { q1_ms: 4200 },
      source: 'marketing_site',
      attribution: { utm_source: 'launch', posthog_distinct_id: 'ph-1' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/v1/rpc/submit_style_quiz`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`, // anon: the anon key IS the bearer
    });
    expect(JSON.parse(init.body)).toEqual({
      p_session_key: SESSION_KEY,
      p_answers: ANSWERS,
      p_timings: { q1_ms: 4200 },
      p_source: 'marketing_site',
      p_attribution: { utm_source: 'launch', posthog_distinct_id: 'ph-1' },
    });
  });

  it('trims trailing slashes off baseUrl', async () => {
    const fetchMock = okFetch({});
    await submitStyleQuiz({
      baseUrl: `${BASE}///`,
      anonKey: ANON,
      fetch: fetchMock as unknown as typeof fetch,
      sessionKey: SESSION_KEY,
      answers: ANSWERS,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/rest/v1/rpc/submit_style_quiz`);
  });

  it('defaults p_timings/{}, p_source/web, p_attribution/{} (the shipped server defaults)', async () => {
    const fetchMock = okFetch({});
    await submitStyleQuiz({
      baseUrl: BASE,
      anonKey: ANON,
      fetch: fetchMock as unknown as typeof fetch,
      sessionKey: SESSION_KEY,
      answers: ANSWERS,
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      p_session_key: SESSION_KEY,
      p_answers: ANSWERS,
      p_timings: {},
      p_source: 'web',
      p_attribution: {},
    });
  });

  it('uses the user JWT as the bearer when accessToken is provided (apikey stays anon)', async () => {
    const fetchMock = okFetch({});
    await submitStyleQuiz({
      baseUrl: BASE,
      anonKey: ANON,
      accessToken: 'user-jwt',
      fetch: fetchMock as unknown as typeof fetch,
      sessionKey: SESSION_KEY,
      answers: ANSWERS,
    });
    const { headers } = fetchMock.mock.calls[0][1];
    expect(headers.apikey).toBe(ANON);
    expect(headers.Authorization).toBe('Bearer user-jwt');
  });

  it('returns the parsed profile JSON', async () => {
    const profile = {
      profile_id: 'p-1',
      session_key: SESSION_KEY,
      archetype: { primary: 'Warm Modern', secondary: 'Japandi', confidence: 0.45 },
      spectrums: { warmth: 0.86, complexity: -0.56, formality: -0.32, timelessness: 0.51, boldness: -0.24, craftsmanship: 0.72 },
      budget: { min_cents: 500000, max_cents: 1500000, label: 'Heirloom', value_orientation: 0.7 },
      material_affinities: { wood: 0.9 },
      catalyst: 'new_home',
      spectrum_confidence: { warmth: 0.8, complexity: 0.62, formality: 0.35, timelessness: 0.51, boldness: 0.36, craftsmanship: 0.61 },
      patina_affinity: 0.4,
      version: 1,
    };
    const result = await submitStyleQuiz({
      baseUrl: BASE,
      anonKey: ANON,
      fetch: okFetch(profile) as unknown as typeof fetch,
      sessionKey: SESSION_KEY,
      answers: ANSWERS,
    });
    expect(result).toEqual(profile);
  });
});

describe('claimQuizSession — request shape', () => {
  it('POSTs {p_session_key} to /rest/v1/rpc/claim_quiz_session with the user bearer', async () => {
    const fetchMock = okFetch({ session_key: SESSION_KEY, user_id: 'u', profile_id: 'p' });
    await claimQuizSession({
      baseUrl: BASE,
      anonKey: ANON,
      accessToken: 'user-jwt',
      fetch: fetchMock as unknown as typeof fetch,
      sessionKey: SESSION_KEY,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/v1/rpc/claim_quiz_session`);
    expect(init.headers.Authorization).toBe('Bearer user-jwt');
    expect(init.headers.apikey).toBe(ANON);
    expect(JSON.parse(init.body)).toEqual({ p_session_key: SESSION_KEY });
  });

  it('refuses to call without an accessToken (auth_required, no network)', async () => {
    const fetchMock = okFetch({});
    await expect(
      claimQuizSession({
        baseUrl: BASE,
        anonKey: ANON,
        accessToken: '' as string,
        fetch: fetchMock as unknown as typeof fetch,
        sessionKey: SESSION_KEY,
      }),
    ).rejects.toMatchObject({ kind: 'auth_required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('typed errors (00243 semantics)', () => {
  it('session rate limit → QuizRateLimitError (arrives as HTTP 400, not 429)', async () => {
    const fetchMock = errorFetch(400, {
      code: 'P0001',
      message: 'submit_style_quiz: this session has submitted 3 times in the last hour — try again later',
    });
    await expect(
      submitStyleQuiz({
        baseUrl: BASE, anonKey: ANON, fetch: fetchMock as unknown as typeof fetch,
        sessionKey: SESSION_KEY, answers: ANSWERS,
      }),
    ).rejects.toBeInstanceOf(QuizRateLimitError);
  });

  it('IP rate limit → QuizRateLimitError', () => {
    const err = classifyRpcError(400, {
      code: 'P0001',
      message: 'submit_style_quiz: too many submissions from this address — try again in an hour',
    });
    expect(err).toBeInstanceOf(QuizRateLimitError);
    expect(err.kind).toBe('rate_limited');
    expect(err.status).toBe(400);
    expect(err.code).toBe('P0001');
  });

  it('unknown Q1/Q3/Q4 option or missing keys → QuizInvalidAnswersError', () => {
    expect(
      classifyRpcError(400, { code: 'P0001', message: '_compute_quiz_profile: unknown material option "velvet"' }),
    ).toBeInstanceOf(QuizInvalidAnswersError);
    expect(
      classifyRpcError(400, {
        code: 'P0001',
        message: 'submit_style_quiz: answers must carry visual_resonance, lifestyle, material, investment, catalyst (§7.1)',
      }),
    ).toBeInstanceOf(QuizInvalidAnswersError);
    expect(
      classifyRpcError(400, { code: 'P0001', message: 'submit_style_quiz: p_answers exceeds the 8 KB limit' }),
    ).toBeInstanceOf(QuizInvalidAnswersError);
  });

  it('foreign session key → QuizForbiddenError (42501 → HTTP 403)', () => {
    const err = classifyRpcError(403, {
      code: '42501',
      message: 'submit_style_quiz: this session_key belongs to another account',
    });
    expect(err).toBeInstanceOf(QuizForbiddenError);
    expect(err.kind).toBe('forbidden');
  });

  it('claim on a nonexistent session → QuizUnknownSessionError', () => {
    expect(
      classifyRpcError(400, { code: 'P0001', message: 'claim_quiz_session: unknown session_key' }),
    ).toBeInstanceOf(QuizUnknownSessionError);
  });

  it('anything else → base AestheteQuizError kind=server, carrying the PostgREST body', () => {
    const err = classifyRpcError(404, {
      code: 'PGRST202',
      message: 'Could not find the function public.submit_style_quiz',
      hint: 'Perhaps you meant…',
    });
    expect(err).toBeInstanceOf(AestheteQuizError);
    expect(err.kind).toBe('server');
    expect(err.hint).toContain('Perhaps');
  });

  it('fetch rejection → QuizNetworkError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      submitStyleQuiz({
        baseUrl: BASE, anonKey: ANON, fetch: fetchMock as unknown as typeof fetch,
        sessionKey: SESSION_KEY, answers: ANSWERS,
      }),
    ).rejects.toBeInstanceOf(QuizNetworkError);
  });

  it('malformed success JSON → QuizNetworkError', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    });
    await expect(
      submitStyleQuiz({
        baseUrl: BASE, anonKey: ANON, fetch: fetchMock as unknown as typeof fetch,
        sessionKey: SESSION_KEY, answers: ANSWERS,
      }),
    ).rejects.toBeInstanceOf(QuizNetworkError);
  });
});

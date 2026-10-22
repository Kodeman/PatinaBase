import { createServerClient } from '@patina/supabase/server';

import { clientEditionEnabled } from '@/lib/server-feature-flag';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));

const fetchFlag = jest.fn();
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-project-key';
  process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://flags.example.test';
  delete process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
  global.fetch = fetchFlag;
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  jest.useRealTimers();
});

const response = (value: unknown, status = 200) => ({
  status,
  json: async () => ({
    errorsWhileComputingFlags: false,
    flags: { 'client-edition-page': {
      key: 'client-edition-page', enabled: value, variant: null,
      reason: { code: 'condition_match', condition_index: 0, description: 'Matched condition set 1' },
      metadata: { id: 692880, version: 2, description: null, payload: null, has_experiment: false },
    } },
    requestId: 'e3e72b79-39f1-4048-9fc1-b614f4675a22', evaluatedAt: 1792626189029,
  }),
});

it('uses the authenticated client distinct_id once, no-store, on the existing PostHog host', async () => {
  fetchFlag.mockResolvedValue(response(true));
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(true);
  expect(fetchFlag).toHaveBeenCalledTimes(1);
  expect(createServerClient).not.toHaveBeenCalled();
  expect(fetchFlag).toHaveBeenCalledWith('https://flags.example.test/flags?v=2', expect.objectContaining({
    method: 'POST', cache: 'no-store',
    body: JSON.stringify({ api_key: 'test-project-key', distinct_id: 'authenticated-user-uuid' }),
    signal: expect.any(AbortSignal),
  }));
});

it.each([false, undefined, null, 'true', 'variant'])('fails closed for flag value %p', async (value) => {
  fetchFlag.mockResolvedValue(response(value));
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(false);
});

it('fails closed with no key, without authentication or a flag request', async () => {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(false);
  expect(createServerClient).not.toHaveBeenCalled();
  expect(fetchFlag).not.toHaveBeenCalled();
});

it.each([null, undefined, ''])('never requests flags without a validated user id (%p)', async (userId) => {
  expect(await clientEditionEnabled(userId)).toBe(false);
  expect(createServerClient).not.toHaveBeenCalled();
  expect(fetchFlag).not.toHaveBeenCalled();
});

it('fails closed for the old featureFlags-only v2 shape', async () => {
  fetchFlag.mockResolvedValue({ status: 200, json: async () => ({ featureFlags: { 'client-edition-page': true } }) });
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(false);
});

it.each([false, true])('fails closed when the v2 flag key is absent, errorsWhileComputingFlags=%p', async (errorsWhileComputingFlags) => {
  fetchFlag.mockResolvedValue({ status: 200, json: async () => ({ flags: {}, errorsWhileComputingFlags, requestId: 'request', evaluatedAt: 1792626189029 }) });
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(false);
});

it('trusts an enabled v2 flag even when another flag could not be computed', async () => {
  const body = await response(true).json();
  fetchFlag.mockResolvedValue({ status: 200, json: async () => ({ ...body, errorsWhileComputingFlags: true }) });
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(true);
});

it.each([400, 401, 429, 500])('fails closed for HTTP %s without retrying', async (status) => {
  fetchFlag.mockResolvedValue(response(true, status));
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(false);
  expect(fetchFlag).toHaveBeenCalledTimes(1);
});

it.each([404, 405, 501])('uses decide only when the host rejects flags (%s)', async (status) => {
  fetchFlag.mockResolvedValueOnce(response(false, status)).mockResolvedValueOnce({ status: 200, json: async () => ({ errorsWhileComputingFlags: false, featureFlags: { 'client-edition-page': true }, featureFlagPayloads: {}, requestId: '26d0cbb7-4ddc-472a-b21a-56c72acc6ff8', evaluatedAt: 1792626200194 }) });
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(true);
  expect(fetchFlag).toHaveBeenCalledTimes(2);
  expect(fetchFlag.mock.calls[1][0]).toBe('https://flags.example.test/decide?v=3');
  expect(fetchFlag.mock.calls[1][1].signal).toBe(fetchFlag.mock.calls[0][1].signal);
});

it('fails closed for a network error', async () => {
  fetchFlag.mockRejectedValue(new Error('offline'));
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(false);
});

it('fails closed for malformed JSON', async () => {
  fetchFlag.mockResolvedValue({ status: 200, json: async () => { throw new Error('invalid JSON'); } });
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(false);
});

it('aborts the entire flags/decide evaluation after 600 ms', async () => {
  jest.useFakeTimers();
  fetchFlag.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const result = clientEditionEnabled('authenticated-user-uuid');
  await jest.advanceTimersByTimeAsync(599);
  expect(fetchFlag.mock.calls[0][1].signal.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(await result).toBe(false);
  expect(fetchFlag.mock.calls[0][1].signal.aborted).toBe(true);
});

it('reuses the same 600 ms deadline for decide', async () => {
  jest.useFakeTimers();
  fetchFlag.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(response(false, 404)), 200)))
    .mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
  const result = clientEditionEnabled('authenticated-user-uuid');
  await jest.advanceTimersByTimeAsync(600);
  expect(await result).toBe(false);
  expect(fetchFlag).toHaveBeenCalledTimes(2);
});

it('uses the existing default host when none is configured', async () => {
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  fetchFlag.mockResolvedValue(response(true));
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(true);
  expect(fetchFlag.mock.calls[0][0]).toBe('https://us.i.posthog.com/flags?v=2');
});

it('honors the existing build-time override without a PostHog request', async () => {
  process.env.NEXT_PUBLIC_FLAG_OVERRIDES = 'other:false, client-edition-page:true';
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(true);
  expect(createServerClient).not.toHaveBeenCalled();
  expect(fetchFlag).not.toHaveBeenCalled();
});

it('does not enable even an override without a session', async () => {
  process.env.NEXT_PUBLIC_FLAG_OVERRIDES = 'client-edition-page:true';
  expect(await clientEditionEnabled(null)).toBe(false);
  expect(fetchFlag).not.toHaveBeenCalled();
});

it('honors an explicit false override', async () => {
  process.env.NEXT_PUBLIC_FLAG_OVERRIDES = 'client-edition-page:false';
  expect(await clientEditionEnabled('authenticated-user-uuid')).toBe(false);
  expect(fetchFlag).not.toHaveBeenCalled();
});

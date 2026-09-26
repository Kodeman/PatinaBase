/**
 * Personless teaching capture (system-architecture §7).
 *
 * The first block mocks posthog-js and locks in the contract: init options,
 * the property allowlist, the flag on every call, the session-stable anon id,
 * and the no-op without PostHog. The second block runs the real posthog-js
 * pipeline. It identifies the primary instance and reads the final payload at
 * before_send, so it proves what actually leaves the browser.
 */

import type { CaptureResult } from 'posthog-js';

const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockRegister = jest.fn();
const mockInit = jest.fn(() => ({ capture: mockCapture, identify: mockIdentify, register: mockRegister }));

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: { init: (...args: unknown[]) => (mockInit as (...a: unknown[]) => unknown)(...args) },
}));

type TeachingModule = typeof import('./teaching-events');

const ENV_KEYS = ['NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_HOST', 'NODE_ENV'] as const;
const originalEnv = ENV_KEYS.map((key) => [key, process.env[key]] as const);
const mutableEnv = process.env as Record<string, string | undefined>;

function setEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const key of ENV_KEYS) delete mutableEnv[key];
  mutableEnv.NODE_ENV = 'test';
  for (const [key, value] of Object.entries(env)) mutableEnv[key] = value;
}

afterEach(() => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
  window.sessionStorage.clear();
  jest.restoreAllMocks();
});

describe('captureTeachingEvent (posthog-js mocked)', () => {
  function load(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
    setEnv(env);
    mockInit.mockReset();
    mockInit.mockImplementation(() => ({ capture: mockCapture, identify: mockIdentify, register: mockRegister }));
    mockCapture.mockClear();
    let mod!: TeachingModule;
    jest.isolateModules(() => {
      mod = require('./teaching-events') as TeachingModule;
    });
    return { mod, init: mockInit, capture: mockCapture, identify: mockIdentify, register: mockRegister };
  }

  it('is a no-op without a PostHog key', () => {
    const { mod, init, capture } = load({});
    expect(() => mod.captureTeachingEvent('help.teaching_note.shown', { note_key: 'n1' })).not.toThrow();
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('inits one named personless instance with the shared key and host', () => {
    const { mod, init } = load({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
      NEXT_PUBLIC_POSTHOG_HOST: 'https://ph.example.test',
    });
    mod.captureTeachingEvent('help.teaching_note.shown', { note_key: 'n1' });
    mod.captureTeachingEvent('help.teaching_note.acted', { note_key: 'n1' });

    expect(init).toHaveBeenCalledTimes(1);
    const [key, config, name] = init.mock.calls[0] as unknown as [string, Record<string, unknown>, string];
    expect(key).toBe('phc_test');
    expect(name).toBe('teaching');
    expect(config).toMatchObject({
      api_host: 'https://ph.example.test',
      person_profiles: 'never',
      persistence: 'memory',
      persistence_name: 'teaching',
      bootstrap: { distinctID: mod.getTeachingAnonId() },
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
    });
    const { sanitizePostHogEvent } = jest.requireActual('./posthog') as typeof import('./posthog');
    expect(typeof config.before_send).toBe('function');
    expect((config.before_send as typeof sanitizePostHogEvent).name).toBe(sanitizePostHogEvent.name);
  });

  it('leaves api_host to the SDK default when no host is configured', () => {
    const { mod, init } = load({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    mod.captureTeachingEvent('help.teaching_changes.opened');
    const config = (init.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(config).not.toHaveProperty('api_host');
  });

  it('drops every key outside the allowlist and sets $process_person_profile false on every call', () => {
    const { mod, capture, identify, register } = load({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    const hostile = {
      note_key: 'invoice.delivery',
      kind: 'return',
      reason: 'expired',
      body: 'Send the invoice from the ledger.',
      projectId: 'p-1',
      client_id: 'c-1',
      dwell_ms: 1200,
      distinct_id: 'user-123',
    } as unknown as Parameters<TeachingModule['captureTeachingEvent']>[1];

    mod.captureTeachingEvent('help.teaching_note.receded', hostile);
    mod.captureTeachingEvent('help.teaching_note.dismissed', { note_key: 'n2' });

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenNthCalledWith(1, 'help.teaching_note.receded', {
      note_key: 'invoice.delivery',
      kind: 'return',
      reason: 'expired',
      $process_person_profile: false,
    });
    for (const [, props] of capture.mock.calls) {
      expect(props.$process_person_profile).toBe(false);
    }
    expect(identify).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('keeps one anonymous id for the session and falls back to memory when storage throws', () => {
    const { mod } = load({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    const first = mod.getTeachingAnonId();
    expect(first).toMatch(/^teaching-anon-[0-9a-f-]{36}$/);
    expect(mod.getTeachingAnonId()).toBe(first);
    expect(window.sessionStorage.getItem('patina:teaching-anon-id')).toBe(first);

    // A fresh module in the same session reuses the stored id.
    const { mod: reloaded } = load({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    expect(reloaded.getTeachingAnonId()).toBe(first);

    window.sessionStorage.clear();
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { mod: blocked } = load({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    const memoryId = blocked.getTeachingAnonId();
    expect(memoryId).toMatch(/^teaching-anon-/);
    expect(blocked.getTeachingAnonId()).toBe(memoryId);
  });
});

describe('captureTeachingEvent (real posthog-js payload)', () => {
  it('sends $process_person_profile false, the anon distinct_id, and no $user_id for an identified designer', () => {
    setEnv({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    const sent: CaptureResult[] = [];

    let mod!: TeachingModule;
    jest.isolateModules(() => {
      jest.doMock('./posthog', () => {
        const actual = jest.requireActual('./posthog') as typeof import('./posthog');
        return {
          ...actual,
          // Record the final payload, then drop it so nothing goes to the network.
          sanitizePostHogEvent: (event: CaptureResult | null) => {
            if (event) sent.push(event);
            return null;
          },
        };
      });

      // The real SDK behind the module mock: the teaching instance and the
      // identified primary share one posthog-js module, as they do in the app.
      const primary = (jest.requireActual('posthog-js') as typeof import('posthog-js')).default;
      mockInit.mockReset();
      mockInit.mockImplementation(((...args: Parameters<typeof primary.init>) => primary.init(...args)) as never);
      primary.init('phc_test', {
        persistence: 'memory',
        advanced_disable_flags: true,
        disable_external_dependency_loading: true,
        autocapture: false,
        capture_pageview: false,
        before_send: () => null,
      });
      primary.identify('user-123', { email_domain: 'studio.test' });
      expect(primary.get_distinct_id()).toBe('user-123');

      mod = require('./teaching-events') as TeachingModule;
    });

    mod.captureTeachingEvent('help.teaching_note.shown', {
      note_key: 'invoice.delivery',
      surface_key: 'document.ledger',
    });

    expect(sent).toHaveLength(1);
    const { event, properties } = sent[0];
    const anonId = mod.getTeachingAnonId();
    expect(event).toBe('help.teaching_note.shown');
    expect(properties.$process_person_profile).toBe(false);
    expect(properties.distinct_id).toBe(anonId);
    expect(anonId).not.toBe('user-123');
    expect(properties).not.toHaveProperty('$user_id');
    expect(properties.$is_identified).toBe(false);
    expect(JSON.stringify(sent[0])).not.toContain('user-123');
    expect(sent[0]).not.toHaveProperty('$set_once');
    expect(properties.note_key).toBe('invoice.delivery');
  });
});

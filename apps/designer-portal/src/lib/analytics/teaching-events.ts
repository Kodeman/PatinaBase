/**
 * Return teaching (Margin Notes): personless capture (system-architecture §7).
 *
 * Teaching events must never be tied to a person. The shared instance cannot
 * guarantee that. In posthog-js 1.359.1, `calculateEventProperties` overwrites
 * a caller's `$process_person_profile` with `_hasPersonProcessing()` "as very
 * last step, so it cannot be overridden" (posthog-core.js L1107-1109), which is
 * true for an identified designer. It also merges the identify-registered
 * `$user_id` super-property into every event (L1089, L1956), and it stamps its
 * own `$session_id` after the caller's props (L1043).
 *
 * These events therefore go through a separate, lazily created named instance:
 *   · person_profiles 'never' makes the flag false on the wire.
 *   · 'memory' persistence plus a bootstrap distinct_id gives it no shared
 *     identity. The id is `teaching-anon-<uuid>`, kept for the browser session.
 *   · Every automatic feature is off, and it never fetches flags.
 *   · The SDK's own location, referrer, session and device properties are
 *     denylisted, and `sanitizeTeachingProperties` drops anything else that
 *     could carry a route: a `/doc/<projectId>` URL maps to its designer.
 * Never call `identify` or `register` on it.
 *
 * Event names and property keys are the help-system taxonomy of record
 * (`@patina/help-system` analytics.ts, TeachingEventName and
 * TeachingEventProps). Only the keys below leave the browser, so body text,
 * project or client ids, and dwell cannot ride along.
 */

import posthog, { type PostHog } from 'posthog-js';

import { createBrowserUuid } from '../browser-uuid';
import { isAnalyticsPossible, sanitizePostHogEvent } from './posthog';

export type TeachingEventName =
  | 'help.teaching_note.shown'
  | 'help.teaching_note.dismissed'
  | 'help.teaching_note.acted'
  | 'help.teaching_note.receded'
  | 'help.teaching_note.already_knew'
  | 'help.teaching_changes.opened';

export type TeachingEventProps = {
  note_key?: string;
  kind?: string;
  trigger?: string;
  surface_key?: string;
  release_id?: string;
  size_class?: string;
  audience?: string;
  reason?: 'closed' | 'retired_max' | 'superseded' | 'expired';
};

const ALLOWED_KEYS: ReadonlyArray<keyof TeachingEventProps> = [
  'note_key',
  'kind',
  'trigger',
  'surface_key',
  'release_id',
  'size_class',
  'audience',
  'reason',
];

/** posthog-js default properties that locate the designer: never sent. */
export const TEACHING_PROPERTY_DENYLIST = [
  '$current_url',
  '$pathname',
  '$referrer',
  '$referring_domain',
  '$host',
  '$initial_referrer',
  '$initial_referring_domain',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_host',
  '$session_id',
  '$window_id',
  '$device_id',
];

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function carriesRoute(value: string): boolean {
  return value.includes('/doc/') || value.includes('/projects/') || value.includes('?') || UUID_PATTERN.test(value);
}

/**
 * The second net behind the denylist: drops any `$initial_*` key and any
 * string value holding a route, a query string or a UUID. `distinct_id` is the
 * anonymous `teaching-anon-<uuid>` and must reach the wire, so it is kept.
 */
export function sanitizeTeachingProperties<T extends Record<string, unknown>>(properties: T): T {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key.startsWith('$initial_')) continue;
    if (key !== 'distinct_id' && typeof value === 'string' && carriesRoute(value)) continue;
    kept[key] = value;
  }
  return kept as T;
}

const INSTANCE_NAME = 'teaching';
const ANON_ID_KEY = 'patina:teaching-anon-id';
const ANON_ID_PREFIX = 'teaching-anon-';

let memoryAnonId: string | null = null;
let teachingClient: PostHog | null = null;

/**
 * One anonymous id per browser session: sessionStorage, else this page's memory.
 * Per tab session, not per event as §7 reads (accepted deviation): already_knew dedupe needs an id stable within the session.
 */
export function getTeachingAnonId(): string {
  try {
    const stored = window.sessionStorage.getItem(ANON_ID_KEY);
    if (stored && stored.startsWith(ANON_ID_PREFIX)) return stored;
  } catch {
    // Storage blocked: fall through to the in-memory id.
  }
  if (!memoryAnonId) memoryAnonId = `${ANON_ID_PREFIX}${createBrowserUuid()}`;
  try {
    window.sessionStorage.setItem(ANON_ID_KEY, memoryAnonId);
  } catch {
    // Storage blocked: the in-memory id serves this page.
  }
  return memoryAnonId;
}

function getTeachingClient(): PostHog | null {
  if (teachingClient) return teachingClient;
  // Same guard and the same key and host source as initPostHog().
  if (!isAnalyticsPossible()) return null;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  teachingClient = posthog.init(
    key,
    {
      ...(host && { api_host: host }),
      person_profiles: 'never',
      persistence: 'memory',
      // posthog-js keys its module-level memory store by persistence name,
      // which is `ph_<token>_posthog` by default. Without a name of its own,
      // this instance would share the primary's store, and with it `$user_id`.
      persistence_name: INSTANCE_NAME,
      bootstrap: { distinctID: getTeachingAnonId() },
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      // Remote config can switch these on, so each one is pinned off.
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      save_referrer: false,
      save_campaign_params: false,
      respect_dnt: true,
      ip: false,
      property_denylist: [...TEACHING_PROPERTY_DENYLIST],
      sanitize_properties: sanitizeTeachingProperties,
      before_send: sanitizePostHogEvent,
    },
    INSTANCE_NAME
  );
  return teachingClient;
}

function pickAllowed(props: TeachingEventProps): TeachingEventProps {
  const source = props as Record<string, unknown>;
  const picked: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    const value = source[key];
    if (typeof value === 'string') picked[key] = value;
  }
  return picked as TeachingEventProps;
}

/**
 * Capture a teaching event personless. It is a no-op when analytics is not
 * possible here, and it never throws.
 */
export function captureTeachingEvent(name: TeachingEventName, props: TeachingEventProps = {}): void {
  try {
    const client = getTeachingClient();
    if (!client) return;
    client.capture(name, { ...pickAllowed(props), $process_person_profile: false });
  } catch {
    // analytics must never crash the UI
  }
}

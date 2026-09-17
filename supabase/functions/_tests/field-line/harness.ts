import { createFakeSupabase, type FakeSupabase } from "../fake-supabase.ts";
import { fieldLineBindings } from "./adapters.ts";
import { signedInboundFixture, signedStatusFixture } from "./fixtures.ts";

type SendPartySmsInput = Parameters<typeof fieldLineBindings.sendPartySms>[1];
type InboundParams = Parameters<typeof fieldLineBindings.processInbound>[0];

export const FIELD_LINE_CLOCK = new Date("2026-11-01T14:00:00.000Z");
export const FIELD_LINE_SENDER = "+15559990000";
export const SHARED_RECIPIENT = "+15550102030";

export type ProviderOutcome =
  | { kind: "accept"; sid?: string; status?: string }
  | { kind: "fail"; code: 30007 | 21610; message?: string }
  | { kind: "crash_after_accept"; sid?: string };

export interface FakeProvider {
  setOutcome(outcome: ProviderOutcome): void;
  reset(): void;
  readonly requests: Array<{ url: string; init?: RequestInit }>;
  fetch: typeof fetch;
}

export interface FieldLineHarness {
  readonly clock: Date;
  readonly sender: string;
  readonly recipient: string;
  readonly studios: {
    A: { id: string; projectId: string; partyId: string };
    B: { id: string; projectId: string; partyId: string };
  };
  readonly fake: FakeSupabase;
  readonly provider: FakeProvider;
  readonly mediaStore: {
    interruptNextUpload(path?: string): void;
    reset(): void;
  };
  env(key: string): string | undefined;
  signedInbound(overrides?: Partial<InboundParams>): ReturnType<typeof signedInboundFixture>;
  signedStatus(overrides?: Record<string, string>): ReturnType<typeof signedStatusFixture>;
  processInbound(overrides?: Partial<InboundParams>): Promise<Awaited<ReturnType<typeof fieldLineBindings.processInbound>>>;
  send(input: SendPartySmsInput): ReturnType<typeof fieldLineBindings.sendPartySms>;
  flush(): ReturnType<typeof fieldLineBindings.flushDeferredMessages>;
  daily(): ReturnType<typeof fieldLineBindings.runFieldDaily>;
}

function makeProvider(): FakeProvider {
  let outcome: ProviderOutcome = { kind: "accept" };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.startsWith("https://media.fixture.patina.test/")) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    }
    if (outcome.kind === "fail") {
      return new Response(JSON.stringify({
        code: outcome.code,
        message: outcome.message ?? `Twilio fixture failure ${outcome.code}`,
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (outcome.kind === "crash_after_accept") {
      // The provider accepted the request, then the transport died before the
      // caller received its receipt. The recorded request is the acceptance.
      throw new Error(`provider accepted ${outcome.sid ?? "SMfixtureAccepted"} before transport crash`);
    }
    return new Response(JSON.stringify({
      sid: outcome.sid ?? "SMfixtureAccepted",
      status: outcome.status ?? "queued",
    }), { status: 201, headers: { "Content-Type": "application/json" } });
  };
  return {
    requests,
    fetch: fetchImpl,
    setOutcome(next) { outcome = next; },
    reset() { outcome = { kind: "accept" }; requests.splice(0, requests.length); },
  };
}

export function createFieldLineHarness(): FieldLineHarness {
  const env = new Map<string, string>([
    ["TWILIO_FROM_NUMBER", FIELD_LINE_SENDER],
    ["SMS_CONVERSATION_NUMBER", FIELD_LINE_SENDER],
    ["SMS_DEV_MODE", "off"],
    ["TWILIO_ACCOUNT_SID", "ACfixture"],
    ["TWILIO_AUTH_TOKEN", "fixture-token"],
    ["FIELD_TZ", "America/Chicago"],
  ]);
  const fake = createFakeSupabase({
    profiles: [
      { id: "studio-a", full_name: "Studio A" },
      { id: "studio-b", full_name: "Studio B" },
    ],
    projects: [
      { id: "project-a", name: "Ash House", designer_id: "studio-a", studio_id: "studio-a" },
      { id: "project-b", name: "Birch House", designer_id: "studio-b", studio_id: "studio-b" },
    ],
    project_parties: [
      { id: "party-a", project_id: "project-a", phone_e164: SHARED_RECIPIENT, party_kind: "sub", display_name: "Riley", sms_consent_status: "granted", sms_consent_source: "fixture", sms_consent_evidence: "fixture consent evidence", sms_consent_recorded_at: "2026-10-01T00:00:00.000Z", sms_consent_disclosure_version: "fixture-v1" },
      { id: "party-b", project_id: "project-b", phone_e164: SHARED_RECIPIENT, party_kind: "sub", display_name: "Riley", sms_consent_status: "granted", sms_consent_source: "fixture", sms_consent_evidence: "fixture consent evidence", sms_consent_recorded_at: "2026-10-01T00:00:00.000Z", sms_consent_disclosure_version: "fixture-v1" },
    ],
    studio_channel_consent: [
      { organization_id: "studio-a", channel_kind: "sms", channel_value: SHARED_RECIPIENT, status: "granted", refusal_unanswered: false },
      { organization_id: "studio-b", channel_kind: "sms", channel_value: SHARED_RECIPIENT, status: "granted", refusal_unanswered: false },
    ],
    email_templates: [
      { slug: "sms_daily_digest", is_active: true, html_content: "{{studio_name}}: {{menu}} Msg&data rates may apply. Reply HELP for help, STOP to opt out." },
      { slug: "sms_optin_invite", is_active: true, html_content: "{{studio_name}} through Patina. Reply YES to agree. Msg&data rates may apply. Reply HELP for help, STOP to opt out." },
      { slug: "sms_help", is_active: true, html_content: "Studio A: Msg&data rates may apply. Reply HELP for help, STOP to opt out." },
    ],
    project_tasks: [
      { id: "task-a", project_id: "project-a", owner_party_id: "party-a", title: "Install mantel", due_date: "2026-11-01", status: "todo" },
      { id: "task-b", project_id: "project-b", owner_party_id: "party-b", title: "Set tile", due_date: "2026-11-01", status: "todo" },
    ],
    client_decisions: [],
    delivery_events: [],
    sms_conversations: [],
    sms_messages: [],
  });
  const provider = makeProvider();
  const deps = { getEnv: (key: string) => env.get(key), fetchImpl: provider.fetch, now: FIELD_LINE_CLOCK };
  const mediaStore = {
    interruptNextUpload(path = "*") { fake._failUploadsFor?.add(path); },
    reset() { fake._failUploadsFor?.clear(); },
  };
  return {
    clock: FIELD_LINE_CLOCK,
    sender: FIELD_LINE_SENDER,
    recipient: SHARED_RECIPIENT,
    studios: {
      A: { id: "studio-a", projectId: "project-a", partyId: "party-a" },
      B: { id: "studio-b", projectId: "project-b", partyId: "party-b" },
    },
    fake,
    provider,
    mediaStore,
    env: (key) => env.get(key),
    signedInbound: (overrides = {}) => signedInboundFixture({ To: FIELD_LINE_SENDER, From: SHARED_RECIPIENT, ...overrides }),
    signedStatus: signedStatusFixture,
    async processInbound(overrides = {}) {
      const fixture = await signedInboundFixture({ To: FIELD_LINE_SENDER, From: SHARED_RECIPIENT, ...overrides });
      return fieldLineBindings.processInbound(fixture.inbound, {
        supabase: fake as never,
        ...deps,
        parseFn: async () => ({ intent: "note", target_ref: null, new_date: null, note: "fixture", confidence: 0 }),
      });
    },
    send: (input) => fieldLineBindings.sendPartySms(fake as never, input, deps),
    flush: () => fieldLineBindings.flushDeferredMessages(fake as never, deps),
    daily: () => fieldLineBindings.runFieldDaily(fake as never, {
      ...deps,
      sendFn: (client, input) => fieldLineBindings.sendPartySms(client, input, deps),
      flushFn: () => fieldLineBindings.flushDeferredMessages(fake as never, deps),
    }),
  };
}

import { createFieldLineHarness, type FieldLineHarness } from "./harness.ts";

/** RPC tables model the migrated contracts; no SQL, provider or clock escapes this fixture. */
export function inboundFixture(effectError?: unknown, now?: Date) {
  const effects: Record<string, unknown>[] = [];
  const touches: Record<string, unknown>[] = [];
  let h: FieldLineHarness;
  let code = 20;
  h = createFieldLineHarness({ now, env: { FIELD_LINE_TRIAGE_USER: "triage-owner" }, rpc: {
    sms_is_suppressed: (args) => ({ data: (h.fake._data.sms_suppressions ?? []).some((row) =>
      row.sender_number === args.p_sender && row.recipient_phone === args.p_recipient && row.lifted_at == null), error: null }),
    sms_resolve_prompt: (args) => ({ data: (h.fake._data.sms_prompts ?? []).filter((row) =>
      row.sender_number === args.p_sender && row.recipient_phone === args.p_recipient &&
      row.short_code === args.p_code && row.answered_at == null && String(row.expires_at) > h.clock.toISOString()), error: null }),
    sms_create_prompt: (args) => {
      const row = { id: `prompt-${code}`, party_id: args.p_party_id, project_id: args.p_project_id,
        kind: args.p_kind, subject_id: args.p_subject_id, version: args.p_version, expires_at: args.p_expires_at,
        sender_number: args.p_sender_number, recipient_phone: args.p_recipient_phone, short_code: String(code++),
        proposed_effect: args.p_proposed_effect ?? null, answered_at: null, created_at: h.clock.toISOString() };
      (h.fake._data.sms_prompts ??= []).push(row);
      return { data: [{ id: row.id, short_code: row.short_code }], error: null };
    },
    field_project_lead_user: (args) => ({ data: args.p_project_id === "project-a" ? "studio-a" : "studio-b", error: null }),
    apply_field_effect: (args) => {
      const message = h.fake._data.sms_messages.find(m => m.id === args.p_sms_message_id);
      if (message?.applied_effect) return { data: { ...message.applied_effect as object, _sms_replayed: true }, error: null };
      effects.push(args);
      if (effectError) return { data: null, error: effectError };
      const data = { applied: (args.p_effect as any).type !== "note", effect_type: (args.p_effect as any).type, summary_text: "Update saved." };
      const party = h.fake._data.project_parties.find(p => p.id === args.p_party_id)!;
      Object.assign(message!, { applied_effect: data, party_id: party.id, project_id: party.project_id });
      return { data, error: null };
    },
    record_touch: (args) => { touches.push(args); return { data: null, error: null }; },
  } });
  const from = h.fake.from.bind(h.fake);
  let messageSequence = 0;
  h.fake.from = (table) => {
    const query = from(table);
    if (table === "sms_messages") {
      const upsert = query.upsert.bind(query);
      query.upsert = (row, options) => upsert({ created_at: new Date(h.clock.getTime() - 10000 + messageSequence++).toISOString(), ...row }, options);
    }
    return query;
  };
  const invoke = h.fake.functions.invoke;
  h.fake.functions.invoke = async (name, opts) => {
    await invoke(name, opts);
    return { data: { success: true, notification_id: "fixture-notification", channel: "in_app" }, error: null };
  };
  // Model the atomic API contract here. Actual rollback and two-session locking
  // are separately exercised by sms_prompt_consumption_test and its controller.
  const rpc = h.fake.rpc;
  const locks = new Map<string, Promise<unknown>>();
  h.fake.rpc = async (name, args = {}) => {
    const message = h.fake._data.sms_messages?.find((m) => m.id === args.p_sms_message_id);
    if (name === "sms_prompt_receipt") {
      const p = h.fake._data.sms_prompts?.find((p) => p.consumed_sid && p.consumed_sid === message?.twilio_sid &&
        p.sender_number === args.p_sender && p.recipient_phone === args.p_recipient);
      return { data: p ? { status: "replayed", prompt_id: p.id, result: p.consumption_result } : null, error: null };
    }
    if (name !== "sms_apply_prompt" && name !== "sms_grant_optin_prompt") return rpc(name, args);
    const id = String(args.p_prompt_id);
    const prior = locks.get(id) ?? Promise.resolve();
    const action = prior.then(async () => {
      const p = h.fake._data.sms_prompts?.find((p) => p.id === id);
      if (!p || !message?.twilio_sid) return { data: null, error: { code: "23514", message: "missing prompt/message" } };
      if (p.consumed_sid === message.twilio_sid) return { data: { status: "replayed", result: p.consumption_result }, error: null };
      if (p.answered_at) return { data: { status: "closed" }, error: null };
      if (String(p.expires_at) <= h.clock.toISOString()) return { data: { status: "expired" }, error: null };
      const verb = String(message.body).trim().toUpperCase().split(/\s+/)[0];
      if (p.proposed_effect && (args.p_effect || !["YES", "Y", "OK"].includes(verb))) return { data: null, error: { code: "23514" } };
      const party = h.fake._data.project_parties.find((x) => x.id === p.party_id)!;
      const project = h.fake._data.projects.find((x) => x.id === p.project_id)!;
      const org = project.studio_id ?? project.designer_id;
      const record = h.fake._data.studio_channel_consent.find((x) => x.organization_id === org);
      if ((await rpc("sms_is_suppressed", args)).data) return { data: { status: "suppressed" }, error: null };
      let result;
      if (name === "sms_grant_optin_prompt") {
        if (!record || record.status !== "pending" || record.refusal_unanswered) return { data: { status: "not_pending" }, error: null };
        Object.assign(record, { status: "granted", consented_at: h.clock.toISOString(), refusal_unanswered: false });
        result = { kind: "optin", result: { organization_id: org, project_id: p.project_id, party_id: party.id, status: "granted" } };
      } else {
        if (!record || record.status !== "granted" || record.refusal_unanswered) return { data: { status: "not_consented" }, error: null };
        const applied = await h.fake.rpc("apply_field_effect", { p_party_id: p.party_id,
          p_effect: p.proposed_effect ?? args.p_effect, p_source: "sms", p_sms_message_id: message.id });
        if (applied.error) return applied;
        if (applied.data?._sms_replayed) return { data: { status: "already_completed" }, error: null };
        result = { kind: "effect", result: applied.data };
      }
      Object.assign(p, { consumed_sid: message.twilio_sid, consumption_result: result, answered_at: h.clock.toISOString() });
      return { data: { status: name === "sms_grant_optin_prompt" ? "granted" : "applied", result }, error: null };
    });
    locks.set(id, action.catch(() => {}));
    return action;
  };
  h.fake._data.project_party_authority = [
    { engagement_id: "party-a", scope: "site_access" }, { engagement_id: "party-a", scope: "schedule" },
    { engagement_id: "party-b", scope: "site_access" }, { engagement_id: "party-b", scope: "schedule" },
  ];
  // Seed the actual migration literals rather than maintaining a second copy of text.
  const sql = Deno.readTextFileSync(new URL("../../../migrations/00641_field_line_effects_templates.sql", import.meta.url));
  const closing = sql.match(/v_closing\s+CONSTANT\s+text\s*:=\s*'([^']*)'/)![1];
  const block = sql.slice(sql.indexOf("-- <<< FIELD LINE COPY BLOCK"));
  h.fake._data.email_templates = [...block.matchAll(/\(\s*'(sms_[a-z_]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\s*\)/g)]
    .map((m) => ({ slug: m[1], is_active: true, html_content: `${m[3].replace(/''/g, "'")} ${closing}` }));
  const prompt = (overrides: Record<string, unknown> = {}) => {
    const row = { id: "prompt-a", party_id: "party-a", project_id: "project-a", kind: "report_arrival",
      subject_id: "task-a", short_code: "17", version: 1, expires_at: "2026-11-02T14:00:00.000Z",
      answered_at: null, sender_number: h.sender, recipient_phone: h.recipient, created_at: h.clock.toISOString(), ...overrides };
    (h.fake._data.sms_prompts ??= []).push(row);
    return row;
  };
  return { h, effects, touches, prompt };
}

/** Real UUIDs at the shared selection validator boundary; no validation bypass. */
export function selectionFixture(now?: Date) {
  const fixture = inboundFixture(undefined, now);
  const ids = new Map(["project-a", "project-b", "party-a", "party-b", "task-a", "task-b", "studio-a", "studio-b", "prompt-a", "prompt-b"]
    .map((name, i) => [name, "53000000-0000-4000-8000-" + String(i + 1).padStart(12, "0")]));
  const convert = (value: unknown): any => typeof value === "string" ? ids.get(value) ?? value : Array.isArray(value)
    ? value.map(convert) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,convert(v)])) : value;
  for (const [table, rows] of Object.entries(fixture.h.fake._data)) fixture.h.fake._data[table] = convert(rows);
  fixture.h.fake._data.organizations = fixture.h.fake._data.profiles.map(p => ({ id: p.id, name: p.full_name }));
  return { ...fixture, id: (name: string) => ids.get(name) ?? name,
    prompt: (overrides: Record<string, unknown> = {}) => {
      const row = fixture.prompt(overrides); Object.assign(row, convert(row)); return row;
    } };
}

/** Service-role link RPC seam for the stale/forwarded case, not a SQL/RLS oracle.
 * 00640:104-131 derives expiry at mint; :143-162 only revokes when asked and
 * persists SHA-256, never the credential. 00283:201-223 resolves hash/status/
 * expiry and stamps last_used_at: opening does NOT consume or mint a token.
 * Only the identity portion of the narrow DTO (:291-298) is modeled here;
 * work-list projections and authenticated mint permissions remain SQL tests.
 */
export function fieldLinkFixture(now?: Date) {
  const fixture = inboundFixture(undefined, now);
  const { h } = fixture;
  const rpc = h.fake.rpc;
  let mints = 0;
  const hash = async (token: string) => Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  ), (byte) => byte.toString(16).padStart(2, "0")).join("");
  h.fake._data.field_link_tokens = [];
  h.fake.rpc = async (name, args = {}) => {
    const rows = h.fake._data.field_link_tokens;
    if (name === "create_field_link") {
      const party = h.fake._data.project_parties.find((p) => p.id === args.p_party_id);
      if (!party) return { data: null, error: { code: "P0002" } };
      const lastDay = [party.on_site_to, party.warranty_until].filter(Boolean).map(String).sort().at(-1);
      const windowEnd = lastDay ? Date.parse(lastDay + "T00:00:00.000Z") + 86400000 : 0;
      const requested = Date.parse(String(args.p_expires_at ?? ""));
      const expiry = windowEnd > h.clock.getTime() ? windowEnd
        : requested > h.clock.getTime() ? requested : h.clock.getTime() + 90 * 86400000;
      if (args.p_revoke_prior === true) {
        for (const row of rows) if (row.party_id === party.id && row.project_id === party.project_id && row.status === "active") row.status = "revoked";
      }
      const token = (++mints).toString(16).padStart(64, "a");
      const id = "field-link-" + mints;
      rows.push({ id, party_id: party.id, project_id: party.project_id,
        token_hash: await hash(token), expires_at: new Date(expiry).toISOString(),
        status: "active", last_used_at: null });
      return { data: [{ id, token }], error: null };
    }
    if (name === "resolve_field_link") {
      if (typeof args.p_token !== "string" || !args.p_token.trim()) return { data: null, error: null };
      const digest = await hash(args.p_token);
      const row = rows.find((r) => r.token_hash === digest && r.status === "active" &&
        (r.expires_at == null || Date.parse(String(r.expires_at)) > h.clock.getTime()));
      if (!row) return { data: null, error: null };
      const party = h.fake._data.project_parties.find((p) => p.id === row.party_id);
      const project = h.fake._data.projects.find((p) => p.id === row.project_id);
      if (!party || !project) return { data: null, error: null };
      row.last_used_at = h.clock.toISOString();
      return { data: { project: { id: project.id, name: project.name },
        party: { id: party.id, display_name: party.display_name, party_kind: party.party_kind, trade: party.trade ?? null } }, error: null };
    }
    return rpc(name, args);
  };
  return { ...fixture, get mints() { return mints; } };
}

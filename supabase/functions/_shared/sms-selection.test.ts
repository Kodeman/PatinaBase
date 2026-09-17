import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleStatusCallback } from "../sms-status/handler.ts";
import { signTwilio } from "../_tests/sign-twilio.ts";
import { createFakeSupabase } from "../_tests/fake-supabase.ts";
import { flushDeferredMessages, sendPartySms } from "./sms.ts";
import { recoverSmsSelection, selectionSeptets } from "./sms-selection.ts";
import type { SelectionSmsInput } from "./sms-selection.ts";

const id = (n: number) =>
  `52000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PHONE = "+15551230001";
const SENDER = "+15550000000";
const DAY = new Date("2026-09-17T18:00:00Z");
const NIGHT = new Date("2026-09-18T03:00:00Z");
const MORNING = new Date("2026-09-18T13:00:00Z");
// Load the shipped template: the production canonical closing is SQL-owned.
const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/00641_field_line_effects_templates.sql",
    import.meta.url,
  ),
);
const CLOSING = sql.match(/v_closing\s+CONSTANT\s+text\s*:=\s*'([^']+)'/)![1];
const HEAD = sql.match(/\('sms_selection',\s*'[^']+',\s*'([^']+)'/)![1];
const TEMPLATE = `${HEAD} ${CLOSING}`;
type Row = Record<string, unknown>;

function fixture(kind: "project_choice" | "ref_clarify" = "project_choice") {
  let stopped = false;
  let suppressionError = false;
  const fake = createFakeSupabase({
    projects: [
      { id: id(10), studio_id: id(30), name: "Ash House" },
      { id: id(11), studio_id: id(31), name: "Birch House" },
    ],
    organizations: [{ id: id(30), name: "Studio A" }, {
      id: id(31),
      name: "Studio B",
    }],
    project_parties: [0, 1].map((i) => ({
      id: id(20 + i),
      project_id: id(10 + i),
      phone_e164: PHONE,
    })),
    studio_channel_consent: [0, 1].map((i) => ({
      organization_id: id(30 + i),
      channel_kind: "sms",
      channel_value: PHONE,
      status: "granted",
      refusal_unanswered: false,
    })),
    sms_conversations: [{
      id: id(2),
      phone_e164: PHONE,
      twilio_number: SENDER,
    }],
    sms_messages: [{
      id: id(1),
      direction: "inbound",
      conversation_id: id(2),
      created_at: DAY.toISOString(),
      body: "PRIVATE raw incoming text /field/" + "a".repeat(64),
    }],
    sms_prompts: [0, 1].map((i) => ({
      id: id(40 + i),
      party_id: id(20 + i),
      project_id: id(10 + i),
      sender_number: SENDER,
      recipient_phone: PHONE,
      short_code: String(10 + i),
      expires_at: "2026-09-19T18:00:00Z",
      answered_at: null,
    })),
    email_templates: [{
      slug: "sms_selection",
      html_content: TEMPLATE,
      is_active: true,
    }],
  }, {
    sms_is_suppressed: () => ({
      data: stopped,
      error: suppressionError ? { code: "08006" } : null,
    }),
  });
  const input: SelectionSmsInput = {
    kind: "selection",
    phone: PHONE,
    selection: kind === "project_choice"
      ? {
        kind,
        inboundMessageId: id(1),
        options: [0, 1].map((i) => ({
          partyId: id(20 + i),
          projectId: id(10 + i),
        })),
      }
      : {
        kind,
        inboundMessageId: id(1),
        options: [0, 1].map((i) => ({
          partyId: id(20 + i),
          projectId: id(10 + i),
          promptId: id(40 + i),
        })),
      },
  };
  const wires: string[] = [];
  const env: Record<string, string> = {
    SMS_DEV_MODE: "off",
    TWILIO_FROM_NUMBER: SENDER,
    TWILIO_ACCOUNT_SID: "AC_test",
    TWILIO_AUTH_TOKEN: "test",
    FIELD_LINE_PHASE: "1",
  };
  let status = 201;
  let readFailure: string | null = null;
  let insertFailure = false;
  let settleFailure = false;
  let previewFailure: "error" | "throw" | undefined;
  let duplicateCount = 0;
  let afterInsert: (() => void) | undefined;
  const originalFrom = fake.from.bind(fake);
  // Extend only this fixture. SQL below proves real uniqueness; this models
  // the losing INSERT so the TypeScript recovery branch executes under races.
  fake.from = ((table: string) => {
    const builder = originalFrom(table);
    let operation = "select";
    let payload: Row | undefined;
    const run = async (
      method: "single" | "maybeSingle" | "then",
      args: unknown[],
    ) => {
      if (operation === "select" && table === readFailure) {
        return { data: null, error: { code: "08006" } };
      }
      if (operation === "insert" && table === "sms_messages") {
        if (insertFailure) return { data: null, error: { code: "08006" } };
        const duplicate = fake._data.sms_messages.some((r) =>
          r.direction === "outbound" &&
          r.template_key === payload?.template_key &&
          r.dedupe_key === payload?.dedupe_key &&
          r.conversation_id === payload?.conversation_id
        );
        if (duplicate) {
          duplicateCount++;
          return { data: null, error: { code: "23505" } };
        }
      }
      if (
        operation === "update" && table === "sms_messages" && payload?.body &&
        previewFailure
      ) {
        if (previewFailure === "throw") {
          throw new Error("preview transport unavailable");
        }
        return { data: null, error: { code: "08006" } };
      }
      if (
        operation === "update" && table === "sms_messages" && settleFailure &&
        payload?.twilio_status && payload.twilio_status !== "claimed"
      ) return { data: null, error: { code: "08006" } };
      if (method === "then") return await builder;
      const result = await (builder[method] as (...args: unknown[]) => unknown)(
        ...args,
      );
      if (operation === "insert" && table === "sms_messages") afterInsert?.();
      return result;
    };
    const proxy = new Proxy(builder, {
      get(target, key) {
        if (key === "single" || key === "maybeSingle") {
          return (...args: unknown[]) => run(key, args);
        }
        if (key === "then") {
          return (
            ok: (value: unknown) => unknown,
            fail?: (error: unknown) => unknown,
          ) => run("then", []).then(ok, fail);
        }
        const member = Reflect.get(target, key);
        if (typeof member !== "function") return member;
        return (...args: unknown[]) => {
          if (key === "insert" || key === "update") {
            operation = String(key);
            payload = args[0] as Row;
            if (key === "insert" && table === "sms_messages") {
              payload.created_at ??= DAY.toISOString();
            }
          }
          const value = member.apply(target, args);
          return value === target ? proxy : value;
        };
      },
    });
    return proxy;
  }) as typeof fake.from;
  const deps = {
    now: DAY,
    getEnv: (key: string) => env[key],
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      wires.push(new URLSearchParams(String(init?.body)).get("Body")!);
      return new Response(
        JSON.stringify(
          status === 201
            ? { sid: "SM_selection", status: "queued" }
            : { code: 21610, message: "refused" },
        ),
        { status },
      );
    }) as typeof fetch,
  };
  const outbound = () =>
    fake._data.sms_messages.filter((r) => r.direction === "outbound");
  return {
    fake,
    input,
    wires,
    deps,
    env,
    outbound,
    stop: () => {
      stopped = true;
    },
    resume: () => {
      stopped = false;
    },
    unreadableSuppression: () => {
      suppressionError = true;
    },
    failRead: (table: string | null) => {
      readFailure = table;
    },
    failInsert: () => {
      insertFailure = true;
    },
    failSettle: () => {
      settleFailure = true;
    },
    failPreview: (mode?: "error" | "throw") => {
      previewFailure = mode;
    },
    afterInsert: (hook: () => void) => {
      afterInsert = hook;
    },
    rejectProvider: () => {
      status = 400;
    },
    duplicates: () => duplicateCount,
    send: () => sendPartySms(fake as never, input, deps),
    recover: (messageId?: string) =>
      recoverSmsSelection(fake as never, {
        inboundMessageId: id(1),
        kind,
        phone: PHONE,
        messageId,
      }, deps),
    flush: () => flushDeferredMessages(fake as never, deps),
  };
}

for (const kind of ["project_choice", "ref_clarify"] as const) {
  Deno.test(`${kind}: one authorized cross-studio wire and null-attributed durable manifest`, async () => {
    const f = fixture(kind);
    const result = await f.send();
    assertEquals(result.status, "queued");
    assertEquals(
      f.wires.length,
      1,
      "one provider request covers every permitted option",
    );
    assert(f.wires[0].startsWith("Studio A:"));
    assert(f.wires[0].includes("Studio B:"));
    assertEquals(
      f.wires[0].split(CLOSING).length,
      2,
      "canonical closing appears once",
    );
    assert((selectionSeptets(f.wires[0]) ?? Infinity) <= 306);
    const row = f.outbound()[0];
    assertEquals(row.id, result.messageId);
    assertEquals(row.party_id, null);
    assertEquals(row.project_id, null);
    const recipe = row.recipe as Row;
    assertEquals(recipe.params, {});
    assertEquals(recipe.party_id, null);
    assertEquals(recipe.project_id, null);
    assertEquals(result.selection?.manifest.options.length, 2);
    assertEquals(
      result.selection?.usable,
      false,
      "provider queued is not yet asked",
    );
    assert(!JSON.stringify(recipe).includes("PRIVATE"));
    assert(!JSON.stringify(recipe).includes("a".repeat(64)));
    assertEquals(
      kind === "project_choice"
        ? result.selection?.manifest.options.map((o) => o.number)
        : result.selection?.manifest.options.map((o) => o.shortCode),
      kind === "project_choice" ? [1, 2] : ["10", "11"],
    );
  });
}

for (
  const denied of [
    "pending",
    "not_asked",
    "missing",
    "opted_out",
    "refusal_unanswered",
    "never_text",
  ]
) {
  Deno.test(`selection omits ${denied} before numbering and discloses no excluded label/ref/ID`, async () => {
    for (const kind of ["project_choice", "ref_clarify"] as const) {
      const f = fixture(kind);
      if (denied === "missing") f.fake._data.studio_channel_consent.pop();
      else if (denied === "refusal_unanswered") {
        f.fake._data.studio_channel_consent[1].refusal_unanswered = true;
      } else if (denied === "never_text") {
        f.fake._data.studio_contact_rules = [{
          subject_type: "engagement",
          subject_id: id(21),
          channels_forbidden: ["sms"],
        }];
      } else f.fake._data.studio_channel_consent[1].status = denied;
      // Put excluded option first to prove stable numbers start AFTER filtering.
      f.input.selection.options.reverse();
      const result = await f.send();
      assertEquals(result.status, "queued");
      const stored = JSON.stringify(f.outbound());
      for (
        const secret of [
          "Studio B",
          "Birch House",
          "Ref 11",
          id(11),
          id(21),
          id(41),
        ]
      ) {
        assert(
          !stored.includes(secret),
          `excluded ${secret} must not be stored`,
        );
      }
      assertEquals(result.selection?.manifest.options.length, 1);
      assert(
        f.wires[0].includes(
          kind === "project_choice"
            ? "1) Ash House. Which project?"
            : "Repeat your word",
        ),
        "one permitted option still asks explicitly",
      );
    }
  });
}

Deno.test("zero authorized options returns owned-review-needed without active question", async () => {
  const f = fixture();
  f.fake._data.studio_channel_consent.forEach((r) => {
    r.status = "pending";
  });
  const result = await f.send();
  assertEquals(result.reason, "selection_review_needed");
  assertEquals(result.selection, undefined);
  assertEquals(f.outbound(), []);
  assertEquals(f.wires, []);
});

Deno.test("source, endpoint, party/project/phone and prompt mismatches fail closed", async () => {
  const mutations: ((f: ReturnType<typeof fixture>) => void)[] = [
    (f) => {
      f.fake._data.sms_messages[0].direction = "outbound";
    },
    (f) => {
      f.fake._data.sms_conversations[0].phone_e164 = "+15551239999";
    },
    (f) => {
      f.fake._data.sms_conversations[0].twilio_number = "+15551239999";
    },
    (f) => {
      f.fake._data.project_parties[1].phone_e164 = "+15551239999";
    },
    (f) => {
      f.fake._data.project_parties[1].project_id = id(10);
    },
    (f) => {
      f.fake._data.sms_prompts[1].party_id = id(20);
    },
    (f) => {
      f.fake._data.sms_prompts[1].project_id = id(10);
    },
    (f) => {
      f.fake._data.sms_prompts[1].sender_number = "+15551239999";
    },
    (f) => {
      f.fake._data.sms_prompts[1].recipient_phone = "+15551239999";
    },
    (f) => {
      f.fake._data.sms_prompts[1].answered_at = DAY.toISOString();
    },
    (f) => {
      f.fake._data.sms_prompts[1].expires_at = DAY.toISOString();
    },
    (f) => {
      f.fake._data.projects[1].studio_id = null;
    },
  ];
  for (const mutate of mutations) {
    const f = fixture("ref_clarify");
    mutate(f);
    const result = await f.send();
    assertEquals(result.status, "failed");
    assertEquals(f.wires.length, 0);
    assertEquals(result.selection, undefined);
  }
});

Deno.test("every unreadable authority refuses the whole initial envelope", async () => {
  for (
    const table of [
      "sms_messages",
      "sms_conversations",
      "project_parties",
      "sms_prompts",
      "projects",
      "organizations",
      "studio_channel_consent",
      "studio_contact_rules",
      "email_templates",
    ]
  ) {
    const f = fixture("ref_clarify");
    f.failRead(table);
    assertEquals((await f.send()).status, "failed", table);
    assertEquals(f.wires, [], table);
  }
  const f = fixture();
  f.unreadableSuppression();
  assertEquals((await f.send()).reason, "suppression_unreadable");
});

Deno.test("selection accepts IDs only and rejects caller prose/vars/links and duplicate options", async () => {
  for (
    const extra of [
      { body: "caller" },
      { auditBody: "caller" },
      { vars: {} },
      { link: "secret" },
      { partyId: id(20) },
      { templateKey: "sms_help" },
      { deferToCaller: true },
      { dedupeKey: "custom" },
    ]
  ) {
    const f = fixture();
    Object.assign(f.input, extra);
    assertEquals((await f.send()).reason, "selection_invalid");
    assertEquals(f.wires, []);
  }
  const f = fixture();
  assert(f.input.selection.kind === "project_choice");
  f.input.selection.options.push(f.input.selection.options[0]);
  assertEquals((await f.send()).reason, "selection_invalid");
});

Deno.test("selection budgets enforce maximum names, GSM extensions, no truncation or drop-to-fit", async () => {
  for (
    const name of [
      "",
      "A".repeat(25),
      "[".repeat(13),
      "Studio 🌳",
      "https://secret",
      "a".repeat(64),
      "Studio\nSTOP",
    ]
  ) {
    const f = fixture();
    f.fake._data.organizations[0].name = name;
    assertEquals((await f.send()).status, "failed", name);
    assertEquals(f.wires, []);
  }
  const f = fixture("ref_clarify");
  f.fake._data.organizations.forEach((r) => {
    r.name = "[".repeat(12);
  });
  f.fake._data.projects.forEach((r) => {
    r.name = "P".repeat(24);
  });
  assertEquals((await f.send()).status, "queued");
  assertEquals(selectionSeptets("[".repeat(12)), 24);
  assert((selectionSeptets(f.wires[0]) ?? Infinity) <= 306);
  const big = fixture();
  assert(big.input.selection.kind === "project_choice");
  for (let i = 2; i < 10; i++) {
    big.fake._data.projects.push({
      id: id(100 + i),
      studio_id: id(30),
      name: "P".repeat(24),
    });
    big.fake._data.project_parties.push({
      id: id(200 + i),
      project_id: id(100 + i),
      phone_e164: PHONE,
    });
    big.input.selection.options.push({
      partyId: id(200 + i),
      projectId: id(100 + i),
    });
  }
  assertEquals((await big.send()).reason, "selection_copy_invalid");
  assertEquals(big.outbound(), []);
});

Deno.test("quiet-hour selection is durable but not asked; unchanged flush sends once", async () => {
  const f = fixture();
  f.deps.now = NIGHT;
  const queued = await f.send();
  assertEquals(queued.status, "deferred");
  assertEquals(queued.selection?.usable, false);
  assertEquals(f.wires, []);
  assertEquals(queued.messageId, f.outbound()[0].id);
  f.deps.now = MORNING;
  await Promise.all([f.flush(), f.flush()]);
  assertEquals(
    f.wires.length,
    1,
    "exclusive row claim prevents concurrent double wire",
  );
  assertEquals((await f.recover()).messageId, queued.messageId);
  f.outbound()[0].twilio_status = "delivered";
  assertEquals(
    (await f.recover()).selection?.usable,
    true,
    "delivery status unlocks an otherwise validated question",
  );
});

Deno.test("withdrawal and STOP suppress the entire deferred manifest without renumbering or START revival", async () => {
  for (const withdrawal of ["consent", "never_text", "stop", "prompt"]) {
    const f = fixture("ref_clarify");
    f.deps.now = NIGHT;
    assertEquals((await f.send()).status, "deferred");
    const manifest = JSON.stringify((f.outbound()[0].recipe as Row).selection);
    if (withdrawal === "consent") {
      f.fake._data.studio_channel_consent[1].status = "opted_out";
    } else if (withdrawal === "never_text") {
      f.fake._data.studio_contact_rules = [{
        subject_type: "engagement",
        subject_id: id(21),
        channels_forbidden: ["sms"],
      }];
    } else if (withdrawal === "prompt") {
      f.fake._data.sms_prompts[1].answered_at = MORNING.toISOString();
    } else f.stop();
    f.deps.now = MORNING;
    await f.flush();
    assertEquals(f.wires, [], withdrawal);
    assertEquals(f.outbound()[0].twilio_status, "suppressed", withdrawal);
    assertEquals(
      JSON.stringify((f.outbound()[0].recipe as Row).selection),
      manifest,
      "stored numbering/refs never changes",
    );
    f.resume();
    f.fake._data.studio_channel_consent.forEach((r) => {
      r.status = "granted";
    });
    assertEquals((await f.send()).status, "failed");
    assertEquals(f.wires, []);
  }
});

Deno.test("flush read failure holds; source TTL and prompt expiry refuse; phase holds and resumes", async () => {
  const f = fixture();
  f.deps.now = NIGHT;
  f.input.automationPhase = 1;
  assertEquals((await f.send()).status, "deferred");
  f.deps.now = MORNING;
  f.failRead("studio_channel_consent");
  await f.flush();
  assertEquals(f.outbound()[0].twilio_status, "deferred");
  assertEquals(f.wires, []);
  f.failRead(null);
  f.env.FIELD_LINE_PHASE = "0";
  await f.flush();
  assertEquals(f.outbound()[0].twilio_status, "deferred");
  assertEquals(f.wires, []);
  f.env.FIELD_LINE_PHASE = "1";
  await f.flush();
  assertEquals(f.wires.length, 1);
  const ttl = fixture();
  ttl.deps.now = NIGHT;
  await ttl.send();
  ttl.deps.now = new Date("2026-09-18T18:00:00Z");
  await ttl.flush();
  assertEquals(ttl.outbound()[0].twilio_status, "expired");
  assertEquals(ttl.wires, []);
  const prompt = fixture("ref_clarify");
  prompt.fake._data.sms_prompts[1].expires_at = "2026-09-18T12:00:00Z";
  prompt.deps.now = NIGHT;
  await prompt.send();
  prompt.deps.now = MORNING;
  await prompt.flush();
  assertEquals(prompt.wires, []);
  assertEquals(prompt.outbound()[0].twilio_status, "expired");
});

Deno.test("duplicate races and lost metadata recover the actual row/status and original manifest", async () => {
  const f = fixture();
  f.deps.now = NIGHT;
  const results = await Promise.all([f.send(), f.send(), f.send()]);
  assertEquals(f.outbound().length, 1);
  assert(f.duplicates() > 0, "losing INSERT branch ran");
  assert(
    results.every((r) =>
      r.messageId === results[0].messageId && r.status === "deferred"
    ),
  );
  f.input.selection.options.reverse();
  const recovered = await f.send();
  assertEquals(
    recovered.selection?.manifest.options[0].partyId,
    id(20),
    "new input cannot replace stored manifest",
  );
  assertEquals(
    (await f.recover(results[0].messageId)).selection,
    recovered.selection,
    "no chooser metadata is needed to recover",
  );
  assertEquals(
    (await f.recover(id(999))).found,
    false,
    "row ID must bind the origin and kind",
  );
  f.outbound()[0].twilio_status = "claimed";
  f.outbound()[0].claimed_at = MORNING.toISOString();
  assertEquals(
    (await f.recover()).status,
    "failed",
    "a held claim never invents queued",
  );
  assertEquals((await f.recover()).selection?.usable, false);
});

Deno.test("stale claim recovery reuses the same selection row, live claim does not send", async () => {
  const f = fixture();
  f.deps.now = NIGHT;
  assertEquals((await f.send()).status, "deferred");
  const row = f.outbound()[0];
  row.twilio_status = "claimed";
  row.claimed_at = MORNING.toISOString();
  f.deps.now = MORNING;
  await f.flush();
  assertEquals(f.wires, []);
  row.claimed_at = NIGHT.toISOString();
  await f.flush();
  assertEquals(f.wires.length, 1);
  assertEquals((await f.recover()).messageId, row.id);
});

Deno.test("INSERT/provider/settlement failures never yield a usable chooser", async () => {
  for (const now of [DAY, NIGHT]) {
    const f = fixture();
    f.deps.now = now;
    f.failInsert();
    const result = await f.send();
    assertEquals(result.status, "failed");
    assertEquals(result.messageId, undefined);
    assertEquals(f.wires, []);
  }
  const rejected = fixture();
  rejected.rejectProvider();
  const result = await rejected.send();
  assertEquals(result.status, "failed");
  assertEquals(result.provider_code, "21610");
  assertEquals(result.selection, undefined);
  assertEquals((await rejected.send()).messageId, result.messageId);
  assertEquals(
    rejected.wires.length,
    1,
    "terminal retry cannot resurrect a question",
  );
  const unsettled = fixture();
  unsettled.failSettle();
  const pending = await unsettled.send();
  assertEquals(pending.selection?.usable, false);
  assertEquals(pending.selection?.deliveryStatus, "claimed");
  assertEquals(pending.status, "failed");
});

Deno.test("recovery binds exact manifest/expiry/endpoints and does not authorize tampered recipes", async () => {
  const mutations: ((r: Row) => void)[] = [
    (r) => {
      r.party_id = id(20);
    },
    (r) => {
      (r.recipe as Row).params = { link: "secret" };
    },
    (r) => {
      ((r.recipe as Row).selection as Row).expiresAt = "2030-01-01T00:00:00Z";
    },
    (r) => {
      ((r.recipe as Row).selection as Row).conversationId = id(999);
    },
    (r) => {
      ((r.recipe as Row).selection as Row).senderNumber = "+15551239999";
    },
    (r) => {
      const options = ((r.recipe as Row).selection as Row).options as Row[];
      options[1].number = 1;
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    f.deps.now = NIGHT;
    assertEquals((await f.send()).status, "deferred");
    mutate(f.outbound()[0]);
    assertEquals((await f.recover()).selection, undefined);
    f.deps.now = MORNING;
    await f.flush();
    assertEquals(f.wires, []);
  }
});

Deno.test("ordinary null-attribution stays refused and cannot select the reserved template", async () => {
  const f = fixture();
  const ordinary = await sendPartySms(f.fake as never, {
    phone: PHONE,
    body: "Studio A and Studio B",
  }, f.deps);
  assertEquals(ordinary.reason, "not_consented");
  const reserved = await sendPartySms(f.fake as never, {
    partyId: id(20),
    templateKey: "sms_selection",
    vars: { selection: "caller" },
  }, f.deps);
  assertEquals(reserved.reason, "selection_input_required");
  assertEquals(f.wires, []);
});

Deno.test("withdrawal while acquiring the initial claim sends nothing", async () => {
  const f = fixture();
  f.afterInsert(() => {
    f.fake._data.studio_channel_consent[1].status = "opted_out";
  });
  const result = await f.send();
  assertEquals(result.status, "failed");
  assertEquals(f.outbound().length, 1, "withdrawn claim remains durable");
  assertEquals(f.outbound()[0].twilio_status, "suppressed");
  assertEquals(result.selection, undefined);
  assertEquals(f.wires, []);
});

// SQ-54 reproductions and all nine review controls, using the repository fixture.
async function receipt(f: any, status: string) {
  const url = "https://example.test/status", token = "local-review-token";
  const params = { MessageSid: "SM_selection", MessageStatus: status };
  const signature = await signTwilio(token, url, params);
  const req = new Request(url, {
    method: "POST",
    headers: {
      "X-Twilio-Signature": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  assertEquals(
    (await handleStatusCallback(req, {
      supabase: f.fake,
      getEnv: (k: string) =>
        ({ TWILIO_AUTH_TOKEN: token, SMS_STATUS_CALLBACK_URL: url } as Record<
          string,
          string
        >)[k],
    })).status,
    204,
  );
}
Deno.test("receipt regression: failed selection must not revive on a late sent callback", async () => {
  const f = fixture();
  await f.send();
  await receipt(f, "failed");
  assertEquals((await f.recover()).selection, undefined);
  await receipt(f, "sent");
  const actual = await f.recover();
  console.log(JSON.stringify({ afterLateSent: actual }));
  assertEquals(
    actual.selection?.usable ?? false,
    false,
    "terminal failed question must stay unusable",
  );
});
Deno.test("receipt regression: delivered selection must not become unasked on a late queued callback", async () => {
  const f = fixture();
  await f.send();
  await receipt(f, "delivered");
  assertEquals((await f.recover()).selection?.usable, true);
  await receipt(f, "queued");
  const actual = await f.recover();
  console.log(JSON.stringify({ afterLateQueued: actual }));
  assertEquals(
    actual.selection?.usable,
    true,
    "delivered question remains usable after older queued receipt",
  );
});
Deno.test("post-claim authority: initial wire must use freshly authorized organization", async () => {
  const f = fixture();
  f.fake._data.organizations.push({ id: id(32), name: "Studio C" });
  f.fake._data.studio_channel_consent.push({
    organization_id: id(32),
    channel_kind: "sms",
    channel_value: PHONE,
    status: "granted",
    refusal_unanswered: false,
  });
  f.afterInsert(() => {
    f.fake._data.projects[1].studio_id = id(32);
    f.fake._data.studio_channel_consent[1].status = "opted_out";
  });
  await f.send();
  console.log(
    JSON.stringify({
      actualWire: f.wires[0],
      currentOrganization: f.fake._data.projects[1].studio_id,
    }),
  );
  assert(
    !f.wires[0].includes("Studio B"),
    "wire must not use the now-denied old studio label",
  );
  assert(
    f.wires[0].includes("Studio C"),
    "wire uses the same authority resolved after claim",
  );
  assertEquals(
    f.outbound()[0].body,
    f.wires[0],
    "stored preview matches the accepted post-claim render",
  );
});
Deno.test("concurrent initial day sends claim one row and emit exactly one wire", async () => {
  const f = fixture();
  const rs = await Promise.all([f.send(), f.send(), f.send()]);
  assertEquals(f.outbound().length, 1);
  assertEquals(f.wires.length, 1);
  assert(rs.every((r) => r.messageId === rs[0].messageId));
});
Deno.test("recovery and flush revalidate deleted, changed or unreadable source authority", async () => {
  const mutations = [(f: any) => {
    f.fake._data.sms_messages[0].direction = "outbound";
  }, (f: any) => {
    f.fake._data.sms_messages[0].conversation_id = id(999);
  }, (f: any) => {
    f.fake._data.project_parties[1].phone_e164 = "+15559999999";
  }, (f: any) => {
    f.fake._data.sms_prompts[1].answered_at = MORNING.toISOString();
  }, (f: any) => {
    f.fake._data.projects[1].studio_id = id(999);
  }, (f: any) => {
    f.fake._data.organizations = [];
  }];
  for (const mutate of mutations) {
    const f = fixture("ref_clarify");
    f.deps.now = NIGHT;
    await f.send();
    mutate(f);
    assertEquals((await f.recover()).selection, undefined);
    f.deps.now = MORNING;
    await f.flush();
    assertEquals(f.wires.length, 0);
  }
  for (
    const table of [
      "sms_messages",
      "sms_conversations",
      "project_parties",
      "sms_prompts",
      "projects",
      "organizations",
      "studio_channel_consent",
      "studio_contact_rules",
      "email_templates",
    ]
  ) {
    const f = fixture("ref_clarify");
    f.deps.now = NIGHT;
    await f.send();
    f.failRead(table);
    assertEquals((await f.recover()).selection, undefined);
    f.deps.now = MORNING;
    await f.flush();
    assertEquals(f.wires.length, 0);
  }
});
Deno.test("expired provider-queued selection stays unusable even after late delivered callback", async () => {
  const f = fixture();
  await f.send();
  f.deps.now = new Date("2026-09-18T18:00:00Z");
  assertEquals((await f.recover()).reason, "selection_expired");
  await receipt(f, "delivered");
  assertEquals((await f.recover()).selection, undefined);
  await f.flush();
  assertEquals(f.wires.length, 1);
});
Deno.test("STOP wins over all fresh grants and terminal suppression is not revived by START", async () => {
  const f = fixture();
  f.deps.now = NIGHT;
  await f.send();
  f.stop();
  f.fake._data.studio_channel_consent.forEach((r: any) => {
    r.status = "granted";
    r.refusal_unanswered = false;
  });
  f.deps.now = MORNING;
  await f.flush();
  assertEquals(f.outbound()[0].twilio_status, "suppressed");
  f.resume();
  assertEquals((await f.send()).selection, undefined);
  assertEquals(f.wires.length, 0);
});
Deno.test("transport exception retains ambiguous claim; no immediate retry, TTL is at-least-once", async () => {
  const f = fixture();
  const fetch = f.deps.fetchImpl;
  f.deps.fetchImpl = (async () => {
    throw new Error("transport outcome unknown");
  }) as typeof fetch;
  await assertRejects(() => f.send());
  assertEquals(f.outbound()[0].twilio_status, "claimed");
  assertEquals((await f.recover()).selection?.usable, false);
  f.deps.fetchImpl = fetch;
  await f.send();
  assertEquals(f.wires.length, 0);
  f.deps.now = new Date(DAY.getTime() + 16 * 60000);
  await f.flush();
  assertEquals(f.wires.length, 1);
});
Deno.test("durable SID with failed settlement is never reclaimed before receipt", async () => {
  const f = fixture();
  f.failSettle();
  await f.send();
  assertEquals(f.outbound()[0].twilio_sid, "SM_selection");
  f.deps.now = new Date(DAY.getTime() + 16 * 60000);
  await f.flush();
  assertEquals(f.wires.length, 1);
  assertEquals((await f.recover()).selection?.usable, false);
});
Deno.test("stored preview is never the wire and canonical closing occurs once", async () => {
  const f = fixture();
  f.deps.now = NIGHT;
  await f.send();
  f.outbound()[0].body = "attacker preview /field/" + "a".repeat(64);
  f.deps.now = MORNING;
  await f.flush();
  assertEquals(f.wires.length, 1);
  assert(!f.wires[0].includes("attacker"));
  assertEquals(f.wires[0].split(CLOSING).length, 2);
});
Deno.test("source timestamp future and exact expiry boundaries refuse", async () => {
  for (
    const created of [
      new Date(DAY.getTime() + 1),
      new Date(DAY.getTime() - 86400000),
    ]
  ) {
    const f = fixture();
    f.fake._data.sms_messages[0].created_at = created.toISOString();
    assertEquals((await f.send()).reason, "selection_expired");
    assertEquals(f.wires.length, 0);
  }
});
Deno.test("fresh render is used after deferred claim changes organization", async () => {
  const f = fixture();
  f.deps.now = NIGHT;
  await f.send();
  f.fake._data.organizations[1].name = "Studio Renamed";
  f.deps.now = MORNING;
  await f.flush();
  assert(f.wires[0].includes("Studio Renamed"));
  assert(!f.wires[0].includes("Studio B"));
});

Deno.test("post-claim preview persistence failure releases before provider and retries fresh", async () => {
  for (const mode of ["error", "throw"] as const) {
    const f = fixture();
    f.failPreview(mode);
    const result = await f.send();
    assertEquals(result.reason, "selection_preview_unrecorded");
    assertEquals(
      f.wires.length,
      0,
      "never send without matching persisted preview",
    );
    assertEquals(
      f.outbound()[0].twilio_status,
      "deferred",
      "pre-provider failure releases claim",
    );
    assertEquals(f.outbound()[0].twilio_sid, null);
    f.failPreview();
    await f.flush();
    assertEquals(f.wires.length, 1);
  }
});

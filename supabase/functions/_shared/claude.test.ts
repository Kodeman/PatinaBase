import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FakeTime } from "https://deno.land/std@0.224.0/testing/time.ts";
import {
  APIConnectionTimeoutError,
  APIError,
} from "npm:@anthropic-ai/sdk@0.133.0";
import { resolveCaller } from "./caller.ts";
import {
  adjudicationErrorFromClaudeFailure,
  isTransientAdjudicationError,
} from "../board-deck-import-resolve/core.ts";
import {
  callClaude,
  type ClaudeCaller,
  createLlmLedger,
  LEDGER_SETTLE_MS,
  type LlmLedgerPort,
  type ModelResponse,
} from "./claude.ts";

const response: ModelResponse = {
  stop_reason: "end_turn",
  content: [{ type: "text", text: "private answer" }],
  usage: {
    input_tokens: 1000,
    output_tokens: 200,
    cache_creation_input_tokens: 100,
    cache_read_input_tokens: 100,
  },
};

function fakeLedger(
  granted = true,
  deniedReason = "feature_daily",
): {
  ledger: LlmLedgerPort;
  settlements: Array<
    { usageId: number; fields: Parameters<LlmLedgerPort["settle"]>[1] }
  >;
  reserves: number[];
} {
  const settlements: Array<
    { usageId: number; fields: Parameters<LlmLedgerPort["settle"]>[1] }
  > = [];
  const reserves: number[] = [];
  return {
    settlements,
    reserves,
    ledger: {
      async reserve(_feature, _studio, _user, estimate) {
        reserves.push(estimate);
        return {
          granted,
          reason: granted ? null : deniedReason,
          usageId: granted ? 44 : null,
        };
      },
      async settle(usageId, fields) {
        settlements.push({ usageId, fields });
      },
    },
  };
}

const options = (extra: Partial<Parameters<typeof callClaude>[0]> = {}) => ({
  feature: "test-feature",
  role: "extract" as const,
  studioId: "studio-1",
  userId: "user-1",
  promptVersion: "v1",
  params: {
    max_tokens: 300,
    messages: [{ role: "user", content: "secret prompt" }],
  },
  timeoutMs: 5000,
  clientOptions: { apiKey: "test-key" },
  ...extra,
});

Deno.test("callClaude denied reservation never invokes model and maps cap to budget", async () => {
  const { ledger } = fakeLedger(false);
  let invoked = false;
  const result = await callClaude(options({
    ledger,
    caller: async () => {
      invoked = true;
      return response;
    },
  }));
  assertEquals(result, {
    ok: false,
    denied: "budget",
    reason: "feature_daily",
    resetsAt: null,
  });
  assertEquals(invoked, false);
});

Deno.test("callClaude maps kill and disabled ledger denials without calling model", async () => {
  for (
    const [reason, denied] of [["kill", "kill"], [
      "disabled",
      "disabled",
    ]] as const
  ) {
    const { ledger } = fakeLedger(false, reason);
    let invoked = false;
    const result = await callClaude(options({
      ledger,
      caller: async () => {
        invoked = true;
        return response;
      },
    }));
    assertEquals(result, { ok: false, denied, reason, resetsAt: null });
    assertEquals(invoked, false);
  }
});
Deno.test("callClaude success settles exact usage cost and emits content-free PostHog properties", async () => {
  const { ledger, settlements } = fakeLedger();
  const sent: Record<string, unknown>[] = [];
  let request: Record<string, unknown> = {};
  const caller: ClaudeCaller = async (params) => {
    request = params;
    return response;
  };
  const result = await callClaude(options({
    ledger,
    caller,
    clientOptions: {
      apiKey: "test-key",
      capture: async (_fn, _event, props) => {
        sent.push(props ?? {});
      },
    },
  }));
  assert(result.ok);
  assertEquals(result.usd, 0.00426);
  assertEquals(settlements.length, 1);
  assertEquals(settlements[0].usageId, 44);
  assertEquals(settlements[0].fields.status, "settled");
  assertEquals(settlements[0].fields.usd, 0.00426);
  assertEquals(request.model, "claude-sonnet-5-5");
  assertEquals((request.output_config as { effort: string }).effort, "medium");
  assertEquals(sent.length, 1);
  for (const key of Object.keys(sent[0])) {
    assert(
      !["content", "messages", "system", "prompt"].includes(key),
      `unexpected content key ${key}`,
    );
  }
  assertEquals(sent[0].feature, "test-feature");
  assertEquals(sent[0].prompt_version, "v1");
});

Deno.test("callClaude missing API key disables before reserving", async () => {
  const { ledger, reserves } = fakeLedger();
  let log = "";
  const result = await callClaude(options({
    ledger,
    clientOptions: {
      getEnv: () => undefined,
      log: (event) => {
        log = event;
      },
    },
  }));
  assertEquals(result, {
    ok: false,
    denied: "disabled",
    reason: "disabled",
    resetsAt: null,
  });
  assertEquals(reserves.length, 0);
  assertEquals(log, "claude_disabled");
});

Deno.test("callClaude records failed API call as an error settlement", async () => {
  const { ledger, settlements } = fakeLedger();
  const failure = new Error("API unavailable");
  const result = await callClaude(options({
    ledger,
    caller: async () => {
      throw failure;
    },
  }));
  assert(!result.ok);
  if (!result.ok && "error" in result) {
    assertStringIncludes(result.error, "API unavailable");
  }
  assertEquals(settlements.length, 1);
  assertEquals(settlements[0].fields.status, "error");
  assertEquals(settlements[0].fields.usd, 0);
});

Deno.test("callClaude returns a failed call's settled cost when the error reported usage", async () => {
  const { ledger, settlements } = fakeLedger();
  const billed = Object.assign(new Error("stream cut after the answer began"), {
    usage: { input_tokens: 1000, output_tokens: 200 },
  });
  const result = await callClaude(options({
    ledger,
    caller: async () => {
      throw billed;
    },
  }));
  assert(!result.ok && "error" in result);
  assertEquals(settlements.map((entry) => entry.fields.status), ["error"]);
  assert(settlements[0].fields.usd > 0, "the billed usage is settled");
  assertEquals(result.usd, settlements[0].fields.usd);
});

Deno.test("callClaude hands the caller its abort signal; an aborted call settles as an error", async () => {
  const { ledger, settlements } = fakeLedger();
  const controller = new AbortController();
  const seen: (AbortSignal | undefined)[] = [];
  const pending = callClaude(options({
    ledger,
    signal: controller.signal,
    caller: (_params, signal) => {
      seen.push(signal);
      if (!signal) return Promise.reject(new Error("no signal to abort with"));
      return new Promise<ModelResponse>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("Request was aborted.")));
      });
    },
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  const result = await pending;
  assertEquals(seen, [controller.signal]);
  assert(!result.ok && "error" in result);
  assertStringIncludes(result.error, "aborted");
  assertEquals(settlements.map((entry) => [entry.fields.status, entry.fields.usd]), [["error", 0]]);
  assertEquals("usd" in result, false, "no usage known, no cost claimed");
});

/** Answers after `ms` real milliseconds, unless the signal it is handed aborts first. */
function late<T>(ms: number, value: T, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

Deno.test("callClaude gives up a reservation the ledger has not answered once its signal aborts", async () => {
  const handed: (AbortSignal | undefined)[] = [];
  const ledger: LlmLedgerPort = {
    reserve: (_feature, _studio, _user, _usd, _role, _version, signal?: AbortSignal) => {
      handed.push(signal);
      return late(200, { granted: true, reason: null, usageId: 44 }, signal);
    },
    settle: async () => {},
  };
  const controller = new AbortController();
  let invoked = false;
  const pending = callClaude(options({
    ledger,
    signal: controller.signal,
    caller: async () => {
      invoked = true;
      return response;
    },
  }));
  setTimeout(() => controller.abort(new Error("no answer in time")), 5);
  const result = await pending;
  assert(!result.ok && "error" in result, "the call went ahead");
  assertEquals([result.errorType, result.error], ["ledger_error", "no answer in time"]);
  assertEquals(invoked, false);
  assertEquals(handed, [controller.signal]);
});

Deno.test("callClaude bounds settling by its ledger signal: a paid answer returns, and the unsettled row is logged", async () => {
  const controller = new AbortController();
  const ledger: LlmLedgerPort = {
    reserve: async () => ({ granted: true, reason: null, usageId: 44 }),
    settle: (_usageId, _fields, signal?: AbortSignal) => late(200, undefined, signal),
  };
  const { logs, clientOptions } = recorder();
  const pending = callClaude(options({ ledger, ledgerSignal: controller.signal, caller: async () => paidResponse, clientOptions }));
  setTimeout(() => controller.abort(new Error("no answer in time")), 5);
  const result = await pending;
  assert(result.ok);
  assertEquals(result.usd, 0.003);
  assertEquals(logs.filter((entry) => entry.event === "claude_ledger_settle_failed").length, 1, "the unsettled row was not logged");
});

Deno.test("callClaude settles inside its own window: a settle that never answers still returns the paid answer and its cost", async () => {
  const time = new FakeTime(0);
  try {
    const ledger: LlmLedgerPort = {
      reserve: async () => ({ granted: true, reason: null, usageId: 44 }),
      // Never answers and never looks at its signal.
      settle: () => new Promise<void>(() => {}),
    };
    const { logs, clientOptions } = recorder();
    let result: Awaited<ReturnType<typeof callClaude>> | undefined;
    void callClaude(options({ ledger, caller: async () => paidResponse, clientOptions })).then((r) => (result = r));
    await time.tickAsync(LEDGER_SETTLE_MS - 1);
    assertEquals(result, undefined, "the call returned before its settle window passed");
    await time.tickAsync(1);
    await time.runMicrotasks();
    assert(result, "callClaude was still waiting on a settle that never answers");
    assert(result.ok);
    assertEquals(result.usd, 0.003);
    assertEquals(result.response.content, paidResponse.content);
    const unsettled = logs.filter((entry) => entry.event === "claude_ledger_settle_failed");
    assertEquals(unsettled.length, 1, "the unsettled row was not logged");
    assertEquals([unsettled[0].fields?.usage_id, unsettled[0].fields?.usd], [44, 0.003]);
  } finally {
    time.restore();
  }
});

Deno.test("createLlmLedger hands its signal to llm_reserve and llm_settle", async () => {
  const signals: Record<string, AbortSignal> = {};
  // A query builder: awaited as is, or through abortSignal.
  const reply = (name: string) => {
    const answer = { data: name === "llm_reserve" ? granted().data : null, error: null };
    return {
      abortSignal(signal: AbortSignal) {
        signals[name] = signal;
        return Promise.resolve(answer);
      },
      then: (resolve: (value: typeof answer) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(answer).then(resolve, reject),
    };
  };
  const admin = { rpc: (name: string) => reply(name) } as never;
  const ledger = createLlmLedger(admin);
  const signal = new AbortController().signal;
  await ledger.reserve("test-feature", "studio-1", "user-1", 0.01, "extract", "v1", signal);
  await ledger.settle(44, {
    model: "claude-sonnet-5-5",
    usage: { input_tokens: 1, output_tokens: 1 },
    usd: 0,
    status: "settled",
    stopReason: null,
    latencyMs: 1,
  }, signal);
  assertEquals(signals, { llm_reserve: signal, llm_settle: signal });
});

Deno.test("callClaude request helper removes rejected forced-tool and disabled-thinking options", async () => {
  const { ledger } = fakeLedger();
  let request: Record<string, unknown> = {};
  await callClaude(options({
    ledger,
    caller: async (params) => {
      request = params;
      return response;
    },
    params: {
      max_tokens: 20,
      messages: [{ role: "user", content: "x" }],
      tool_choice: { type: "tool", name: "schema" },
      thinking: { type: "disabled" },
    },
  }));
  assertEquals("tool_choice" in request, false);
  assertEquals("thinking" in request, false);
});

type RpcReply = { data?: unknown; error?: Error };

/** Supabase admin stub: the real createLlmLedger and resolveCaller run over it. */
function fakeAdmin(
  handlers: Record<string, (args: Record<string, unknown>) => RpcReply>,
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
    // Thenable like a PostgREST builder, which also takes an abort signal.
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const reply = handlers[name]?.(args) ?? {};
      const result = Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null });
      return Object.assign(result, { abortSignal: () => result });
    },
  };
  return { admin: admin as never, calls };
}

const granted = (): RpcReply => ({
  data: { granted: true, reason: null, usage_id: 44, resets_at: null },
});

// Sonnet: 1000 input * $2/MTok + 100 output * $10/MTok = $0.003.
const paidResponse: ModelResponse = {
  stop_reason: "end_turn",
  content: [{ type: "text", text: "paid answer" }],
  usage: { input_tokens: 1000, output_tokens: 100 },
};

function recorder() {
  const logs: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  return {
    logs,
    clientOptions: {
      apiKey: "test-key",
      log: (event: string, fields?: Record<string, unknown>) => {
        logs.push({ event, fields });
      },
      capture: async () => {},
    },
  };
}

Deno.test("callClaude sends role and prompt version to llm_reserve and returns the RPC's daily denial with its reset time", async () => {
  const { admin, calls } = fakeAdmin({
    llm_reserve: () => ({
      data: {
        granted: false,
        reason: "feature_daily",
        usage_id: 9,
        resets_at: "2026-10-14T00:00:00+00:00",
      },
    }),
  });
  let invoked = false;
  const result = await callClaude(options({
    ledger: createLlmLedger(admin),
    caller: async () => {
      invoked = true;
      return paidResponse;
    },
  }));
  assertEquals(result, {
    ok: false,
    denied: "budget",
    reason: "feature_daily",
    resetsAt: "2026-10-14T00:00:00+00:00",
  });
  assertEquals(invoked, false);
  assertEquals(calls.length, 1);
  const { p_est_usd, ...args } = calls[0].args;
  assertEquals(args, {
    p_feature: "test-feature",
    p_studio_id: "studio-1",
    p_user_id: "user-1",
    p_role: "extract",
    p_prompt_version: "v1",
  });
  assert(typeof p_est_usd === "number" && p_est_usd > 0);
});

Deno.test("callClaude retries a failed settle once with the same real usage", async () => {
  let settleAttempts = 0;
  const { admin, calls } = fakeAdmin({
    llm_reserve: granted,
    llm_settle: () =>
      ++settleAttempts === 1 ? { error: new Error("connection reset") } : {},
  });
  const { logs, clientOptions } = recorder();
  const result = await callClaude(options({
    ledger: createLlmLedger(admin),
    caller: async () => paidResponse,
    clientOptions,
  }));
  assert(result.ok);
  assertEquals(result.usd, 0.003);
  const settles = calls.filter((call) => call.name === "llm_settle");
  assertEquals(settles.length, 2);
  assertEquals(settles[1].args, settles[0].args);
  const { p_latency_ms, ...settled } = settles[1].args;
  assertEquals(settled, {
    p_usage_id: 44,
    p_model: "claude-sonnet-5-5",
    p_input_tokens: 1000,
    p_output_tokens: 100,
    p_cache_read_tokens: 0,
    p_cache_write_tokens: 0,
    p_usd: 0.003,
    p_status: "settled",
    p_stop_reason: "end_turn",
  });
  assertEquals(typeof p_latency_ms, "number");
  assertEquals(
    logs.filter((entry) => entry.event === "claude_ledger_settle_failed"),
    [],
  );
});

Deno.test("callClaude keeps a paid success when settle fails twice and never zeroes the usage", async () => {
  const { admin, calls } = fakeAdmin({
    llm_reserve: granted,
    llm_settle: () => ({ error: new Error("connection reset") }),
  });
  const { logs, clientOptions } = recorder();
  const result = await callClaude(options({
    ledger: createLlmLedger(admin),
    caller: async () => paidResponse,
    clientOptions,
  }));
  assertEquals(result, {
    ok: true,
    response: paidResponse,
    usd: 0.003,
    model: "claude-sonnet-5-5",
  });
  const settles = calls.filter((call) => call.name === "llm_settle");
  assertEquals(settles.length, 2);
  for (const { args } of settles) {
    assertEquals(args.p_status, "settled");
    assertEquals(args.p_usd, 0.003);
    assertEquals(args.p_input_tokens, 1000);
    assertEquals(args.p_output_tokens, 100);
  }
  const failures = logs.filter((entry) =>
    entry.event === "claude_ledger_settle_failed"
  );
  assertEquals(failures.length, 1);
  assertEquals(failures[0].fields?.usage_id, 44);
  assertEquals(failures[0].fields?.usd, 0.003);
  assertEquals(failures[0].fields?.status, "settled");
});

Deno.test("callClaude returns typed model failures with SDK status, error type and transient class", async () => {
  const cases = [
    {
      error: APIError.generate(
        409,
        {
          type: "error",
          error: { type: "api_error", message: "Conflict" },
        },
        undefined,
        new Headers(),
      ),
      status: 409,
      errorType: "api_error",
      transient: true,
    },
    {
      error: APIError.generate(
        529,
        {
          type: "error",
          error: { type: "overloaded_error", message: "Overloaded" },
        },
        undefined,
        new Headers(),
      ),
      status: 529,
      errorType: "overloaded_error",
      transient: true,
    },
    {
      error: APIError.generate(
        400,
        {
          type: "error",
          error: { type: "invalid_request_error", message: "bad request" },
        },
        undefined,
        new Headers(),
      ),
      status: 400,
      errorType: "invalid_request_error",
      transient: false,
    },
    {
      error: new APIConnectionTimeoutError(),
      status: null,
      errorType: "timeout",
      transient: true,
    },
  ];
  for (const expected of cases) {
    const { ledger, settlements } = fakeLedger();
    const result = await callClaude(options({
      ledger,
      caller: async () => {
        throw expected.error;
      },
    }));
    assert(!result.ok && "error" in result);
    assertEquals(result, {
      ok: false,
      error: expected.error.message,
      status: expected.status,
      errorType: expected.errorType,
      transient: expected.transient,
    });
    assertEquals(settlements.map((entry) => entry.fields.status), ["error"]);
    if (expected.status === 409 || expected.status === 529) {
      assert(isTransientAdjudicationError(adjudicationErrorFromClaudeFailure(result)));
    }
  }
});

Deno.test("callClaude denies studio_unresolved when the studio resolver errors and allows a genuine null studio", async () => {
  const request = () =>
    new Request("https://example.test", {
      headers: { authorization: "Bearer user-token" },
    });

  const failed = fakeAdmin({
    _primary_studio_for: () => ({
      error: new Error("permission denied for function _primary_studio_for"),
    }),
    llm_reserve: granted,
  });
  const unresolved = await resolveCaller(request(), failed.admin);
  let invoked = false;
  const denied = await callClaude(options({
    studioId: unresolved.studioId,
    userId: unresolved.userId,
    studioLookupFailed: unresolved.studioLookupFailed,
    ledger: createLlmLedger(failed.admin),
    caller: async () => {
      invoked = true;
      return paidResponse;
    },
    clientOptions: recorder().clientOptions,
  }));
  assertEquals(denied, {
    ok: false,
    denied: "disabled",
    reason: "studio_unresolved",
    resetsAt: null,
  });
  assertEquals(invoked, false);
  assertEquals(failed.calls.map((call) => call.name), ["_primary_studio_for"]);

  const noStudio = fakeAdmin({
    _primary_studio_for: () => ({ data: null }),
    llm_reserve: granted,
  });
  const allowed = await resolveCaller(request(), noStudio.admin);
  const result = await callClaude(options({
    studioId: allowed.studioId,
    userId: allowed.userId,
    studioLookupFailed: allowed.studioLookupFailed,
    ledger: createLlmLedger(noStudio.admin),
    caller: async () => paidResponse,
    clientOptions: recorder().clientOptions,
  }));
  assert(result.ok);
  const reserve = noStudio.calls.find((call) => call.name === "llm_reserve");
  assertEquals(reserve?.args.p_studio_id, null);
  assertEquals(reserve?.args.p_user_id, "user-1");
});

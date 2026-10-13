import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  APIConnectionTimeoutError,
  APIError,
} from "npm:@anthropic-ai/sdk@0.133.0";
import { resolveCaller } from "./caller.ts";
import {
  callClaude,
  type ClaudeCaller,
  createLlmLedger,
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
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const reply = handlers[name]?.(args) ?? {};
      return { data: reply.data ?? null, error: reply.error ?? null };
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

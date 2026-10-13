import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  callClaude,
  type ClaudeCaller,
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
  assertEquals(result, { ok: false, denied: "budget" });
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
    assertEquals(result, { ok: false, denied });
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
  assertEquals(result.usd, 0.00427);
  assertEquals(settlements.length, 1);
  assertEquals(settlements[0].usageId, 44);
  assertEquals(settlements[0].fields.status, "settled");
  assertEquals(settlements[0].fields.usd, 0.00427);
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
  assertEquals(result, { ok: false, denied: "disabled" });
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

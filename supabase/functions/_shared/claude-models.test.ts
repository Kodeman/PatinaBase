import {
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCostUsd, PRICING, ROLE_MODELS } from "./claude-models.ts";

Deno.test("ROLE_MODELS maps each role to its required model and effort", () => {
  assertEquals(ROLE_MODELS.triage, {
    model: "claude-haiku-5-5",
    effort: "low",
  });
  assertEquals(ROLE_MODELS.judge, { model: "claude-haiku-5-5", effort: "low" });
  assertEquals(ROLE_MODELS.extract, {
    model: "claude-sonnet-5-5",
    effort: "medium",
  });
  assertEquals(ROLE_MODELS.answer, {
    model: "claude-sonnet-5-5",
    effort: "medium",
  });
  assertEquals(ROLE_MODELS.draft, {
    model: "claude-sonnet-5-5",
    effort: "high",
  });
});

Deno.test("PRICING contains every required Claude model and exact cost uses cache multipliers", () => {
  assertEquals(Object.keys(PRICING).sort(), [
    "claude-haiku-5-5",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
  ]);
  assertEquals(
    computeCostUsd("claude-sonnet-5-5", {
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 100,
    }),
    0.00426,
  );
  assertEquals(
    computeCostUsd("claude-haiku-5-5", {
      input_tokens: 1000,
      output_tokens: 200,
    }),
    0.0002,
  );
  assertEquals(
    computeCostUsd("claude-haiku-5-5", {
      input_tokens: 100_001,
      output_tokens: 200,
    }),
    0.0505005,
  );
  assertThrows(
    () =>
      computeCostUsd("unpriced-model", { input_tokens: 1, output_tokens: 1 }),
    Error,
    "Unknown Claude model pricing",
  );
});

Deno.test("computeCostUsd prices cache reads per model and 1-hour cache writes at 2x", () => {
  // 10K tokens each; expected USD = 10K * input rate * multiplier / 1M.
  const cases = [
    {
      model: "claude-haiku-5-5",
      read: 0.0001, // $0.10 * 0.1
      write1h: 0.002, // $0.10 * 2
      write5m: 0.00125, // $0.10 * 1.25
    },
    {
      model: "claude-sonnet-5-5",
      read: 0.001, // $2 * 0.05
      write1h: 0.04, // $2 * 2
      write5m: 0.025, // $2 * 1.25
    },
    {
      model: "claude-opus-5-5",
      read: 0.002, // $4 * 0.05
      write1h: 0.08, // $4 * 2
      write5m: 0.05, // $4 * 1.25
    },
  ];
  const none = { input_tokens: 0, output_tokens: 0 };
  for (const { model, read, write1h, write5m } of cases) {
    assertAlmostEquals(
      computeCostUsd(model, { ...none, cache_read_input_tokens: 10_000 }),
      read,
      1e-12,
      `${model} cache read`,
    );
    assertAlmostEquals(
      computeCostUsd(model, {
        ...none,
        cache_creation_input_tokens: 10_000,
        cache_creation: {
          ephemeral_1h_input_tokens: 10_000,
          ephemeral_5m_input_tokens: 0,
        },
      }),
      write1h,
      1e-12,
      `${model} 1h cache write`,
    );
    assertAlmostEquals(
      computeCostUsd(model, {
        ...none,
        cache_creation_input_tokens: 20_000,
        cache_creation: {
          ephemeral_1h_input_tokens: 10_000,
          ephemeral_5m_input_tokens: 10_000,
        },
      }),
      write1h + write5m,
      1e-12,
      `${model} mixed 1h and 5m cache write`,
    );
    assertAlmostEquals(
      computeCostUsd(model, { ...none, cache_creation_input_tokens: 10_000 }),
      write5m,
      1e-12,
      `${model} cache write without TTL breakdown falls back to 1.25x`,
    );
  }
  // Above 100K prompt tokens Haiku reads at 0.1x of the $0.50 input rate.
  assertAlmostEquals(
    computeCostUsd("claude-haiku-5-5", {
      input_tokens: 100_000,
      output_tokens: 0,
      cache_read_input_tokens: 10_000,
    }),
    0.0505,
    1e-12,
  );
});

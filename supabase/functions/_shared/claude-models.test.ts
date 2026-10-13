import {
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
    0.00427,
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

/// <reference lib="deno.ns" />
// ^ The monorepo root tsconfig.json sets lib: [ES2022, DOM] which Deno >= 2.4
// picks up, clobbering the `Deno` global during type-check — the reference
// restores it (same issue documented in catalog-normalizer.test.ts).
//
// NI-03 (WAVE-NEXT-PLAN.md, US-11): companion-message's Claude model pin
// moves to a side-effect-free resolveModel(env). No production behavior
// change until COMPANION_MODEL is set — this covers the default fallback
// and the override path. Run:
//   deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/companion-message-model.test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  DEFAULT_COMPANION_MODEL,
  resolveModel,
} from "../companion-message/model.ts";

function fakeEnv(vars: Record<string, string>) {
  return {
    get(key: string): string | undefined {
      return vars[key];
    },
  };
}

Deno.test("resolveModel falls back to the current pin when COMPANION_MODEL is unset", () => {
  const result = resolveModel(fakeEnv({}));
  assertEquals(result, DEFAULT_COMPANION_MODEL);
  assertEquals(result, "claude-sonnet-4-20250514");
});

Deno.test("resolveModel prefers COMPANION_MODEL when set", () => {
  const result = resolveModel(
    fakeEnv({ COMPANION_MODEL: "claude-opus-5-override" }),
  );
  assertEquals(result, "claude-opus-5-override");
});

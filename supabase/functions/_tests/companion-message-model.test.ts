import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { ROLE_MODELS } from "../_shared/claude-models.ts";

Deno.test("companion uses the shared answer role model", () => {
  assertEquals(ROLE_MODELS.answer.model, "claude-sonnet-5-5");
});

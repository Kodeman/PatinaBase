import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { partySmsAuthority } from "./handler.ts";

Deno.test("People-room and assignment SMS authority identifies the designer", () => {
  assertEquals(partySmsAuthority("designer-1"), { kind: "designer", userId: "designer-1" });
  assertThrows(() => partySmsAuthority(undefined), Error, "send_authority_unavailable");
});

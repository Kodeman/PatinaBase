import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizedDerivatives, sha256Hex } from "./lib.ts";
Deno.test("media resolver signs only exact authorized frozen derivative records", async () => {
  assertEquals(authorizedDerivatives([{ path: "working/a.jpg", sha256: "a".repeat(64) }]), []);
  assertEquals(authorizedDerivatives([{ path: "project-review/edition/" + "a".repeat(64) + ".jpg", sha256: "b".repeat(64) }]).length, 1);
  assertEquals(await sha256Hex(new TextEncoder().encode("x").buffer), "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881");
});

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { uniquePaths } from "./lib.ts";
Deno.test("media resolver accepts only hashed review derivatives", () => { assertEquals(uniquePaths(["project-review/e/a".padEnd(64, "a") + ".jpg", "working/a.jpg"]), []); assertEquals(uniquePaths(["project-review/edition/" + "a".repeat(64) + ".jpg"]).length, 1); });

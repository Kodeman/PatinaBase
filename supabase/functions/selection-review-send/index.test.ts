import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseSendRequest } from "./lib.ts";
Deno.test("send request needs an edition id", () => { assertEquals(parseSendRequest({ editionId: "edition-1" }), { editionId: "edition-1" }); assertEquals(parseSendRequest({}), null); });

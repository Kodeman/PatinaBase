import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliveryIdempotencyKey, parseSendRequest } from "./lib.ts";
Deno.test("send request needs a nonblank UUID-ish edition id and has a stable key", () => { const id = "123e4567-e89b-12d3-a456-426614174000"; assertEquals(parseSendRequest({ editionId: id }), { editionId: id }); assertEquals(parseSendRequest({ editionId: "edition-1" }), null); assertEquals(deliveryIdempotencyKey(id), `selection-review-send:${id}`); });

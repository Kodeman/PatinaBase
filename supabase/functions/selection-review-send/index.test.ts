import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliveryIdempotencyKey, parsePreparedDelivery, parseSendRequest, reviewUrl } from "./lib.ts";

const editionId = "123e4567-e89b-42d3-a456-426614174000";
const attemptId = "123e4567-e89b-42d3-a456-426614174001";
const projectId = "123e4567-e89b-42d3-a456-426614174002";

Deno.test("send request needs a UUID edition id and has a stable provider key", () => {
  assertEquals(parseSendRequest({ editionId }), { editionId });
  assertEquals(parseSendRequest({ editionId: "edition-1" }), null);
  assertEquals(deliveryIdempotencyKey(editionId), `selection-review-send:${editionId}`);
});

Deno.test("delivery claim accepts only the immutable edition review route", () => {
  assertEquals(parsePreparedDelivery({
    attemptId,
    editionId,
    projectId,
    outcome: "claimed",
    claimed: true,
    recipient: { email: "client@example.test" },
    review: { title: "Living room", reviewPath: `/projects/${projectId}/reviews/${editionId}` },
  }, editionId)?.reviewPath, `/projects/${projectId}/reviews/${editionId}`);
  assertEquals(parsePreparedDelivery({ attemptId, editionId: attemptId, projectId, outcome: "claimed", claimed: true, recipient: { email: "client@example.test" }, review: { reviewPath: `/projects/${projectId}/reviews/${attemptId}` } }, editionId), null);
  assertEquals(parsePreparedDelivery({ attemptId, editionId, projectId, outcome: "claimed", claimed: true, recipient: { email: "client@example.test" }, review: { reviewPath: "/projects/project-1" } }, editionId), null);
  assertEquals(reviewUrl(`/projects/project-1/reviews/${editionId}`, "https://client.patina.cloud"), `https://client.patina.cloud/projects/project-1/reviews/${editionId}`);
  assertEquals(reviewUrl("//evil.example/review", "https://client.patina.cloud"), null);
});

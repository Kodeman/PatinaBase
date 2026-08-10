import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliveryIdempotencyKey, markDeliveryArgs, parseMarkedDelivery, parsePreparedDelivery, parseSendRequest, prepareDeliveryArgs, reviewUrl } from "./lib.ts";

const editionId = "123e4567-e89b-42d3-a456-426614174000";
const attemptId = "123e4567-e89b-42d3-a456-426614174001";
const projectId = "123e4567-e89b-42d3-a456-426614174002";
const actorId = "123e4567-e89b-42d3-a456-426614174003";
const clientId = "123e4567-e89b-42d3-a456-426614174004";

Deno.test("send request needs a UUID edition id and has a stable provider key", () => {
  assertEquals(parseSendRequest({ editionId }), { editionId });
  assertEquals(parseSendRequest({ editionId: "edition-1" }), null);
  assertEquals(deliveryIdempotencyKey(editionId), `selection-review-send:${editionId}`);
  assertEquals(prepareDeliveryArgs(editionId, actorId), {
    p_edition_id: editionId,
    p_actor_id: actorId,
    p_idempotency_key: `selection-review-send:${editionId}`,
  });
});

Deno.test("delivery claim accepts only the immutable edition review route", () => {
  assertEquals(parsePreparedDelivery({
    attemptId,
    editionId,
    projectId,
    status: "pending",
    outcome: "claimed",
    claimed: true,
    recipient: { clientId, email: "client@example.test" },
    review: { title: "Living room", reviewPath: `/projects/${projectId}/reviews/${editionId}` },
  }, editionId)?.reviewPath, `/projects/${projectId}/reviews/${editionId}`);
  assertEquals(parsePreparedDelivery({ attemptId, editionId: attemptId, projectId, status: "pending", outcome: "claimed", claimed: true, recipient: { clientId, email: "client@example.test" }, review: { reviewPath: `/projects/${projectId}/reviews/${attemptId}` } }, editionId), null);
  assertEquals(parsePreparedDelivery({ attemptId, editionId, projectId, status: "pending", outcome: "claimed", claimed: true, recipient: { clientId, email: "client@example.test" }, review: { reviewPath: "/projects/project-1" } }, editionId), null);
  assertEquals(reviewUrl(`/projects/project-1/reviews/${editionId}`, "https://client.patina.cloud"), `https://client.patina.cloud/projects/project-1/reviews/${editionId}`);
  assertEquals(reviewUrl("//evil.example/review", "https://client.patina.cloud"), null);
});

Deno.test("delivery completion uses the exact provider-aware SQL contract and validates its result", () => {
  const delivery = parsePreparedDelivery({
    attemptId, editionId, projectId, status: "pending", outcome: "claimed", claimed: true,
    recipient: { clientId, email: "client@example.test" },
    review: { title: "Living room", reviewPath: `/projects/${projectId}/reviews/${editionId}` },
  }, editionId)!;
  assertEquals(markDeliveryArgs(attemptId, actorId, "resend-1", null), {
    p_attempt_id: attemptId,
    p_actor_id: actorId,
    p_provider_message_id: "resend-1",
    p_error_code: null,
  });
  assertEquals(parseMarkedDelivery({
    attemptId, editionId, projectId, status: "sent", providerMessageId: "resend-1", reused: false,
  }, delivery, "resend-1", null), {
    attemptId, status: "sent", providerMessageId: "resend-1", reused: false,
  });
  assertEquals(parseMarkedDelivery({
    attemptId, editionId, projectId, status: "sent", providerMessageId: "wrong", reused: false,
  }, delivery, "resend-1", null), null);
});

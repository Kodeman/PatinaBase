import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createFieldLineHarness } from "./field-line/harness.ts";
import { fieldLineCases } from "./field-line/manifest.ts";

Deno.test("field-line fixture harness is isolated and signed", async () => {
  const harness = createFieldLineHarness();
  assertEquals(harness.studios.A.projectId, "project-a");
  assertEquals(harness.studios.B.projectId, "project-b");
  assertEquals(harness.recipient, "+15550102030");
  assertEquals(harness.clock.toISOString(), "2026-11-01T14:00:00.000Z");
  assertEquals(harness.studios.A.partyId !== harness.studios.B.partyId, true);

  harness.fake._data.projects = harness.fake._data.projects.map((project) =>
    project.id === harness.studios.B.projectId
      ? { ...project, studio_id: null, designer_id: null }
      : project
  );
  harness.fake._data.studio_channel_consent = harness.fake._data.studio_channel_consent.filter(
    (record) => record.organization_id !== harness.studios.B.id,
  );
  const unconsentedB = await harness.send({
    partyId: harness.studios.B.partyId,
    body: "Studio B: fixture message. Msg&data rates may apply. Reply HELP for help, STOP to opt out.",
  });
  assertEquals(unconsentedB, { sent: false, reason: "not_consented" });

  harness.provider.setOutcome({ kind: "fail", code: 30007 });
  harness.mediaStore.interruptNextUpload();
  assert(harness.fake._failUploadsFor?.has("*"));
  const inbound = await harness.signedInbound();
  const status = await harness.signedStatus();
  assert(inbound.request.headers.get("X-Twilio-Signature"));
  assert(status.request.headers.get("X-Twilio-Signature"));
});

Deno.test("field-line fake provider and media interruption are exercised offline", async () => {
  const harness = createFieldLineHarness();
  const accepted = await harness.send({ partyId: harness.studios.A.partyId, body: "Studio A: fixture message. Msg&data rates may apply. Reply HELP for help, STOP to opt out." });
  assertEquals(accepted.sent, true);
  harness.provider.setOutcome({ kind: "fail", code: 30007 });
  const failed = await harness.send({ partyId: harness.studios.B.partyId, body: "Studio B: fixture message. Msg&data rates may apply. Reply HELP for help, STOP to opt out." });
  assertEquals(failed.sent, false);
  harness.provider.setOutcome({ kind: "crash_after_accept" });
  await assertRejects(
    () => harness.send({ partyId: harness.studios.B.partyId, body: "Studio B: fixture message. Msg&data rates may apply. Reply HELP for help, STOP to opt out." }),
    Error,
    "provider accepted",
  );
  assertEquals(harness.provider.requests.length, 3);

  harness.mediaStore.interruptNextUpload();
  await harness.processInbound({
    MessageSid: "SMfieldInterruptedMedia",
    NumMedia: "1",
    MediaUrl0: "https://media.fixture.patina.test/fixture.jpg",
    MediaContentType0: "image/jpeg",
  });
  assertEquals(harness.fake._uploads.length, 1);
  const inbound = (harness.fake._data.sms_messages ?? []).find((row) => row.twilio_sid === "SMfieldInterruptedMedia");
  assertEquals(inbound?.media, undefined, "interrupted media is not attached to the message");
});

for (const gateCase of fieldLineCases) {
  Deno.test(`field-line gate: ${gateCase.id}`, async () => {
    const assertions = await gateCase.run();
    for (const assertion of assertions) {
      console.log(`FIELD_LINE_ASSERTION ${JSON.stringify(assertion)}`);
    }
    const failed = assertions.filter((assertion) => assertion.status === "fail");
    assertEquals(failed, [], `${gateCase.id} fixture assertion failed`);
  });
}

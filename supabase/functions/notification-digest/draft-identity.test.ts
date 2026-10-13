import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clientDigestDraftIdentity } from "./draft-identity.ts";

Deno.test("client digest identity keeps the client ref and scopes dedupe to project", () => {
  const projectA = clientDigestDraftIdentity(
    "client-1",
    "studio-1",
    "project-a",
    "2026-10-13T00:00:00.000Z",
  );
  const projectB = clientDigestDraftIdentity(
    "client-1",
    "studio-1",
    "project-b",
    "2026-10-13T00:00:00.000Z",
  );

  assertEquals(projectA, {
    refType: "client",
    refId: "client-1",
    dedupeKey: "digest:client-1:studio-1:project-a:2026-10-13T00:00:00.000Z",
  });
  assertEquals(projectB, {
    refType: "client",
    refId: "client-1",
    dedupeKey: "digest:client-1:studio-1:project-b:2026-10-13T00:00:00.000Z",
  });
  assertEquals(projectA.refId, projectB.refId);
  assertEquals(projectA.dedupeKey === projectB.dedupeKey, false);
});

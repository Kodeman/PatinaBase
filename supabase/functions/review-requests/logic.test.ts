// Deno test for the review-request candidate filter.
// Run: deno test --allow-all --config supabase/functions/deno.json \
//        supabase/functions/review-requests/logic.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { projectsToSkip, SUPPRESSED_SKIP_TAG } from "./logic.ts";

Deno.test("a request already out, or already answered, blocks the project", () => {
  const skip = projectsToSkip([
    { project_id: "p-sent", request_status: "sent", tags: null },
    { project_id: "p-queued", request_status: "queued", tags: [] },
    { project_id: "p-collected", request_status: "collected", tags: ["warm"] },
  ]);
  assertEquals([...skip].sort(), ["p-collected", "p-queued", "p-sent"]);
});

Deno.test("a suppressed client is not asked again tomorrow", () => {
  const skip = projectsToSkip([
    {
      project_id: "p-suppressed",
      request_status: "not_sent",
      tags: [SUPPRESSED_SKIP_TAG],
    },
  ]);
  assertEquals(skip.has("p-suppressed"), true);
});

Deno.test("a plain not_sent row still leaves the project eligible", () => {
  const skip = projectsToSkip([
    { project_id: "p-draft", request_status: "not_sent", tags: null },
    { project_id: "p-draft2", request_status: "not_sent", tags: ["kitchen"] },
    { project_id: null, request_status: "sent", tags: null },
  ]);
  assertEquals(skip.size, 0);
});

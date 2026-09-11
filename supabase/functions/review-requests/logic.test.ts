// Deno test for the review-request candidate filter.
// Run: deno test --allow-all --config supabase/functions/deno.json \
//        supabase/functions/review-requests/logic.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSuppressedRecipient, projectsWithRequestOut } from "./logic.ts";

Deno.test("a request already out, or already answered, blocks the project", () => {
  const skip = projectsWithRequestOut([
    { project_id: "p-sent", request_status: "sent" },
    { project_id: "p-queued", request_status: "queued" },
    { project_id: "p-collected", request_status: "collected" },
  ]);
  assertEquals([...skip].sort(), ["p-collected", "p-queued", "p-sent"]);
});

Deno.test("a not_sent row, or a row with no project, blocks nothing", () => {
  const skip = projectsWithRequestOut([
    { project_id: "p-draft", request_status: "not_sent" },
    { project_id: "p-null", request_status: null },
    { project_id: null, request_status: "sent" },
  ]);
  assertEquals(skip.size, 0);
});

Deno.test("a suppressed client profile is skipped; everyone else is eligible", () => {
  assertEquals(isSuppressedRecipient({ email_suppressed: true }), true);
  assertEquals(isSuppressedRecipient({ email_suppressed: false }), false);
  // No flag, no profile row, no profile at all — a client with no account is
  // never suppressed by the send chokepoint, so she is never skipped here.
  assertEquals(isSuppressedRecipient({ email_suppressed: null }), false);
  assertEquals(isSuppressedRecipient({}), false);
  assertEquals(isSuppressedRecipient(null), false);
  assertEquals(isSuppressedRecipient(undefined), false);
});

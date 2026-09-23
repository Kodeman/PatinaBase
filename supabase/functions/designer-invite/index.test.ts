import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveBusinessNameForUpsert } from "./lib.ts";

// W2·P4 — the profile upsert that grants designer status must carry the
// invite-time business_name for a brand-new profile, but never overwrite an
// existing one on a re-invite.

Deno.test("new email — business_name set from the invite", () => {
  assertEquals(
    resolveBusinessNameForUpsert(null, "Middle West Design Co."),
    { businessName: "Middle West Design Co.", businessNameKept: false },
  );
  // No profile row yet is the same case as an empty string.
  assertEquals(
    resolveBusinessNameForUpsert(undefined, "Middle West Design Co."),
    { businessName: "Middle West Design Co.", businessNameKept: false },
  );
});

Deno.test("existing profile with business_name — unchanged, kept flag reported", () => {
  assertEquals(
    resolveBusinessNameForUpsert("Already On File Studio", "New Name Typed At Invite"),
    { businessNameKept: true },
  );
  // Even a blank invite-time value doesn't clear an existing name.
  assertEquals(
    resolveBusinessNameForUpsert("Already On File Studio", undefined),
    { businessNameKept: true },
  );
});

Deno.test("no business_name anywhere — no-op, not kept", () => {
  assertEquals(resolveBusinessNameForUpsert(null, undefined), { businessNameKept: false });
  assertEquals(resolveBusinessNameForUpsert("   ", "   "), { businessNameKept: false });
});

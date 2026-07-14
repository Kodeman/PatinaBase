// Deno test for the pure studio-identity helpers (Wave 2).
// Run: deno test --config supabase/functions/deno.json \
//        supabase/functions/_shared/studio-identity.test.ts
//
// resolveStudioIdentity itself is an RPC wrapper (needs a live DB) and is
// exercised by the migration-level probes; these tests cover the two pure
// derivations the edge functions rely on: which identities produce a co-brand
// byline, and the subject/prose display-name fallback.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  studioCobrand,
  studioDisplayName,
  type StudioIdentity,
} from "./studio-identity.ts";

const studio: StudioIdentity = {
  studioId: "s1",
  name: "Oakline Studio",
  logoUrl: "https://cdn.patina.cloud/studio-logos/s1/1.png",
  website: "https://oakline.example",
  source: "studio",
};
const businessOnly: StudioIdentity = {
  studioId: null,
  name: "Jane Doe Interiors",
  logoUrl: null,
  website: null,
  source: "business_name",
};
const personOnly: StudioIdentity = {
  studioId: null,
  name: "Jane Doe",
  logoUrl: null,
  website: null,
  source: "full_name",
};
const empty: StudioIdentity = {
  studioId: null,
  name: null,
  logoUrl: null,
  website: null,
  source: null,
};

Deno.test("studioCobrand: studio source → name + logo byline", () => {
  assertEquals(studioCobrand(studio), {
    studioName: "Oakline Studio",
    studioLogoUrl: "https://cdn.patina.cloud/studio-logos/s1/1.png",
  });
});

Deno.test("studioCobrand: business_name source → name byline, no logo", () => {
  assertEquals(studioCobrand(businessOnly), {
    studioName: "Jane Doe Interiors",
    studioLogoUrl: undefined,
  });
});

Deno.test("studioCobrand: full_name source → NO byline (personal, not co-brand)", () => {
  assertEquals(studioCobrand(personOnly), {});
});

Deno.test("studioCobrand: null identity / empty row → NO byline", () => {
  assertEquals(studioCobrand(null), {});
  assertEquals(studioCobrand(empty), {});
});

Deno.test("studioDisplayName: prefers resolver name over the fallback", () => {
  assertEquals(studioDisplayName(studio, "Your designer"), "Oakline Studio");
  assertEquals(studioDisplayName(businessOnly, "Your designer"), "Jane Doe Interiors");
  assertEquals(studioDisplayName(personOnly, "Your designer"), "Jane Doe");
});

Deno.test("studioDisplayName: falls back when the resolver name is null/blank", () => {
  assertEquals(studioDisplayName(empty, "Your designer"), "Your designer");
  assertEquals(studioDisplayName(null, "Your designer"), "Your designer");
  assertEquals(
    studioDisplayName({ ...empty, name: "   " }, "Your designer"),
    "Your designer",
  );
});

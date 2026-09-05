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
  resolveStudioSignature,
  signatureCity,
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

// ── R7's third element: the city on the sign-off ────────────────────────────
// The studio's city lives on organizations.address.city (what the designer
// portal's branding form writes). profiles.city is a vestigial column no
// surface writes; it stays only as a fallback.

Deno.test("signatureCity: prefers the studio org's address city", () => {
  assertEquals(
    signatureCity({ line1: "12 Mill St", city: "Kansas City" }, "Chicago"),
    "Kansas City",
  );
});

Deno.test("signatureCity: falls back to the designer profile's city", () => {
  assertEquals(signatureCity(null, "Chicago"), "Chicago");
  assertEquals(signatureCity({ city: "   " }, "Chicago"), "Chicago");
  assertEquals(signatureCity({ city: 42 }, "Chicago"), "Chicago");
});

Deno.test("signatureCity: undefined when neither knows one (R7 omits it)", () => {
  assertEquals(signatureCity(null, null), undefined);
  assertEquals(signatureCity({ line1: "12 Mill St" }, null), undefined);
  assertEquals(signatureCity({ city: "" }, "  "), undefined);
});

/** Minimal admin-client stand-in: one RPC row plus two single-row table reads. */
function fakeAdmin(opts: {
  identity: Record<string, unknown> | null;
  organizations?: Record<string, unknown> | null;
  profiles?: Record<string, unknown> | null;
}) {
  const reads: string[] = [];
  const client = {
    rpc: (_name: string, _args: unknown) =>
      Promise.resolve({ data: opts.identity ? [opts.identity] : [], error: null }),
    from: (table: string) => {
      reads.push(table);
      const row = table === "organizations"
        ? opts.organizations ?? null
        : opts.profiles ?? null;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
      };
      return chain;
    },
  };
  return { client, reads };
}

Deno.test("resolveStudioSignature: signs with the studio org's city", async () => {
  const { client, reads } = fakeAdmin({
    identity: {
      studio_id: "s1",
      name: "Middle West Studio",
      logo_url: null,
      website: null,
      source: "studio",
    },
    organizations: { address: { city: "Kansas City", state: "MO" } },
    profiles: { full_name: "Leah Brandt", city: null },
  });
  const signature = await resolveStudioSignature(
    client as unknown as Parameters<typeof resolveStudioSignature>[0],
    { designerId: "d1", projectId: null },
  );
  assertEquals(signature.designerGivenName, "Leah");
  assertEquals(signature.studioName, "Middle West Studio");
  assertEquals(signature.city, "Kansas City");
  assertEquals(reads, ["organizations", "profiles"]);
});

Deno.test("resolveStudioSignature: no city anywhere → the letter omits it", async () => {
  const { client } = fakeAdmin({
    identity: {
      studio_id: "s1",
      name: "Middle West Studio",
      logo_url: null,
      website: null,
      source: "studio",
    },
    organizations: { address: null },
    profiles: { full_name: "Leah Brandt", city: null },
  });
  const signature = await resolveStudioSignature(
    client as unknown as Parameters<typeof resolveStudioSignature>[0],
    { designerId: "d1", projectId: null },
  );
  assertEquals(signature.city, undefined);
  assertEquals(signature.designerGivenName, "Leah");
});

Deno.test("resolveStudioSignature: business_name identity has no org to read", async () => {
  const { client, reads } = fakeAdmin({
    identity: {
      studio_id: null,
      name: "Jane Doe Interiors",
      logo_url: null,
      website: null,
      source: "business_name",
    },
    profiles: { full_name: "Jane Doe", city: "Chicago" },
  });
  const signature = await resolveStudioSignature(
    client as unknown as Parameters<typeof resolveStudioSignature>[0],
    { designerId: "d1", projectId: null },
  );
  assertEquals(reads, ["profiles"]);
  assertEquals(signature.city, "Chicago");
  assertEquals(signature.studioName, "Jane Doe Interiors");
});

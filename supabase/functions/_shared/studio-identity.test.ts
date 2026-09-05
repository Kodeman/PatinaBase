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
  resolveStudioIdentity,
  resolveStudioSignature,
  signatureCity,
  studioCobrand,
  studioDisplayName,
  type StudioIdentity,
  studioSignatureCity,
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

// ── The studio arm: an invoice with no house ────────────────────────────────
// A studio invoice carries no project, so the only letterhead it can brand with
// is its own studio's. The RPC gained p_studio_id for exactly that, and every
// call names it — null included — so the call binds one signature and can never
// be answered with 42725 "function is not unique".

/** Captures the exact argument object handed to the RPC. */
function rpcSpy(row: Record<string, unknown> | null) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, ...args });
      return Promise.resolve({ data: row ? [row] : [], error: null });
    },
  };
  return { client, calls };
}

const STUDIO_ROW = {
  studio_id: "s1",
  name: "Middle West Studio",
  logo_url: "https://cdn.patina.cloud/studio-logos/s1/1.png",
  website: null,
  source: "studio",
};

Deno.test("resolveStudioIdentity: a studio invoice brands by its own studio", async () => {
  const { client, calls } = rpcSpy(STUDIO_ROW);
  const identity = await resolveStudioIdentity(
    client as unknown as Parameters<typeof resolveStudioIdentity>[0],
    { projectId: null, designerId: "d1", studioId: "s1" },
  );
  assertEquals(calls, [{
    name: "resolve_studio_identity",
    p_project_id: null,
    p_designer_id: "d1",
    p_studio_id: "s1",
  }]);
  assertEquals(identity?.studioId, "s1");
  assertEquals(identity?.name, "Middle West Studio");
  assertEquals(identity?.source, "studio");
});

Deno.test("resolveStudioIdentity: no studio given → p_studio_id is still named, null", async () => {
  const { client, calls } = rpcSpy(STUDIO_ROW);
  await resolveStudioIdentity(
    client as unknown as Parameters<typeof resolveStudioIdentity>[0],
    { projectId: "p1", designerId: "d1" },
  );
  assertEquals(calls, [{
    name: "resolve_studio_identity",
    p_project_id: "p1",
    p_designer_id: "d1",
    p_studio_id: null,
  }]);
});

/** Answers the first call with PostgREST's "no such function", then succeeds. */
function rpcSpyMissingFirst(row: Record<string, unknown>) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, ...args });
      if (calls.length === 1) {
        return Promise.resolve({
          data: null,
          error: {
            code: "PGRST202",
            message:
              "Could not find the function public.resolve_studio_identity(p_designer_id, p_project_id, p_studio_id) in the schema cache",
          },
        });
      }
      return Promise.resolve({ data: [row], error: null });
    },
  };
  return { client, calls };
}

Deno.test("resolveStudioIdentity: a project caller still brands against the pre-00570 RPC", async () => {
  const { client, calls } = rpcSpyMissingFirst(STUDIO_ROW);
  const identity = await resolveStudioIdentity(
    client as unknown as Parameters<typeof resolveStudioIdentity>[0],
    { projectId: "p1", designerId: "d1" },
  );
  assertEquals(calls, [
    {
      name: "resolve_studio_identity",
      p_project_id: "p1",
      p_designer_id: "d1",
      p_studio_id: null,
    },
    {
      name: "resolve_studio_identity",
      p_project_id: "p1",
      p_designer_id: "d1",
    },
  ]);
  assertEquals(identity?.name, "Middle West Studio");
});

Deno.test("resolveStudioIdentity: a studio caller does NOT retry two-argument", async () => {
  const { client, calls } = rpcSpyMissingFirst(STUDIO_ROW);
  const identity = await resolveStudioIdentity(
    client as unknown as Parameters<typeof resolveStudioIdentity>[0],
    { projectId: null, designerId: "d1", studioId: "s1" },
  );
  // The two-argument RPC would answer with the designer's primary studio, which
  // is the wrong letterhead for a two-studio designer — better no brand at all.
  assertEquals(calls.length, 1);
  assertEquals(identity, null);
});

Deno.test("resolveStudioIdentity: studio alone is anchor enough", async () => {
  const { client, calls } = rpcSpy(STUDIO_ROW);
  const identity = await resolveStudioIdentity(
    client as unknown as Parameters<typeof resolveStudioIdentity>[0],
    { studioId: "s1" },
  );
  assertEquals(calls, [{
    name: "resolve_studio_identity",
    p_project_id: null,
    p_designer_id: null,
    p_studio_id: "s1",
  }]);
  assertEquals(identity?.name, "Middle West Studio");
});

Deno.test("resolveStudioIdentity: no anchor at all → null, and the RPC is never called", async () => {
  const { client, calls } = rpcSpy(STUDIO_ROW);
  const identity = await resolveStudioIdentity(
    client as unknown as Parameters<typeof resolveStudioIdentity>[0],
    { projectId: null, designerId: null, studioId: null },
  );
  assertEquals(identity, null);
  assertEquals(calls, []);
});

// ── R7's third element: the city on the sign-off ────────────────────────────
// Ruled at the Wave 1 close: profiles.city first, then the studio org's
// address->>'city' (what the designer portal's branding form writes), then
// omitted. Only the org leg is populated today, so the fallback is what
// actually signs the letter.

Deno.test("signatureCity: prefers the designer's own profile city", () => {
  assertEquals(
    signatureCity("Chicago", { line1: "12 Mill St", city: "Kansas City" }),
    "Chicago",
  );
});

Deno.test("signatureCity: falls back to the studio org's address city", () => {
  assertEquals(
    signatureCity(null, { line1: "12 Mill St", city: "Kansas City" }),
    "Kansas City",
  );
  assertEquals(signatureCity("   ", { city: "Kansas City" }), "Kansas City");
  assertEquals(signatureCity(undefined, { city: "Kansas City" }), "Kansas City");
});

Deno.test("signatureCity: undefined when neither knows one (R7 omits it)", () => {
  assertEquals(signatureCity(null, null), undefined);
  assertEquals(signatureCity(null, { line1: "12 Mill St" }), undefined);
  assertEquals(signatureCity("  ", { city: "" }), undefined);
  // A non-string city on the JSONB is not a city.
  assertEquals(signatureCity(null, { city: 42 }), undefined);
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

Deno.test("resolveStudioSignature: falls back to the studio org's city", async () => {
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
  // The profile is read first and the org second: both legs go through
  // `studioSignatureCity`, which is what the three sibling letters call.
  assertEquals(reads, ["profiles", "organizations"]);
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

Deno.test("resolveStudioSignature: the designer's own city outranks the org's", async () => {
  const { client } = fakeAdmin({
    identity: {
      studio_id: "s1",
      name: "Middle West Studio",
      logo_url: null,
      website: null,
      source: "studio",
    },
    organizations: { address: { city: "Kansas City", state: "MO" } },
    profiles: { full_name: "Leah Brandt", city: "Chicago" },
  });
  const signature = await resolveStudioSignature(
    client as unknown as Parameters<typeof resolveStudioSignature>[0],
    { designerId: "d1", projectId: null },
  );
  assertEquals(signature.city, "Chicago");
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

// ── M2: the letters that were signing cityless ──────────────────────────────
// The invitation, the nudge and the review request resolve their own identity
// and assemble `signOff` by hand. They now ask this helper for the city, so
// four letters from one studio sign from one place.

Deno.test("studioSignatureCity: reads the org address when the profile has none", async () => {
  const { client, reads } = fakeAdmin({
    identity: null,
    organizations: { address: { city: "Kansas City", state: "MO" } },
  });
  const city = await studioSignatureCity(
    client as unknown as Parameters<typeof studioSignatureCity>[0],
    {
      studioId: "s1",
      name: "Middle West Studio",
      logoUrl: null,
      website: null,
      source: "studio",
    },
    null,
  );
  assertEquals(city, "Kansas City");
  assertEquals(reads, ["organizations"]);
});

Deno.test("studioSignatureCity: the designer's own city outranks the org's", async () => {
  const { client } = fakeAdmin({
    identity: null,
    organizations: { address: { city: "Kansas City" } },
  });
  const city = await studioSignatureCity(
    client as unknown as Parameters<typeof studioSignatureCity>[0],
    {
      studioId: "s1",
      name: "Middle West Studio",
      logoUrl: null,
      website: null,
      source: "studio",
    },
    "Chicago",
  );
  assertEquals(city, "Chicago");
});

Deno.test("studioSignatureCity: no studio to read → the profile's city, or none", async () => {
  const { client, reads } = fakeAdmin({ identity: null });
  const withProfile = await studioSignatureCity(
    client as unknown as Parameters<typeof studioSignatureCity>[0],
    null,
    "Chicago",
  );
  const withNothing = await studioSignatureCity(
    client as unknown as Parameters<typeof studioSignatureCity>[0],
    null,
    null,
  );
  assertEquals(withProfile, "Chicago");
  assertEquals(withNothing, undefined);
  assertEquals(reads, []);
});

Deno.test("studioSignatureCity: a failed org read signs without a city, never throws", async () => {
  const client = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: null, error: { message: "boom" } }),
      };
      return chain;
    },
  };
  const city = await studioSignatureCity(
    client as unknown as Parameters<typeof studioSignatureCity>[0],
    {
      studioId: "s1",
      name: "Middle West Studio",
      logoUrl: null,
      website: null,
      source: "studio",
    },
    null,
  );
  assertEquals(city, undefined);
});

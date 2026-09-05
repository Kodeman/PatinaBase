// Deno test for the invoice letter's two derivations, and for the five
// functions actually using them.
// Run: deno test --allow-all --config supabase/functions/deno.json \
//        supabase/functions/_shared/invoice-subject.test.ts
//
// The five senders run Deno.serve at module load, so a test cannot import
// them and no assertion can reach a chain written inline in their index.ts.
// The unit cases below pin the chain where it now lives; the source cases pin
// that each index.ts still routes through it, which is the only reachable
// proof that deleting the studio behaviour breaks a gate (2026-09-05, R4-1).

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { invoiceBrandingRef, invoiceSubjectName } from "./invoice-subject.ts";

// ── The display name: house → title → plain word ────────────────────────────

Deno.test("the house names the letter when there is one", () => {
  assertEquals(
    invoiceSubjectName({
      project: { name: "The Ridgeline House" },
      title: "Design consultation · September",
    }),
    "The Ridgeline House",
  );
});

Deno.test("a studio invoice is named by its own regarding line", () => {
  assertEquals(
    invoiceSubjectName({
      project: null,
      title: "Design consultation · September",
    }),
    "Design consultation · September",
  );
});

Deno.test("no house and no title → 'your studio'", () => {
  assertEquals(invoiceSubjectName({ project: null, title: null }), "your studio");
});

Deno.test("the fallback is the last rung only — Stripe's line item", () => {
  // The Stripe product name says "Studio invoice" where a letter says "your
  // studio"; a title still out-ranks it, and a house out-ranks the title.
  assertEquals(
    invoiceSubjectName({ project: null, title: null }, "Studio invoice"),
    "Studio invoice",
  );
  assertEquals(
    invoiceSubjectName({ project: null, title: "Retainer · Q4" }, "Studio invoice"),
    "Retainer · Q4",
  );
  assertEquals(
    invoiceSubjectName(
      { project: { name: "The Ridgeline House" }, title: "Retainer · Q4" },
      "Studio invoice",
    ),
    "The Ridgeline House",
  );
});

Deno.test("a missing project embed is the same as a null one", () => {
  assertEquals(invoiceSubjectName({ title: "Retainer · Q4" }), "Retainer · Q4");
  assertEquals(invoiceSubjectName({}), "your studio");
});

// ── The branding anchors ────────────────────────────────────────────────────

Deno.test("the studio invoice's own studio is an anchor the resolver receives", () => {
  assertEquals(
    invoiceBrandingRef({
      project_id: null,
      designer_id: "designer-1",
      studio_id: "studio-2",
    }),
    { projectId: null, designerId: "designer-1", studioId: "studio-2" },
  );
});

Deno.test("a project invoice carries all three anchors", () => {
  assertEquals(
    invoiceBrandingRef({
      project_id: "project-1",
      designer_id: "designer-1",
      studio_id: "studio-2",
    }),
    { projectId: "project-1", designerId: "designer-1", studioId: "studio-2" },
  );
});

Deno.test("absent anchors are null, never undefined", () => {
  assertEquals(invoiceBrandingRef({}), {
    projectId: null,
    designerId: null,
    studioId: null,
  });
});

// ── The five senders route through this module ──────────────────────────────

const SENDERS = [
  "create-checkout-session",
  "invoice-send",
  "invoice-reminders",
  "stripe-webhook",
  "invoice-check-intent",
] as const;

/** The four that put a studio's letterhead on a client-facing letter. */
const BRANDING_SENDERS = [
  "create-checkout-session",
  "invoice-send",
  "invoice-reminders",
  "stripe-webhook",
] as const;

async function senderSource(name: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../${name}/index.ts`, import.meta.url));
}

Deno.test("every invoice sender names the letter through invoiceSubjectName", async () => {
  for (const name of SENDERS) {
    const src = await senderSource(name);
    assert(
      src.includes(`from '../_shared/invoice-subject.ts'`),
      `${name}/index.ts no longer imports the shared derivation`,
    );
    assert(
      src.includes("invoiceSubjectName("),
      `${name}/index.ts no longer calls invoiceSubjectName`,
    );
    // A re-inlined chain is unprovable again: it can be deleted with every
    // gate still green, which is the defect this test exists to prevent.
    assert(
      !src.includes("?? invoice.title"),
      `${name}/index.ts re-inlined the title fallback`,
    );
    assert(
      !src.includes("invoice.project?.name ??"),
      `${name}/index.ts re-inlined the house-name fallback`,
    );
  }
});

Deno.test("every branding sender resolves identity from the invoice's own anchors", async () => {
  for (const name of BRANDING_SENDERS) {
    const src = await senderSource(name);
    const calls = src.match(/resolveStudioIdentity\(/g) ?? [];
    const anchored = src.match(/resolveStudioIdentity\(\s*admin,\s*invoiceBrandingRef\(invoice\)\s*\)/g) ??
      [];
    assert(calls.length > 0, `${name}/index.ts resolves no studio identity at all`);
    assertEquals(
      anchored.length,
      calls.length,
      `${name}/index.ts has a resolveStudioIdentity call that does not pass invoiceBrandingRef(invoice)`,
    );
  }
});

Deno.test("checkout returns through the null-tolerant address, never an interpolated house", async () => {
  const src = await senderSource("create-checkout-session");
  assert(
    src.includes("successUrl: invoiceCheckoutReturnAddress("),
    "create-checkout-session no longer returns through invoiceCheckoutReturnAddress",
  );
  assert(
    src.includes("cancelUrl: invoiceCheckoutReturnAddress("),
    "create-checkout-session no longer cancels through invoiceCheckoutReturnAddress",
  );
  // A hand-interpolated house is exactly what a studio invoice has none of.
  assert(
    !src.includes("/projects/${"),
    "create-checkout-session interpolates a project path again",
  );
});

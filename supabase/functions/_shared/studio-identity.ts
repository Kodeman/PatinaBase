// Shared studio-identity resolver for Supabase Edge Functions (Designer Studios).
//
// Thin wrapper over the canonical resolve_studio_identity RPC (migration 00320)
// so Deno, portal TS, and Swift all resolve studio brand identity through the
// SAME precedence and can't drift:
//
//   studio_id → org  ·  else project.studio_id → org
//   ·  else designer's primary studio → org
//   ·  else profiles.business_name  ·  else profiles.full_name
//
// The RPC returns EXACTLY ONE row of brand-only columns (never email/phone/
// address/tax_id) and `name` may be NULL (non-designer / unresolvable UUID) —
// callers keep their existing person-name fallbacks for prose and subjects.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { givenName, type StudioSignOff } from "./branded-email.ts";

export interface StudioIdentity {
  studioId: string | null;
  /** Studio/business/person name. May be NULL — caller supplies its own fallback. */
  name: string | null;
  /** Public logo URL. Non-null ONLY when a studio org resolved (source='studio'). */
  logoUrl: string | null;
  website: string | null;
  /** 'studio' | 'business_name' | 'full_name' | null. */
  source: string | null;
}

/**
 * Resolve studio brand identity via the resolve_studio_identity RPC.
 *
 * Pass whichever of studioId / projectId / designerId the row carries; the RPC
 * reads them in that precedence, so an invoice with no house still brands with
 * its own studio's letterhead rather than the designer's primary one. Returns
 * null on error, missing input, or an empty result — never throws.
 */
export async function resolveStudioIdentity(
  admin: SupabaseClient,
  opts: {
    projectId?: string | null;
    designerId?: string | null;
    studioId?: string | null;
  },
): Promise<StudioIdentity | null> {
  const projectId = opts.projectId ?? null;
  const designerId = opts.designerId ?? null;
  const studioId = opts.studioId ?? null;
  if (!projectId && !designerId && !studioId) return null;

  try {
    const args: Record<string, string | null> = {
      p_project_id: projectId,
      p_designer_id: designerId,
      p_studio_id: studioId,
    };
    // p_studio_id is ALWAYS named, so the call binds exactly one signature by
    // argument name. A two-argument call would match BOTH the pre-00570
    // function and the three-argument one if a deploy ever left them side by
    // side, and Postgres answers that with 42725 — an error this wrapper
    // swallows as "no brand", i.e. silent letterhead loss.
    let { data, error } = await admin.rpc("resolve_studio_identity", args);
    if (
      error && (error as { code?: string }).code === "PGRST202" && !studioId
    ) {
      // Deployed ahead of 00570 the RPC still takes two arguments; a caller
      // with no studio to name gets the same row from either signature.
      delete args.p_studio_id;
      ({ data, error } = await admin.rpc("resolve_studio_identity", args));
    }
    if (error) {
      console.error("resolveStudioIdentity: rpc error", error.message);
      return null;
    }
    // The RPC RETURNS TABLE(...) → PostgREST yields an array of rows.
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      studioId: row.studio_id ?? null,
      name: row.name ?? null,
      logoUrl: row.logo_url ?? null,
      website: row.website ?? null,
      source: row.source ?? null,
    };
  } catch (e) {
    console.error("resolveStudioIdentity: threw", e);
    return null;
  }
}

/**
 * Co-brand byline props for renderBrandedShell. Populated ONLY when the identity
 * is a distinct studio/business brand (source 'studio' or 'business_name') — a
 * solo designer with just a personal name (source 'full_name') is the
 * Patina-fronted sender, not a co-brand, so the byline is omitted (their name
 * already carries in the greeting prose). Returns {} → shell renders unchanged.
 */
export function studioCobrand(
  identity: StudioIdentity | null,
): { studioName?: string; studioLogoUrl?: string } {
  if (!identity) return {};
  if (identity.source === "studio" || identity.source === "business_name") {
    return {
      studioName: identity.name ?? undefined,
      studioLogoUrl: identity.logoUrl ?? undefined,
    };
  }
  return {};
}

/**
 * Who signs a client-facing letter (R7): the co-brand byline for the shell AND
 * the sign-off at the foot. Patina never signs a homeowner's mail.
 */
export interface StudioSignature extends StudioSignOff {
  studioName?: string;
  studioLogoUrl?: string;
}

/**
 * The city on the sign-off (R7, as ruled at the Wave 1 close): the designer's
 * own `profiles.city` first, then the studio's — `organizations.address` is the
 * JSONB the designer portal's branding form writes (account-studio-page.tsx:
 * line1, line2, city, state, zip). Neither → omitted, never guessed.
 *
 * Today only the org leg is populated in practice (`profiles.city` is a 00013
 * column no surface writes yet), so the fallback is what actually signs the
 * letter; the order is the ruling's, so a designer who later states her own
 * city out-ranks the studio address.
 */
export function signatureCity(
  profileCity: string | null | undefined,
  orgAddress: unknown,
): string | undefined {
  const fromProfile = profileCity?.trim();
  if (fromProfile) return fromProfile;
  const address = orgAddress as { city?: unknown } | null | undefined;
  const fromOrg = typeof address?.city === "string" ? address.city.trim() : "";
  return fromOrg ? fromOrg : undefined;
}

/**
 * The sign-off city for a caller that already holds a resolved identity: the
 * designer's own `profiles.city` first, then the studio org's address.
 *
 * It exists because four letters sign a homeowner's mail and only one of them
 * builds its signature through `resolveStudioSignature` — the invitation, the
 * nudge and the review request each resolve the identity themselves and then
 * assembled `signOff` by hand, so they signed "— Leah, Middle West Studio" with
 * no city while the approval letter from the same studio, in the same inbox,
 * signed with one. One org read, the same precedence, never a second opinion.
 *
 * Never throws: a failed lookup signs without a city rather than not at all.
 */
export async function studioSignatureCity(
  admin: SupabaseClient,
  identity: StudioIdentity | null,
  profileCity: string | null | undefined,
): Promise<string | undefined> {
  let orgAddress: unknown = null;
  if (identity?.studioId) {
    try {
      const { data, error } = await admin
        .from("organizations")
        .select("address")
        .eq("id", identity.studioId)
        .maybeSingle();
      if (error) {
        console.error("studioSignatureCity: studio lookup failed", error);
      } else {
        orgAddress = (data as { address?: unknown } | null)?.address ?? null;
      }
    } catch (e) {
      console.error("studioSignatureCity: threw", e);
    }
  }
  return signatureCity(profileCity, orgAddress);
}

/**
 * Resolve that signature: the brand identity (studio → business name → person,
 * via the canonical RPC) plus the designer's own given name and her city —
 * `profiles.city`, else the studio org's `address->>'city'`. Never throws — an unresolved signature leaves the letter unsigned
 * rather than signing it "Patina", and a studio with no city on file signs
 * without one (R7: omit when unknown).
 */
export async function resolveStudioSignature(
  admin: SupabaseClient,
  opts: { designerId?: string | null; projectId?: string | null },
): Promise<StudioSignature> {
  const identity = await resolveStudioIdentity(admin, opts);
  const signature: StudioSignature = studioCobrand(identity);

  if (!opts.designerId) {
    const cityOnly = await studioSignatureCity(admin, identity, null);
    if (cityOnly) signature.city = cityOnly;
    return signature;
  }

  const { data, error } = await admin
    .from("profiles")
    .select("full_name, city")
    .eq("id", opts.designerId)
    .maybeSingle();
  if (error) {
    console.error("resolveStudioSignature: profile lookup failed", error);
    const cityOnly = await studioSignatureCity(admin, identity, null);
    if (cityOnly) signature.city = cityOnly;
    return signature;
  }
  const profile = data as
    | { full_name: string | null; city: string | null }
    | null;
  const given = givenName(profile?.full_name);
  if (given) signature.designerGivenName = given;
  const city = await studioSignatureCity(admin, identity, profile?.city);
  if (city) signature.city = city;
  return signature;
}

/**
 * Best display name for subjects/prose: studio → business_name → full_name,
 * falling back to the caller's existing person-name default when the resolver
 * returned no name (non-designer / unresolvable).
 */
export function studioDisplayName(
  identity: StudioIdentity | null,
  fallback: string,
): string {
  const name = identity?.name?.trim();
  return name && name.length > 0 ? name : fallback;
}

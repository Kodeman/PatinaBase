// Shared studio-identity resolver for Supabase Edge Functions (Designer Studios).
//
// Thin wrapper over the canonical resolve_studio_identity RPC (migration 00320)
// so Deno, portal TS, and Swift all resolve studio brand identity through the
// SAME precedence and can't drift:
//
//   project.studio_id → org  ·  else designer's primary studio → org
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
 * Pass exactly one of projectId / designerId (projectId takes precedence in the
 * RPC). Returns null on error, missing input, or an empty result — never throws.
 */
export async function resolveStudioIdentity(
  admin: SupabaseClient,
  opts: { projectId?: string | null; designerId?: string | null },
): Promise<StudioIdentity | null> {
  const projectId = opts.projectId ?? null;
  const designerId = opts.designerId ?? null;
  if (!projectId && !designerId) return null;

  try {
    const { data, error } = await admin.rpc("resolve_studio_identity", {
      p_project_id: projectId,
      p_designer_id: designerId,
    });
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
 * Resolve that signature: the brand identity (studio → business name → person,
 * via the canonical RPC) plus the designer's own given name and city. Never
 * throws — an unresolved signature leaves the letter unsigned rather than
 * signing it "Patina". City comes from profiles.city; the identity RPC returns
 * brand-only columns and carries none, so a studio whose city lives on the org
 * row signs without one (the ruled behaviour: omit when unknown).
 */
export async function resolveStudioSignature(
  admin: SupabaseClient,
  opts: { designerId?: string | null; projectId?: string | null },
): Promise<StudioSignature> {
  const identity = await resolveStudioIdentity(admin, opts);
  const signature: StudioSignature = studioCobrand(identity);
  if (!opts.designerId) return signature;
  const { data, error } = await admin
    .from("profiles")
    .select("full_name, city")
    .eq("id", opts.designerId)
    .maybeSingle();
  if (error) {
    console.error("resolveStudioSignature: profile lookup failed", error);
    return signature;
  }
  const profile = data as
    | { full_name: string | null; city: string | null }
    | null;
  const given = givenName(profile?.full_name);
  if (given) signature.designerGivenName = given;
  const city = profile?.city?.trim();
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

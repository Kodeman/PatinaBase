// Shared template renderer for Supabase Edge Functions.
//
// Resolution order:
//   1. Load the email_templates row by slug.
//   2. If html_content is populated, mustache-interpolate {{var}} tokens
//      with the provided data and return it.
//   3. Caller is expected to fall back to its own inline builder if null.
//
// Subject resolution: prefer email_templates.subject_default (interpolated),
// else caller's fallback.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RenderedTemplate {
  html: string;
  subject: string;
}

/**
 * Replace {{key}} and {{ key }} tokens in a string with values from data.
 * Missing keys render as empty strings to avoid leaking placeholders.
 */
export function interpolate(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = resolveKey(data, key);
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

/**
 * Static brand footer/nav variables shared by every branded template
 * (dashboard_url, help_url, prefs_url, unsub_url, business_address, app_url).
 * Merged UNDER caller data so a caller-supplied key (e.g. campaign-dispatch's
 * per-recipient unsub_url) always wins. The RFC-8058 List-Unsubscribe header
 * added by sendCompliantEmail is the real one-click opt-out; the footer link
 * points at the in-app notification settings page.
 */
export function brandDefaults(): Record<string, string> {
  const portal =
    Deno.env.get("DESIGNER_PORTAL_URL")?.replace(/\/$/, "") ??
    "https://app.patina.cloud";
  const prefs = `${portal}/portal/settings/notifications`;
  return {
    app_url: portal,
    dashboard_url: portal,
    help_url: `${portal}/help`,
    prefs_url: prefs,
    unsub_url: prefs,
    business_address:
      Deno.env.get("EMAIL_BUSINESS_ADDRESS") ??
      "A workshop for interior designers and the makers they trust.",
  };
}

function resolveKey(data: Record<string, unknown>, key: string): unknown {
  if (!key.includes(".")) return data[key];
  const parts = key.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Render a template by slug using email_templates.html_content if populated.
 * Returns null if the row doesn't exist or html_content is empty — caller
 * should then fall back to its own builder.
 */
export async function renderTemplateFromDb(
  supabase: SupabaseClient,
  slug: string,
  data: Record<string, unknown>
): Promise<RenderedTemplate | null> {
  try {
    const { data: tmpl, error } = await supabase
      .from("email_templates")
      .select("html_content, subject_default, is_active")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !tmpl) return null;
    if (tmpl.is_active === false) return null;
    if (!tmpl.html_content || String(tmpl.html_content).trim() === "") return null;

    const merged = { ...brandDefaults(), ...data };
    return {
      html: interpolate(String(tmpl.html_content), merged),
      subject: tmpl.subject_default
        ? interpolate(String(tmpl.subject_default), merged)
        : "",
    };
  } catch (err) {
    console.error("renderTemplateFromDb failed:", err);
    return null;
  }
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * organizations.address (00021 JSONB, OrganizationAddress
 * street/city/state/zip/country) on one line:
 * "1 Main St, Madison, WI 53703, US". Null when nothing usable is on file.
 */
export function formatStudioAddress(address: unknown): string | null {
  if (typeof address === "string") return address.trim() || null;
  if (!address || typeof address !== "object") return null;
  const a = address as Record<string, unknown>;
  const stateZip = [clean(a.state), clean(a.zip)].filter(Boolean).join(" ");
  const line = [clean(a.street), clean(a.city), stateZip, clean(a.country)]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

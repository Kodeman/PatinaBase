import type { ProjectFfeSpec } from "@patina/supabase";

function formatPeerDimensions(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((part) => typeof part === "object" ? JSON.stringify(part) : String(part))
      .filter(Boolean).join(" × ");
  }
  if (value && typeof value === "object") {
    const dimensions = value as Record<string, unknown>;
    const values = ["width", "depth", "height"].map((key) => dimensions[key])
      .filter((part) => part != null && String(part).trim() !== "")
      .map(String);
    if (values.length === 0) {
      values.push(...Object.entries(dimensions).filter(([key, part]) => key !== "unit" && part != null && part !== "")
        .map(([, part]) => String(part)));
    }
    const unit = typeof dimensions.unit === "string" ? dimensions.unit.trim() : "";
    return values.length ? `${values.join(" × ")}${unit ? ` ${unit}` : ""}` : "";
  }
  return typeof value === "string" ? value.trim() : "";
}

/** Name the current peer value of each field that actually conflicted. */
export function conflictText(
  fields: readonly (readonly [string, Partial<ProjectFfeSpec>])[],
  row: Partial<ProjectFfeSpec>,
): string {
  const image = fields.some(([field]) => field === "Image")
    ? ["Image changed in another session. Press Enter in the link field to save yours again."]
    : [];
  const said = fields.flatMap(([field, changes]) => {
    if (field === "Image") return [];
    const columns = Object.keys(changes) as (keyof ProjectFfeSpec)[];
    if (columns.length !== 1) return [`${field} changed in another session.`];
    const column = columns[0];
    const current = row[column];
    const value = column === "selected_dimensions"
      ? formatPeerDimensions(current)
      : typeof current === "string" ? current.trim() : "";
    return [value
      ? `${field} changed in another session to “${value}”.`
      : `${field} cleared in another session.`];
  });
  if (said.length === 0) return image.join(" ");
  return [
    ...image,
    `${said.join(" ")} Save again to replace ${said.length > 1 ? "them" : "it"}.`,
  ].join(" ");
}

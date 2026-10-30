import type { ProjectFfeSpec } from "@patina/supabase";

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
    const value = column === "selected_dimensions" && current && typeof current === "object" && !Array.isArray(current)
      ? Object.entries(current).filter(([, part]) => part != null && part !== "")
          .map(([key, part]) => `${key} ${String(part)}`).join(" · ")
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

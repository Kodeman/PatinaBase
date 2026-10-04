/** OOXML helpers over the native DOMParser (main thread; workers have no DOMParser). */
import { DeckImportError } from "./read-package";

export const NS = {
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
} as const;

export type PackageFiles = Map<string, Uint8Array>;

const decoder = new TextDecoder("utf-8");

/** Parses a package part. DTDs are refused outright (no entity expansion, no XXE). */
export function parseXml(bytes: Uint8Array, part: string): Document {
  const text = decoder.decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new DeckImportError("xml_invalid", `${part} declares a DTD`);
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new DeckImportError("xml_invalid", `${part} did not parse`);
  }
  return doc;
}

export function child(
  el: Element | null | undefined,
  ns: string,
  localName: string,
): Element | null {
  if (!el) return null;
  for (const c of Array.from(el.children))
    if (c.localName === localName && c.namespaceURI === ns) return c;
  return null;
}

export function childrenOf(
  el: Element | null | undefined,
  ns: string,
  localName: string,
): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter(
    (c) => c.localName === localName && c.namespaceURI === ns,
  );
}

/** First element at the end of a child path, e.g. path(el, [p,'nvPicPr'], [p,'cNvPr']). */
export function path(
  el: Element | null | undefined,
  ...steps: Array<[string, string]>
): Element | null {
  let current: Element | null | undefined = el;
  for (const [ns, ln] of steps) current = child(current, ns, ln);
  return current ?? null;
}

export function numAttr(
  el: Element | null | undefined,
  name: string,
  fallback = 0,
): number {
  const raw = el?.getAttribute(name);
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function boolAttr(
  el: Element | null | undefined,
  name: string,
): boolean {
  const raw = el?.getAttribute(name);
  return raw === "1" || raw === "true";
}

export function relId(
  el: Element | null | undefined,
  name: "embed" | "link" | "id",
): string | null {
  return el?.getAttributeNS(NS.r, name) || null;
}

export interface Relationship {
  type: string;
  target: string;
  external: boolean;
  /** Resolved package part for internal targets. */
  part: string | null;
}

/** Resolves a relative rel target inside the package; escaping the root is refused. */
export function resolvePart(fromPart: string, target: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  const parts = target.startsWith("/") ? [] : fromPart.split("/").slice(0, -1);
  for (const segment of target.replace(/^\//, "").split("/")) {
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (segment !== "." && segment !== "") {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

export function relsPathFor(part: string): string {
  const i = part.lastIndexOf("/");
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

export function readRels(
  files: PackageFiles,
  part: string,
): Map<string, Relationship> {
  const map = new Map<string, Relationship>();
  const bytes = files.get(relsPathFor(part));
  if (!bytes) return map;
  const doc = parseXml(bytes, relsPathFor(part));
  for (const r of Array.from(
    doc.getElementsByTagNameNS(NS.rel, "Relationship"),
  )) {
    const id = r.getAttribute("Id");
    const target = r.getAttribute("Target") ?? "";
    if (!id) continue;
    const external = r.getAttribute("TargetMode") === "External";
    map.set(id, {
      type: (r.getAttribute("Type") ?? "").split("/").pop() ?? "",
      target,
      external,
      part: external ? null : resolvePart(part, target),
    });
  }
  return map;
}

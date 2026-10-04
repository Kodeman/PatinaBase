/**
 * Reads a PowerPoint package (.pptx/.ppsx/.potx) without trusting it.
 *
 * The central directory is scanned by hand before fflate inflates anything, so
 * the zip-bomb caps and the ZIP64 rules from SQ-351 apply to declared sizes.
 * fflate issue #298: an archive with 0xFFFFFFFF sentinels and ZIP64 extras but
 * no ZIP64 end-of-central-directory locator makes `unzipSync` return WRONG
 * BYTES without throwing. Those layouts are refused here, never parsed.
 *
 * DOM-free on purpose: it runs inside the package Web Worker
 * (`package-worker.ts`) as well as inline (tests, fallback).
 */

export type DeckRejectReason =
  | "resave_as_pptx"
  | "not_a_presentation"
  | "file_too_large"
  | "zip_corrupt"
  | "zip_encrypted"
  | "zip_too_many_entries"
  | "zip_declared_too_large"
  | "zip_ratio_exceeded"
  | "zip64_unsupported"
  | "zip_inconsistent"
  | "xml_invalid";

export class DeckImportError extends Error {
  readonly reason: DeckRejectReason;
  readonly detail?: string;

  constructor(reason: DeckRejectReason, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "DeckImportError";
    this.reason = reason;
    this.detail = detail;
  }
}

export const PACKAGE_CAPS = {
  maxFileBytes: 250_000_000,
  maxEntries: 10_000,
  maxDeclaredBytes: 1024 ** 3,
  maxRatio: 100,
  ratioMinBytes: 1024 ** 2,
} as const;

export interface ZipEntryInfo {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

export interface PackageReader {
  entries: ZipEntryInfo[];
  entryNames: Set<string>;
  /** Main presentation part, normally `ppt/presentation.xml`. */
  mainPart: string;
  deck_sha256: string;
  /** Inflates exactly the named entries. One call = one filtered pass. */
  read(names: Iterable<string>): Promise<Map<string, Uint8Array>>;
}

const ACCEPTED_EXTENSIONS = new Set(["pptx", "ppsx", "potx"]);
const RESAVE_EXTENSIONS = new Set([
  "ppt",
  "pps",
  "pot",
  "pptm",
  "ppsm",
  "potm",
  "key",
]);
const PRESENTATION_MAIN_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml",
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml",
]);
const MACRO_MAIN_TYPE =
  /^application\/vnd\.ms-powerpoint\.(presentation|slideshow|template)\.macroEnabled\.main\+xml$/i;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SENTINEL_32 = 0xffffffff;
const SENTINEL_16 = 0xffff;
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function extensionOf(name: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(name);
  return match ? match[1].toLowerCase() : "";
}

/** Name and size checks that run before the file is read into memory. */
export function checkDeckFile(file: { name: string; size: number }): void {
  const ext = extensionOf(file.name);
  if (RESAVE_EXTENSIONS.has(ext))
    throw new DeckImportError("resave_as_pptx", `.${ext}`);
  if (ext && !ACCEPTED_EXTENSIONS.has(ext))
    throw new DeckImportError("not_a_presentation", `.${ext}`);
  if (file.size > PACKAGE_CAPS.maxFileBytes) {
    throw new DeckImportError("file_too_large", `${file.size} bytes`);
  }
}

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
}

function u64(b: Uint8Array, o: number): number {
  return u32(b, o) + u32(b, o + 4) * 0x100000000;
}

export function sniffFormat(bytes: Uint8Array): "zip" | "cfb" | "unknown" {
  if (bytes.length >= 4 && u32(bytes, 0) === SIG_LOCAL) return "zip";
  if (bytes.length >= 8 && CFB_MAGIC.every((v, i) => bytes[i] === v))
    return "cfb";
  return "unknown";
}

const utf8 = new TextDecoder("utf-8");

/**
 * Walks the central directory and enforces every cap on declared metadata.
 * Throws DeckImportError; returns the entry list when the archive is safe to
 * hand to fflate.
 */
export function scanZip(bytes: Uint8Array): ZipEntryInfo[] {
  const fail = (detail: string): never => {
    throw new DeckImportError("zip_corrupt", detail);
  };
  const need = (offset: number, length: number) => {
    if (offset < 0 || offset + length > bytes.length)
      fail("central directory runs past the end of the file");
  };

  let eocd = -1;
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= floor; i -= 1) {
    if (u32(bytes, i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("no end-of-central-directory record");

  // ZIP64 is refused outright. A deck under the 250 MB cap never needs it, and
  // fflate 0.8.2 misreads ZIP64 offset sentinels even when the ZIP64 locator is
  // present (wrong bytes, no error; see __tests__/read-package.test.ts).
  const hasLocator = eocd >= 20 && u32(bytes, eocd - 20) === SIG_ZIP64_LOCATOR;
  const count = u16(bytes, eocd + 10);
  const cdOffset = u32(bytes, eocd + 16);
  if (count === SENTINEL_16 || cdOffset === SENTINEL_32) {
    throw new DeckImportError(
      "zip64_unsupported",
      "ZIP64 end-of-central-directory fields",
    );
  }
  if (count > PACKAGE_CAPS.maxEntries) {
    throw new DeckImportError("zip_too_many_entries", `${count} entries`);
  }

  const entries: ZipEntryInfo[] = [];
  let declared = 0;
  let offset = cdOffset;
  for (let i = 0; i < count; i += 1) {
    need(offset, 46);
    if (u32(bytes, offset) !== SIG_CENTRAL)
      fail(`entry ${i} has no central header`);
    const flags = u16(bytes, offset + 8);
    const compressedSize = u32(bytes, offset + 20);
    const uncompressedSize = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const localOffset = u32(bytes, offset + 42);
    need(offset + 46, nameLength + extraLength + commentLength);
    const name = utf8.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );

    if (flags & 1) throw new DeckImportError("zip_encrypted", name);
    if (compressedSize === SENTINEL_32 || uncompressedSize === SENTINEL_32) {
      throw new DeckImportError(
        "zip64_unsupported",
        `${name} declares a 0xFFFFFFFF size`,
      );
    }
    let zip64Extra = false;
    const extraEnd = offset + 46 + nameLength + extraLength;
    for (let e = offset + 46 + nameLength; e + 4 <= extraEnd; ) {
      const id = u16(bytes, e);
      const size = u16(bytes, e + 2);
      if (id === 0x0001) zip64Extra = true;
      e += 4 + size;
    }
    if (zip64Extra || localOffset === SENTINEL_32) {
      throw new DeckImportError(
        "zip64_unsupported",
        `${name} carries ZIP64 fields${hasLocator ? "" : " without a ZIP64 locator"}`,
      );
    }

    declared += uncompressedSize;
    if (declared > PACKAGE_CAPS.maxDeclaredBytes) {
      throw new DeckImportError(
        "zip_declared_too_large",
        `${declared} bytes declared by ${name}`,
      );
    }
    if (
      uncompressedSize >= PACKAGE_CAPS.ratioMinBytes &&
      uncompressedSize > compressedSize * PACKAGE_CAPS.maxRatio
    ) {
      throw new DeckImportError(
        "zip_ratio_exceeded",
        `${name} expands ${compressedSize} to ${uncompressedSize} bytes`,
      );
    }
    entries.push({ name, compressedSize, uncompressedSize });
    offset = extraEnd + commentLength;
  }
  return entries;
}

/** `[Content_Types].xml` is tiny and regular; regex keeps this DOM-free for the worker. */
export function findPresentationPart(contentTypesXml: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(contentTypesXml))
    throw new DeckImportError("xml_invalid", "[Content_Types].xml has a DTD");
  const attr = (tag: string, name: string) =>
    new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1] ?? null;
  for (const tag of contentTypesXml.match(/<Override\b[^>]*>/gi) ?? []) {
    const type = attr(tag, "ContentType") ?? "";
    const partName = attr(tag, "PartName");
    if (!partName) continue;
    if (PRESENTATION_MAIN_TYPES.has(type)) return partName.replace(/^\//, "");
    if (MACRO_MAIN_TYPE.test(type))
      throw new DeckImportError("resave_as_pptx", "macro-enabled presentation");
  }
  throw new DeckImportError(
    "not_a_presentation",
    "no presentationml main part",
  );
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

type UnzipSync = typeof import("fflate").unzipSync;

let fflateModule: Promise<UnzipSync> | null = null;
function loadUnzip(): Promise<UnzipSync> {
  fflateModule ??= import("fflate").then((m) => m.unzipSync);
  return fflateModule;
}

/**
 * Inflates the named entries. fflate reads the same central directory we
 * scanned; any size disagreement means the archive is lying and is refused.
 */
export async function inflateEntries(
  bytes: Uint8Array,
  entries: ZipEntryInfo[],
  names: Iterable<string>,
): Promise<Map<string, Uint8Array>> {
  const unzipSync = await loadUnzip();
  const wanted = new Set(names);
  const declared = new Map(entries.map((e) => [e.name, e.uncompressedSize]));
  let mismatch: string | null = null;
  let out: Record<string, Uint8Array>;
  try {
    out = unzipSync(bytes, {
      filter: (file) => {
        if (!wanted.has(file.name)) return false;
        if (declared.get(file.name) !== file.originalSize) {
          mismatch ??= file.name;
          return false;
        }
        return true;
      },
    });
  } catch (error) {
    throw new DeckImportError(
      "zip_corrupt",
      error instanceof Error ? error.message : String(error),
    );
  }
  if (mismatch)
    throw new DeckImportError(
      "zip_inconsistent",
      `${mismatch} size disagrees with the central directory`,
    );
  const result = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(out)) {
    if (data.length !== declared.get(name)) {
      throw new DeckImportError(
        "zip_inconsistent",
        `${name} inflated to ${data.length} bytes`,
      );
    }
    result.set(name, data);
  }
  return result;
}

/**
 * Detects and opens a deck held in memory. Detection is the zip magic plus a
 * presentationml main part in `[Content_Types].xml`; `.ppt` and `.key` are
 * refused with `resave_as_pptx`.
 */
export async function openPackage(
  name: string,
  bytes: Uint8Array,
): Promise<PackageReader> {
  checkDeckFile({ name, size: bytes.length });
  const format = sniffFormat(bytes);
  if (format === "cfb")
    throw new DeckImportError("resave_as_pptx", "binary PowerPoint (.ppt)");
  if (format !== "zip")
    throw new DeckImportError("not_a_presentation", "not a zip package");
  const entries = scanZip(bytes);
  const entryNames = new Set(entries.map((e) => e.name));
  if (!entryNames.has("[Content_Types].xml")) {
    if (
      [...entryNames].some((n) => n.startsWith("Index/") && n.endsWith(".iwa"))
    ) {
      throw new DeckImportError("resave_as_pptx", "Keynote package");
    }
    throw new DeckImportError("not_a_presentation", "no [Content_Types].xml");
  }
  const types = await inflateEntries(bytes, entries, ["[Content_Types].xml"]);
  const mainPart = findPresentationPart(
    new TextDecoder().decode(types.get("[Content_Types].xml")),
  );
  if (!entryNames.has(mainPart))
    throw new DeckImportError("not_a_presentation", `${mainPart} is missing`);
  return {
    entries,
    entryNames,
    mainPart,
    deck_sha256: await sha256Hex(bytes),
    read: (names) => inflateEntries(bytes, entries, names),
  };
}

/** Pass 1: the XML the manifest needs. Pass 2 is the referenced media only. */
const PASS1_ENTRY =
  /^ppt\/(?:_rels\/[^/]+\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|slideLayouts\/slideLayout\d+\.xml|slideLayouts\/_rels\/slideLayout\d+\.xml\.rels|slideMasters\/slideMaster\d+\.xml|notesSlides\/notesSlide\d+\.xml|notesSlides\/_rels\/notesSlide\d+\.xml\.rels)$/;

export function pass1Names(
  reader: Pick<PackageReader, "entryNames" | "mainPart">,
): string[] {
  const slash = reader.mainPart.lastIndexOf("/");
  const mainRels = `${reader.mainPart.slice(0, slash + 1)}_rels/${reader.mainPart.slice(slash + 1)}.rels`;
  return [...reader.entryNames].filter(
    (n) => n === reader.mainPart || n === mainRels || PASS1_ENTRY.test(n),
  );
}

import { createHash } from "crypto";
import { zipSync } from "fflate";
import { fixtureBytes } from "../__fixtures__/load";
import {
  DeckImportError,
  PACKAGE_CAPS,
  checkDeckFile,
  openPackage,
  pass1Names,
  scanZip,
} from "../read-package";

async function rejection(
  name: string,
  bytes = fixtureBytes(name),
): Promise<DeckImportError> {
  try {
    await openPackage(name, bytes);
  } catch (error) {
    expect(error).toBeInstanceOf(DeckImportError);
    return error as DeckImportError;
  }
  throw new Error(`${name} was accepted`);
}

describe("read-package", () => {
  it("opens a .pptx, finds the main part and hashes the deck", async () => {
    const bytes = fixtureBytes("structure.pptx");
    const reader = await openPackage("structure.pptx", bytes);
    expect(reader.mainPart).toBe("ppt/presentation.xml");
    expect(reader.deck_sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    const names = pass1Names(reader);
    expect(names).toEqual(
      expect.arrayContaining([
        "ppt/presentation.xml",
        "ppt/_rels/presentation.xml.rels",
        "ppt/slides/slide1.xml",
      ]),
    );
    expect(names.some((n) => n.startsWith("ppt/media/"))).toBe(false);
    const files = await reader.read(["ppt/presentation.xml"]);
    expect([...files.keys()]).toEqual(["ppt/presentation.xml"]);
  });

  it("accepts a slideshow (.ppsx) content type", async () => {
    const reader = await openPackage(
      "keynote-2x.ppsx",
      fixtureBytes("keynote-2x.ppsx"),
    );
    expect(reader.mainPart).toBe("ppt/presentation.xml");
  });

  it.each([
    ["legacy.ppt", "resave_as_pptx"],
    ["keynote.key", "resave_as_pptx"],
    ["not-a-deck.docx", "not_a_presentation"],
  ])("rejects %s with %s", async (name, reason) => {
    expect((await rejection(name)).reason).toBe(reason);
  });

  it("rejects a binary .ppt by content even when renamed .pptx", async () => {
    expect(
      (await rejection("renamed.pptx", fixtureBytes("legacy.ppt"))).reason,
    ).toBe("resave_as_pptx");
  });

  it("rejects a Keynote package by content even when renamed .pptx", async () => {
    expect(
      (await rejection("renamed.pptx", fixtureBytes("keynote.key"))).reason,
    ).toBe("resave_as_pptx");
  });

  it("rejects the ratio zip bomb before inflating", async () => {
    const error = await rejection("bomb-ratio.pptx");
    expect(error.reason).toBe("zip_ratio_exceeded");
    expect(error.detail).toContain("ppt/media/zeros.bin");
  });

  it("rejects a central directory that declares more than 1 GiB", async () => {
    expect((await rejection("bomb-declared.pptx")).reason).toBe(
      "zip_declared_too_large",
    );
  });

  it("rejects the fflate #298 layout (sentinels + ZIP64 extras, no locator) instead of mis-parsing it", async () => {
    const error = await rejection("zip64-298.pptx");
    expect(error.reason).toBe("zip64_unsupported");
    expect(error.detail).toMatch(/0xFFFFFFFF size|ZIP64/);
  });

  it("rejects the offset-only #298 variant that size caps miss", async () => {
    const bytes = fixtureBytes("zip64-offset-only.pptx");
    // Every declared size is small: only the ZIP64 rule can catch this one.
    expect(() => scanZip(bytes)).toThrow(DeckImportError);
    const error = await rejection("zip64-offset-only.pptx", bytes);
    expect(error.reason).toBe("zip64_unsupported");
    expect(error.detail).toContain("without a ZIP64 locator");
  });

  it("rejects ZIP64 even with a valid locator (fflate 0.8.2 returns wrong bytes for it)", async () => {
    const error = await rejection("zip64-valid.pptx");
    expect(error.reason).toBe("zip64_unsupported");
    expect(error.detail).not.toContain("without a ZIP64 locator");
  });

  it("caps the entry count", () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i <= PACKAGE_CAPS.maxEntries; i += 1)
      files[`f${i}`] = new Uint8Array(0);
    expect(() => scanZip(zipSync(files, { level: 0 }))).toThrow(
      expect.objectContaining({ reason: "zip_too_many_entries" }),
    );
  });

  it("caps the file size and refuses legacy extensions before reading", () => {
    expect(() =>
      checkDeckFile({ name: "big.pptx", size: PACKAGE_CAPS.maxFileBytes + 1 }),
    ).toThrow(expect.objectContaining({ reason: "file_too_large" }));
    expect(() => checkDeckFile({ name: "old.PPT", size: 10 })).toThrow(
      expect.objectContaining({ reason: "resave_as_pptx" }),
    );
    expect(() => checkDeckFile({ name: "deck.key", size: 10 })).toThrow(
      expect.objectContaining({ reason: "resave_as_pptx" }),
    );
    expect(() => checkDeckFile({ name: "deck.potx", size: 10 })).not.toThrow();
  });
});

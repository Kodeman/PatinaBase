import { isSameDocumentPath, shouldFireZoneFlight } from "../zone-flight";

const DOC_ID = "doc-123";

describe("isSameDocumentPath", () => {
  it("matches the document's own path", () => {
    expect(isSameDocumentPath(`/doc/${DOC_ID}`, DOC_ID)).toBe(true);
  });

  it("matches sub-routes of the document (Plans, Spec Book, Boards)", () => {
    expect(isSameDocumentPath(`/doc/${DOC_ID}/plans`, DOC_ID)).toBe(true);
    expect(isSameDocumentPath(`/doc/${DOC_ID}/spec-book`, DOC_ID)).toBe(true);
    expect(isSameDocumentPath(`/doc/${DOC_ID}/boards`, DOC_ID)).toBe(true);
  });

  it("does not match a different document or a different surface", () => {
    expect(isSameDocumentPath("/doc/other-doc", DOC_ID)).toBe(false);
    expect(isSameDocumentPath("/desk", DOC_ID)).toBe(false);
    // a doc id that is merely a prefix of another id is not the same document
    expect(isSameDocumentPath(`/doc/${DOC_ID}xyz`, DOC_ID)).toBe(false);
  });
});

describe("shouldFireZoneFlight", () => {
  const base = {
    heldMs: 1_000,
    wrote: false,
    alreadyFired: false,
    docId: DOC_ID,
    nextPath: null as string | null,
  };

  it("fires on an explicit put-down under 10s with no write", () => {
    expect(shouldFireZoneFlight(base)).toBe(true);
  });

  it("does not fire after a write happened since pick-up", () => {
    expect(shouldFireZoneFlight({ ...base, wrote: true })).toBe(false);
  });

  it("does not fire at or past the 10s threshold", () => {
    expect(shouldFireZoneFlight({ ...base, heldMs: 10_000 })).toBe(false);
    expect(shouldFireZoneFlight({ ...base, heldMs: 15_000 })).toBe(false);
  });

  it("fires at most once per pick-up (alreadyFired latches)", () => {
    expect(shouldFireZoneFlight({ ...base, alreadyFired: true })).toBe(false);
  });

  it("does NOT fire on navigation to a sub-route of the same document", () => {
    expect(
      shouldFireZoneFlight({ ...base, nextPath: `/doc/${DOC_ID}/plans` }),
    ).toBe(false);
    expect(
      shouldFireZoneFlight({ ...base, nextPath: `/doc/${DOC_ID}/spec-book` }),
    ).toBe(false);
    expect(
      shouldFireZoneFlight({ ...base, nextPath: `/doc/${DOC_ID}/boards` }),
    ).toBe(false);
  });

  it("DOES fire on navigation away to a different surface (e.g. /desk)", () => {
    expect(shouldFireZoneFlight({ ...base, nextPath: "/desk" })).toBe(true);
  });

  it("DOES fire on navigation to a different document entirely", () => {
    expect(
      shouldFireZoneFlight({ ...base, nextPath: "/doc/some-other-doc" }),
    ).toBe(true);
  });

  it("does not fire without a docId (no pick-up in progress)", () => {
    expect(shouldFireZoneFlight({ ...base, docId: "" })).toBe(false);
  });

  it("can fire again once a new pick-up resets the latch (new engagement id)", () => {
    // A prior pick-up already fired and latched.
    expect(shouldFireZoneFlight({ ...base, alreadyFired: true })).toBe(false);
    // Arrival at a new engagement resets `alreadyFired`/`wrote`/pick-up time —
    // the same eligible put-down now fires independently.
    expect(shouldFireZoneFlight({ ...base, alreadyFired: false, wrote: false })).toBe(
      true,
    );
  });
});

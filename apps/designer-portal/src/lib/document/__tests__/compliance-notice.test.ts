/**
 * The nightly sweep's sentence (00630), which three surfaces print.
 *
 * The distinction this file exists to keep: a paper WORD says where the
 * certificate stands, a NOTICE says the studio has already been told. Paper
 * with no notice row behind it earns no sentence here.
 */

import type {
  ComplianceNotice,
  StudioComplianceDocument,
} from "@patina/supabase";
import { expiryNoticeClause, noticedPaperClause } from "../compliance-notice";

const LABELS = {
  coi_gl: "COI, general liability",
  license: "Trade licence",
};

function doc(
  over: Partial<StudioComplianceDocument> = {},
): StudioComplianceDocument {
  return {
    id: "doc-1",
    organization_id: "org-1",
    holder_type: "company",
    holder_id: "firm-northgate",
    doc_type: "coi_gl",
    doc_label: null,
    number: null,
    issuer: null,
    issued_on: null,
    expires_on: "2026-10-06",
    file_path: null,
    verified_by: null,
    verified_at: null,
    held_by: null,
    blocks: ["site_access"],
    superseded_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  } as unknown as StudioComplianceDocument;
}

function notice(
  document_id: string,
  state: "lapses_soon" | "lapsed",
): ComplianceNotice {
  return {
    id: `${document_id}:${state}`,
    organization_id: "org-1",
    document_id,
    state,
    noticed_at: "2026-09-13T06:00:00Z",
  };
}

describe("expiryNoticeClause", () => {
  // M2R-1: the clause carries the DATE and no interval. `lapses_soon` is a
  // 30-day window, not a 30-day distance — the sweep writes the notice once, on
  // entry — so "lapses in 30 days, on 6 October 2026" was two halves of one
  // sentence disagreeing for the whole window (measured: 23 days out on the
  // shipped fixture).
  it("names the day the paper goes, and claims no interval beside it", () => {
    expect(
      expiryNoticeClause({
        holderName: "Northgate Electric",
        paperNoun: "insurance",
        expiresOn: "2026-10-06",
        state: "lapses_soon",
      }),
    ).toBe("Northgate Electric’s insurance lapses on 6 October 2026.");
  });

  it("never prints an interval it has not counted", () => {
    for (const days of [1, 12, 23, 30]) {
      const on = new Date(Date.UTC(2026, 9, days));
      const clause = expiryNoticeClause({
        holderName: "Northgate Electric",
        paperNoun: "insurance",
        expiresOn: on.toISOString().slice(0, 10),
        state: "lapses_soon",
      });
      expect(clause).not.toContain("in 30 days");
    }
  });

  it("reads in the past tense once it has gone", () => {
    expect(
      expiryNoticeClause({
        holderName: "Northgate Electric",
        paperNoun: "insurance",
        expiresOn: "2026-03-31",
        state: "lapsed",
      }),
    ).toBe("Northgate Electric’s insurance lapsed 31 March 2026.");
  });

  it("still reads as a sentence with no holder and no date", () => {
    expect(
      expiryNoticeClause({
        holderName: null,
        paperNoun: "licence",
        expiresOn: null,
        state: "lapses_soon",
      }),
    ).toBe("The licence lapses soon.");
  });
});

describe("noticedPaperClause", () => {
  it("says nothing about paper the sweep has not spoken about", () => {
    expect(
      noticedPaperClause(
        ["firm-northgate"],
        "Northgate Electric",
        [doc()],
        new Map(),
        LABELS,
      ),
    ).toBeNull();
  });

  it("uses the plain noun, never the company card’s column head", () => {
    const clause = noticedPaperClause(
      ["firm-northgate"],
      "Northgate Electric",
      [doc()],
      new Map([["doc-1", notice("doc-1", "lapses_soon")]]),
      LABELS,
    );
    expect(clause).toContain("insurance");
    expect(clause).not.toContain("COI, general liability");
  });

  it("lets the worst noticed paper speak first", () => {
    const clause = noticedPaperClause(
      ["firm-northgate"],
      "Northgate Electric",
      [
        doc(),
        doc({ id: "doc-2", doc_type: "license", expires_on: "2026-03-31" }),
      ],
      new Map([
        ["doc-1", notice("doc-1", "lapses_soon")],
        ["doc-2", notice("doc-2", "lapsed")],
      ]),
      LABELS,
    );
    expect(clause).toBe("Northgate Electric’s licence lapsed 31 March 2026.");
  });

  it("reads the person’s own paper beside the firm’s (R-BA)", () => {
    const clause = noticedPaperClause(
      ["firm-northgate", "card-dana"],
      "Dana Kowalski",
      [
        doc({
          id: "doc-3",
          holder_type: "person",
          holder_id: "card-dana",
          doc_type: "license",
        }),
      ],
      new Map([["doc-3", notice("doc-3", "lapses_soon")]]),
      LABELS,
    );
    expect(clause).toBe("Dana Kowalski’s licence lapses on 6 October 2026.");
  });

  it("answers nothing where there is no holder to ask about", () => {
    expect(
      noticedPaperClause(
        [null, undefined],
        "Nobody",
        [doc()],
        new Map(),
        LABELS,
      ),
    ).toBeNull();
  });
});

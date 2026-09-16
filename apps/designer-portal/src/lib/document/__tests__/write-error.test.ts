/**
 * `writeErrorMessage` — the one translator between a PostgREST rejection and a
 * face. SPEC §8 #3: never a schema word, never a bare token, never a shrug
 * where the database said something the studio can act on.
 *
 * Added for M2R-4: 00629 minted two new refusals as BARE TOKENS
 * (`party_card_merged_away`, `party_company_merged_away`), which the
 * schema-word guard does not match — so the token itself reached the face,
 * exactly the defect the file's own CR-3 comment records for 00624's three.
 */
import { writeErrorMessage } from "../write-error";

describe("writeErrorMessage", () => {
  it("says what a merged-away card is, in the studio's words", () => {
    expect(
      writeErrorMessage({ message: "party_card_merged_away" }, "fallback"),
    ).toBe(
      "That card has been folded into another one. Open the card that survived and add them from there.",
    );
    expect(
      writeErrorMessage({ message: "party_company_merged_away" }, "fallback"),
    ).toBe(
      "That firm's card has been folded into another one. Name the firm that survived.",
    );
  });

  it("still answers 00624's three bare tokens", () => {
    expect(
      writeErrorMessage(
        { message: "party_card_project_has_no_studio" },
        "fallback",
      ),
    ).toContain("isn't attached to a studio yet");
    expect(
      writeErrorMessage({ message: "party_company_other_studio" }, "fallback"),
    ).toContain("another studio's book");
    expect(
      writeErrorMessage(
        { message: "party_company_not_a_company" },
        "fallback",
      ),
    ).toContain("name the firm's own card here");
  });

  it("never lets a schema word or an RLS string through", () => {
    expect(
      writeErrorMessage(
        {
          message:
            'new row violates row-level security policy for table "project_parties"',
        },
        "fallback",
      ),
    ).toBe("This studio's book is not yours to write. Ask an owner or admin.");
    expect(
      writeErrorMessage(
        {
          message:
            'duplicate key value violates unique constraint "idx_project_parties_bid"',
        },
        "fallback",
      ),
    ).toBe("fallback");
    expect(writeErrorMessage({ message: "" }, "fallback")).toBe("fallback");
  });
});

/**
 * r21 MAJOR-1 / major-2 (R-BS) — 00634's two seat-close refusals. They are
 * BARE TOKENS with no SQLSTATE, so the schema-word guard matches none of them
 * and `return raw` printed `seat_close_money_authority_forbidden` on three
 * faces. One press gets there: "They withdrew" in the Bidding band, or "Close
 * the seat", taken by a member who is not an owner or admin.
 */
describe("writeErrorMessage — 00634's seat-close refusals", () => {
  it("says the PR-n rule, and never the token", () => {
    const said = writeErrorMessage(
      { message: "seat_close_money_authority_forbidden" },
      "Could not close the seat.",
    );
    expect(said).toContain("owner or an admin");
    expect(said).not.toContain("seat_close");
  });

  it("names the other studio's book rather than the token", () => {
    const said = writeErrorMessage(
      { message: "seat_close_authority_forbidden" },
      "Could not close the seat.",
    );
    expect(said).toContain("another studio");
    expect(said).not.toContain("forbidden");
  });

  it("reads a PostgREST rejection that is an Error, which is what postgrest-js throws", () => {
    const err = Object.assign(
      new Error("seat_close_money_authority_forbidden"),
      { code: "P0001" },
    );
    expect(
      writeErrorMessage(err, "Could not close the seat."),
    ).toContain("owner or an admin");
  });
});

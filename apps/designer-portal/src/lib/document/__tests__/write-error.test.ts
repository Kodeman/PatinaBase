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

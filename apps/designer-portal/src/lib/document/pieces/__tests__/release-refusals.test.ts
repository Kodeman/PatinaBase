/**
 * T-60d (F16): every refusal the Release lens can meet reads as a sentence
 * that says what to do and where; anything else reads the fallback. The
 * messages are the RAISE texts of the latest bodies, with their `%` filled.
 */

import { RELEASE_FALLBACK, releaseRefusalMessage } from "../release-refusals";

const PROJECT = "e6590000-0000-0000-0000-000000000001";
const LINE = "e6590000-0000-0000-0000-0000000000d1";

const CASES: ReadonlyArray<readonly [string, string]> = [
  // create_furnishings_authorization_from_schedule (00445 gate, 00744 impl)
  [
    `schedule line ${LINE} is not ready for authorization: ["vendor"]`,
    "Pick each maker from your vendors, then release again.",
  ],
  [
    `schedule line ${LINE} is not ready for authorization: ["designDisposition", "image"]`,
    "A line here is not ready to release. Check its readiness in the table, then release again.",
  ],
  [
    "Labor is released with its piece.",
    "Labor is released with its piece. Select the piece for the client too.",
  ],
  [
    `project ${PROJECT} has no executed design-services origin`,
    "Sign the design agreement with the client before releasing pieces.",
  ],
  [
    "latest furnishings checkpoint must be acknowledged or audited override",
    "Acknowledge the latest furnishings checkpoint on the Document before releasing.",
  ],
  [
    "budget checkpoint no longer matches its published version",
    "The budget changed after the client acknowledged it. Publish it again on the Document, then release.",
  ],
  [
    'room "Dining" is not covered by the acknowledged budget',
    "Dining has no budget the client acknowledged. Add it to the budget on the Document, then release.",
  ],
  [
    'schedule line "Tile install" is trade work on its own scope and cannot be released as furnishings',
    "Trade work is released on its own scope, not here.",
  ],
  [
    `schedule line ${LINE} is still TBD; resolve it before releasing`,
    "Choose a fixed price or an allowance for every line in Price, then release.",
  ],
  [
    `schedule line ${LINE} has unsupported item type tbd`,
    "Choose a fixed price or an allowance for every line in Price, then release.",
  ],
  [
    `schedule line ${LINE} has no quantity to authorize`,
    "Give every line a quantity, then release.",
  ],
  [
    `fixed schedule line ${LINE} has no client price to authorize`,
    "Set a client price on every line in Price, then release.",
  ],
  [
    `allowance schedule line ${LINE} has no ceiling to authorize`,
    "Set a ceiling on every allowance in Price, then release.",
  ],
  [
    `schedule line ${LINE} has no room; file it in a room before releasing`,
    "File every line in a room in Rough in, then release.",
  ],
  [
    `schedule line ${LINE} is already named by a live authorization`,
    "A line here is already on a release. Send or void that draft, then release again.",
  ],
  [
    `schedule line ${LINE} is already bound to an executed authorization`,
    "A line here is already authorized by the client. Reload the Build room, then release again.",
  ],
  [
    `project ${PROJECT} not found or access denied`,
    "This job could not be read for your account. Reload the Build room, then try again.",
  ],
  [
    `schedule line ${LINE} does not belong to project ${PROJECT}`,
    "This job could not be read for your account. Reload the Build room, then try again.",
  ],
  ["authentication required", "Sign in again, then release."],
  [
    "furnishings release requires an authenticated actor",
    "Sign in again, then release.",
  ],
  // send_commercial_document (00578) and its snapshot read (00412)
  [
    `commercial draft ${PROJECT} not found or access denied`,
    "This job could not be read for your account. Reload the Build room, then try again.",
  ],
  [
    "commercial document changed after review; refresh before sending",
    "The release changed while it was being sent. Send the draft again.",
  ],
  [
    "commercial document changed while sending; refresh before sending",
    "The release changed while it was being sent. Send the draft again.",
  ],
  [
    "commercial document requires an exact client relationship before sending",
    "Link a client to this job before releasing.",
  ],
  [
    "commercial document client must have an email before sending",
    "Add the client's email to the job, then send the draft.",
  ],
  [
    "furnishings send requires a valid checkpoint and item snapshot",
    "Acknowledge the latest furnishings checkpoint on the Document, then send the draft.",
  ],
  // void_furnishings_authorization (00422)
  [
    `furnishings authorization ${PROJECT} is sent and can no longer be voided`,
    "The client already has this release, so it can no longer be voided. Reload the Build room.",
  ],
];

describe("releaseRefusalMessage", () => {
  it.each(CASES)("maps %p", (raw, sentence) => {
    expect(releaseRefusalMessage(new Error(raw))).toBe(sentence);
  });

  it("reads a PostgREST error object's message, not only an Error", () => {
    expect(
      releaseRefusalMessage({
        code: "23514",
        message: `project ${PROJECT} has no executed design-services origin`,
        details: null,
        hint: null,
      }),
    ).toBe(
      "Sign the design agreement with the client before releasing pieces.",
    );
  });

  it("falls back for anything unmapped, and never prints SQL text", () => {
    for (const cause of [
      new Error(
        "authorization items are inserted only by the canonical release RPC",
      ),
      new Error('duplicate key value violates unique constraint "x_pkey"'),
      new Error("Failed to fetch"),
      { message: 42 },
      null,
      undefined,
    ]) {
      expect(releaseRefusalMessage(cause)).toBe(RELEASE_FALLBACK);
    }
    expect(RELEASE_FALLBACK).toBe("The release did not go through.");
  });

  it("no sentence carries SQL text, an id, or a banned word", () => {
    const banned =
      /\b(AI|algorithm|engine|powered by|curated|luxury|bespoke|elevated)\b|schedule line|authorization:|design-services|e6590000|%/i;
    for (const [raw] of CASES) {
      expect(releaseRefusalMessage(new Error(raw))).not.toMatch(banned);
    }
  });
});

/**
 * US-21 T-60d (F16): the Release lens's refusals, as sentences.
 *
 * The release, send and void RPCs the lens calls refuse in SQL text. This maps
 * each refusal, by a stable piece of its message, to a sentence that says what
 * to do and where. Anything unmapped reads `The release did not go through.`
 * SQL text never reaches the page.
 *
 * Sources (latest bodies):
 * - `create_furnishings_authorization_from_schedule`: wrapper 00462:1408, the
 *   readiness gate 00445:88, the impl 00744:102, `get_project_ffe_readiness`
 *   00733:44 and `_ffe_require_studio_project` 00717.
 * - `get_commercial_document_send_snapshot` 00412 and
 *   `send_commercial_document` 00578:6953 (its furnishings branches).
 * - `void_furnishings_authorization` 00422:662.
 */

export const RELEASE_FALLBACK = "The release did not go through.";

type Refusal = readonly [
  match: RegExp,
  sentence: string | ((found: RegExpMatchArray) => string),
];

/** First match wins, so the narrower message comes before the broader one. */
const REFUSALS: readonly Refusal[] = [
  // The readiness gate, for a named line or a piece's labor.
  [
    /is not ready for authorization: .*"vendor"/,
    "Pick each maker from your vendors, then release again.",
  ],
  [
    /is not ready for authorization/,
    "A line here is not ready to release. Check its readiness in the table, then release again.",
  ],
  [
    /Labor is released with its piece/,
    "Labor is released with its piece. Select the piece for the client too.",
  ],
  // The project's commercial standing.
  [
    /has no executed design-services origin/,
    "Sign the design agreement with the client before releasing pieces.",
  ],
  [
    /latest furnishings checkpoint must be acknowledged/,
    "Acknowledge the latest furnishings checkpoint on the Document before releasing.",
  ],
  [
    /budget checkpoint no longer matches its published version/,
    "The budget changed after the client acknowledged it. Publish it again on the Document, then release.",
  ],
  [
    /room "(.+)" is not covered by the acknowledged budget/,
    (found) =>
      `${found[1]} has no budget the client acknowledged. Add it to the budget on the Document, then release.`,
  ],
  // One line in the set.
  [
    /is trade work on its own scope/,
    "Trade work is released on its own scope, not here.",
  ],
  [
    /is still TBD|has unsupported item type/,
    "Choose a fixed price or an allowance for every line in Price, then release.",
  ],
  [/has no quantity to authorize/, "Give every line a quantity, then release."],
  [
    /has no client price to authorize/,
    "Set a client price on every line in Price, then release.",
  ],
  [
    /has no ceiling to authorize/,
    "Set a ceiling on every allowance in Price, then release.",
  ],
  [
    /has no room; file it in a room/,
    "File every line in a room in Rough in, then release.",
  ],
  [
    /is already named by a live authorization/,
    "A line here is already on a release. Send or void that draft, then release again.",
  ],
  [
    /is already bound to an executed authorization/,
    "A line here is already authorized by the client. Reload the Build room, then release again.",
  ],
  // The send.
  [
    /requires an exact client relationship/,
    "Link a client to this job before releasing.",
  ],
  [
    /client must have an email/,
    "Add the client's email to the job, then send the draft.",
  ],
  [
    /furnishings send requires a valid checkpoint/,
    "Acknowledge the latest furnishings checkpoint on the Document, then send the draft.",
  ],
  [
    /commercial document changed (after review|while sending)/,
    "The release changed while it was being sent. Send the draft again.",
  ],
  // The void.
  [
    /can no longer be voided/,
    "The client already has this release, so it can no longer be voided. Reload the Build room.",
  ],
  // Who is asking.
  [
    /authentication required|requires an authenticated/,
    "Sign in again, then release.",
  ],
  [
    /not found or access denied|does not belong to project|selection not found/,
    "This job could not be read for your account. Reload the Build room, then try again.",
  ],
];

function messageOf(cause: unknown): string | null {
  if (typeof cause === "string") return cause;
  if (cause != null && typeof cause === "object" && "message" in cause) {
    const { message } = cause as { message: unknown };
    return typeof message === "string" ? message : null;
  }
  return null;
}

/** The sentence the lens prints for a failed release, send or void. */
export function releaseRefusalMessage(cause: unknown): string {
  const message = messageOf(cause);
  if (!message) return RELEASE_FALLBACK;
  for (const [match, sentence] of REFUSALS) {
    const found = message.match(match);
    if (found) return typeof sentence === "string" ? sentence : sentence(found);
  }
  return RELEASE_FALLBACK;
}

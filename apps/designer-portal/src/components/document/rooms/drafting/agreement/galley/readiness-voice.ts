/**
 * The readiness voice — one sentence, in one permanent status region.
 *
 * It counts THINGS TO FINISH, not parts: two blockers filed against the same
 * part are two things, and one blocker filed against a pair of parts is one.
 * An uncoded blocker falls back to its own message, so the region is never
 * empty and never wrong (§A10, check 5).
 */

import { agreementCountWord } from "@patina/types";
import type { AgreementReadiness } from "../readiness";

interface Thing {
  message: string;
  /** The imperative phrase — "name a fee". */
  ask: string;
  /** What the voice says when THIS is the thing that just went. */
  cleared: string | null;
}

function things(readiness: AgreementReadiness | null): Thing[] {
  if (!readiness) return [];
  const seen = new Map<string, Thing>();
  for (const blocker of readiness.blockers) {
    if (seen.has(blocker.message)) continue;
    seen.set(blocker.message, {
      message: blocker.message,
      // A fallback is a whole sentence and the voice punctuates its own, so
      // the full stop comes off rather than doubling.
      ask: (blocker.ask ?? blocker.message).replace(/\.$/, ""),
      cleared: blocker.cleared ?? null,
    });
  }
  return [...seen.values()];
}

function sentenceCase(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

export function composeReadinessSentence(
  current: AgreementReadiness,
  previous: AgreementReadiness | null,
): string {
  const outstanding = things(current);
  if (outstanding.length === 0) return "Nothing left to finish.";

  // The count moved, and the sentence that was standing is replaced rather
  // than dropped: the designer sees what her writing did (LH-10).
  const gone = things(previous).find(
    (thing) =>
      thing.cleared !== null &&
      !outstanding.some((left) => left.message === thing.message),
  );
  if (gone && outstanding.length === 1) {
    return `${gone.cleared}. One thing left: ${outstanding[0]!.ask}.`;
  }

  if (outstanding.length === 1) {
    return `One thing before this can go: ${outstanding[0]!.ask}.`;
  }
  const word = sentenceCase(agreementCountWord(outstanding.length));
  const asks = outstanding.map((thing) => thing.ask).join("; ");
  return `${word} things before this can go: ${asks}.`;
}

/**
 * QA-R3-1 — SAY WHAT ACTUALLY WENT WRONG.
 *
 * PostgREST rejections arrive as a PLAIN OBJECT (`{message, code, details,
 * hint}`), not an `Error`. Both submit paths tested `e instanceof Error` and
 * fell through to "Could not add them just now. Try again." for every one of
 * them, which is how a wrong-studio `promoteToStudioContact` refusal reached
 * the designer as a shrug. A raw Postgres string is still never printed: an RLS
 * or permission refusal is translated, and a schema word (SPEC §8 #3) is
 * replaced by the fallback rather than shown.
 *
 * CR5-1 — it lives HERE rather than inside the Add sheet because the rolodex
 * picker writes the same two rows through the same guard and was still testing
 * `e instanceof Error`, so every 00624 refusal reached its face as "Could not
 * add them to the call sheet."
 */
export function writeErrorMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: unknown } | null)?.code;
  const raw =
    err instanceof Error
      ? err.message
      : (((err as { message?: unknown } | null)?.message as
          | string
          | undefined) ?? "");
  const haystack = `${typeof code === "string" ? code : ""} ${raw}`;
  if (/row-level security|permission denied|42501|PGRST116/i.test(haystack)) {
    return "This studio's book is not yours to write. Ask an owner or admin.";
  }
  // CR-3 — 00624's `party_card_guard_trg` refusals, said in words. They are
  // raised as bare tokens, which the schema-word guard below does not catch,
  // so without these three the token itself reached the face.
  if (/party_card_project_has_no_studio/i.test(haystack)) {
    return "This project isn't attached to a studio yet, so a firm from the studio's book can't be put on its seats. Give the project a studio first.";
  }
  if (/party_company_other_studio/i.test(haystack)) {
    return "That firm belongs to another studio's book, so it can't be named on this job.";
  }
  if (/party_company_not_a_company/i.test(haystack)) {
    return "A person doesn't hold the subcontract — name the firm's own card here.";
  }
  // M2R-4 — 00629's two merged-card refusals, for the same reason as CR-3's
  // three: they are raised as BARE TOKENS, which the schema-word guard below
  // does not match, so `party_card_merged_away` reached the face verbatim. One
  // press gets there — "Add" on a card the Directory has already folded away.
  if (/party_card_merged_away/i.test(haystack)) {
    return "That card has been folded into another one. Open the card that survived and add them from there.";
  }
  if (/party_company_merged_away/i.test(haystack)) {
    return "That firm's card has been folded into another one. Name the firm that survived.";
  }
  // Never a schema word on a face: a constraint or index name, a relation, a
  // column. Those sentences are for the log, not the studio.
  if (
    !raw.trim() ||
    /duplicate key|violates|constraint|idx_|_fkey|_pkey|column |relation /i.test(
      raw,
    )
  ) {
    return fallback;
  }
  return raw;
}

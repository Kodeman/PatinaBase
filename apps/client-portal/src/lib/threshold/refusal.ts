/* ── A REFUSED ACT, IN THE HOUSE'S WORDS ─────────────────────────────────────
   An act that is refused says so in a sentence this surface authored. The
   cause's own text is a PostgREST or edge-function string — a developer's
   message, in a developer's voice, sometimes naming a table or a constraint —
   and it is never printed to the homeowner as content.

   In development the cause is carried in parentheses, because the sentence on
   its own tells the person fixing it nothing. ─────────────────────────────── */

export function refusalSentence(cause: unknown, sentence: string): string {
  if (
    process.env.NODE_ENV === 'development' &&
    cause instanceof Error &&
    cause.message
  ) {
    return `${sentence} (${cause.message})`;
  }
  return sentence;
}

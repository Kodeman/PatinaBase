import type { EditionMeta } from '@/lib/editorial/types';
import { DAY_MONTH_FORMAT as DAY_MONTH } from '@/lib/threshold/dates';

/* The House Issue, Phase 2: what the page says about its own re-setting.
   The notice is the opening sentence of the studio's letter, in the letter's
   own voice; Earlier keeps one line naming the edition the page now prints.
   Neither says why the page changed, nor who or what composed it. */

/** The notice as the letter's lead line; nothing when the edition has none. */
export function EditionNotice({ notice }: { notice?: string | null }) {
  const lead = notice?.trim();
  if (!lead) return null;
  return (
    <p
      data-testid="edition-notice"
      className="mb-3 whitespace-pre-line font-heading text-[1.2rem] italic leading-relaxed"
    >
      {lead}
    </p>
  );
}

/**
 * "Edition 2 · approved by the studio · 21 October"; an edition the page
 * published on its own reads "Edition 3 · published 21 October".
 */
export function editionLine(edition: EditionMeta): string {
  const approved = new Date(edition.approvedAt);
  const date = Number.isNaN(approved.getTime()) ? null : DAY_MONTH.format(approved);
  const head = `Edition ${edition.seq}`;
  if (edition.approvedBy === 'auto') return date ? `${head} · published ${date}` : `${head} · published`;
  return date ? `${head} · approved by the studio · ${date}` : `${head} · approved by the studio`;
}

/** The one line at the top of Earlier; nothing without an approved edition. */
export function EditionLine({ edition }: { edition?: EditionMeta | null }) {
  if (!edition) return null;
  return (
    <p
      data-testid="edition-line"
      className="mt-3 text-[15px] text-[var(--text-body)]"
    >
      {editionLine(edition)}
    </p>
  );
}

'use client';

/**
 * THE CONTACT RULE, AS A SENTENCE (E7).
 *
 * PR-e / C3: a forbidding or routing rule is PROSE beside the reach word, never
 * a fourth word. Access tier answers "how"; a contact rule answers "how not",
 * and merging them loses one axis.
 *
 * A HARD BLOCK — a rule that forbids a channel outright — carries a 2px
 * `--terracotta-ink` leading rule and prints on the held ground (direction
 * §5.4, house sheet §A14). No dot, no badge, no opacity.
 *
 * R-S: the clause prints WHEREVER a rule is shown — Directory row, roster row,
 * person card, company card crew line — and the routed line is appended only
 * when a route exists.
 *
 * R-L / C22: the routed line carries a WAY TO REACH the routed person — her
 * email AND her office phone as a `tel:` link, both, wherever the studio holds
 * both (SPEC §5.1 #10, §5.4 #12). An either/or printed one channel and hid the
 * other on every face. NEVER a bare phone string — a routing instruction with
 * no channel attached sends the reader nowhere, and one with an unlinked
 * number makes a superintendent retype it standing on site.
 */

import { TelLink } from './tel-link';

export interface ContactRouteTarget {
  name: string;
  email?: string | null;
  /** The routed person's OFFICE line, per R-L's selection rule. */
  officePhone?: string | null;
}

export interface ContactRuleLineProps {
  /**
   * The rule as one sentence, composed by `contactRuleClause()` off the rule
   * ROW. CR3-2: never `contact_rule_summary(subject_type, subject_id)` — that
   * column prints raw `channel_kind` tokens (`after_hours`, `ap_email`,
   * `portal_311`, `dispatch`), which SPEC §8 #3 bars from any face, and it
   * drops the studio's own typed reason. A caller whose rule row has not
   * loaded passes `null` and prints no clause.
   */
  summary: string | null | undefined;
  /**
   * True when the rule forbids a channel outright. Only a hard block wears the
   * leading rule; a rule that merely prefers a channel is ordinary prose.
   */
  blocked?: boolean;
  /** Present only where the rule routes somewhere (R-L). */
  routeTo?: ContactRouteTarget | null;
  className?: string;
}

/** The routed sentence, in the one wording every call site uses. */
export function routedSentence(name: string): string {
  return `Write ${name} instead.`;
}

export function ContactRuleLine({
  summary,
  blocked = false,
  routeTo,
  className,
}: ContactRuleLineProps) {
  const text = summary?.trim();
  // No rule on file is a FACT, and it is the CARD's sentence to print
  // ("No contact rule on file." — R-V), not this line's. A row with no rule
  // prints no clause at all.
  if (!text && !routeTo) return null;

  // The studio's own sentence often already says where to write ("Write Rosa
  // Delgado; she forwards what he has to sign."). Repeating the canonical
  // routed sentence after it is house voice talking over the studio.
  const alreadyRouted =
    !!routeTo && !!text && text.includes(`Write ${routeTo.name}`);

  return (
    <p
      data-contact-rule
      data-contact-rule-blocked={blocked ? 'true' : undefined}
      className={`t-body-sm mt-1 text-[var(--ink)] ${
        blocked
          ? 'border-l-2 border-[var(--terracotta-ink)] bg-[var(--rail)] py-[6px] pl-[11px]'
          : ''
      } ${className ?? ''}`}
    >
      {text}
      {routeTo ? (
        <>
          {text ? ' ' : null}
          <span data-contact-rule-route>
            {alreadyRouted ? null : routedSentence(routeTo.name)}
            {routeTo.email ? (
              <>
                {' '}
                <a
                  data-contact-rule-route-email
                  href={`mailto:${routeTo.email}`}
                  className="underline decoration-[var(--color-clay)] underline-offset-[3px]"
                >
                  {routeTo.email}
                </a>
              </>
            ) : null}
            {routeTo.officePhone ? (
              // BOTH, where the studio holds both (SPEC §5.1 #10 / §5.4 #12).
              <>
                {' '}
                {/* Still its own 44px control (SPEC §5.1 #15): a routed phone
                    is a phone, and the rule that every number on screen is its
                    own generous target does not except this one. */}
                <TelLink phone={routeTo.officePhone} personName={routeTo.name} />
              </>
            ) : null}
          </span>
        </>
      ) : null}
    </p>
  );
}

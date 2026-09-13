'use client';

/**
 * Shared People-Room primitives: the role-tinted avatar and the role badge.
 * One source of truth so the directory, the profile, the nurture queue, and
 * the threads list all read identically. Zero shadows (D4); colours come from
 * the brand tokens (globals.css).
 *
 * `StatusDot` IS RETIRED (direction §4, SPEC §5.1 #16). A bare `aria-hidden`
 * colour circle carries a state in colour alone, which SPEC §7 #9 forbids
 * outright: every state now carries a visible WORD, and `StateWord`
 * (`state-word.tsx`) is the one primitive that prints it.
 */

import type { PartyRole } from '@patina/supabase';
import { StateWord } from './state-word';
import { roleLabel } from '@/lib/document/people-derivation';

/** The avatar's shape (slide 9, "Circles + squares"): a person is a circle, a
 *  company is a rounded square — the ONE visual difference between them.
 *  Defaults to 'circle' so every pre-Wave-2 call site is unaffected. */
export type AvatarShape = 'circle' | 'square';

// Keyed loosely by string, not PartyRole: the studio rolodex's contact_kind
// (00417) is free TEXT and widens past PartyRole — a person card can carry
// architect/photographer/stager/vendor/client_rep/other (PartyKind, Wave 1),
// and a company card carries its OWN kind vocabulary entirely (gc/vendor/
// workroom/showroom/supplier — see company-row.tsx's companyKindLabel). A
// strict Record<PartyRole,...> would reject every one of those at the call
// site; AVATAR_FALLBACK_BG covers anything this map doesn't name.
const AVATAR_FALLBACK_BG = 'var(--color-aged-oak)';

const AVATAR_BG: Record<string, string> = {
  client: 'var(--color-sage)',
  maker: 'var(--color-aged-oak)',
  gc: 'var(--color-dusty-blue)',
  team: 'var(--color-clay)',
  lead: 'var(--color-terracotta)',
  // Field kinds (00281) — the site trades, distinct but in the warm palette.
  sub: 'var(--color-mocha)',
  installer: 'var(--color-golden-hour)',
  receiver: 'var(--color-terracotta)',
  // Call Sheet Wave 2 (00281's later PartyKind widening) — allied design-
  // adjacent professions and the rolodex's own company kinds. Picked from the
  // existing palette only (no new tokens): architect sits next to the GC's
  // dusty-blue (an allied site professional); photographer/stager read quiet
  // (quiet-ink) rather than warm, since neither is a trade or a firm.
  architect: 'var(--color-dusty-blue)',
  photographer: 'var(--color-quiet-ink)',
  stager: 'var(--color-quiet-ink)',
  // Company kinds (studio_contacts.contact_kind on an entity_kind='company'
  // card — see company-row.tsx's COMPANY_KIND_LABELS for the matching label
  // map). 'vendor' shares the maker tint deliberately: a vendor company IS a
  // maker's firm.
  vendor: 'var(--color-aged-oak)',
  workroom: 'var(--color-mocha)',
  showroom: 'var(--color-golden-hour)',
  supplier: 'var(--color-aged-oak)',
};

/**
 * IDENTITY HUES, HELD OFF THE FOUR STATE TOKENS (direction §4).
 *
 * A role badge says WHO somebody is; a state word says HOW THINGS STAND. When
 * the two share a pigment the reader has to guess which question a colour is
 * answering — a `lead` badge in terracotta reads as a blocked state, and a
 * `client` badge in sage reads as current. So none of these is sage,
 * golden-hour, terracotta or the dormant hairline: the identity palette is oak,
 * mocha, clay, dusty blue, quiet ink and charcoal, and the state palette is the
 * other four.
 *
 * Every `color` here is a text-grade ink — `--color-dusty-blue-ink` is the one
 * PR-v added, because base dusty blue reads 1.9:1 on paper and was never
 * legible as a word.
 */
const BADGE: Record<PartyRole, { color: string; border: string }> = {
  client: { color: 'var(--color-charcoal)', border: 'var(--color-clay)' },
  maker: { color: 'var(--color-aged-oak)', border: '#cbb48f' },
  gc: { color: 'var(--color-dusty-blue-ink)', border: 'var(--color-dusty-blue)' },
  team: { color: 'var(--color-clay-ink)', border: 'var(--color-clay)' },
  lead: { color: 'var(--color-quiet-ink)', border: 'var(--color-pearl)' },
  sub: { color: 'var(--color-mocha)', border: 'var(--color-mocha)' },
  installer: { color: 'var(--color-mocha)', border: 'var(--color-clay)' },
  receiver: { color: 'var(--color-aged-oak)', border: 'var(--color-pearl)' },
  // Call Sheet Wave 3/4 (00419/00420) roster-widening kinds — architect beside
  // the GC's dusty blue; photographer/stager quiet ink, neither trade nor firm.
  architect: {
    color: 'var(--color-dusty-blue-ink)',
    border: 'var(--color-dusty-blue)',
  },
  photographer: { color: 'var(--color-quiet-ink)', border: 'var(--color-quiet-ink)' },
  stager: { color: 'var(--color-quiet-ink)', border: 'var(--color-quiet-ink)' },
  // The studio rolodex branch (people_directory role='contact', 00420) — and
  // since 00626's v4 rebuild, EVERY carded human. Shares the maker tint.
  contact: { color: 'var(--color-aged-oak)', border: '#cbb48f' },
};

// A company's OWN kind vocabulary (studio_contacts.contact_kind on an
// entity_kind='company' row — see company-row.tsx's COMPANY_KIND_LABELS) is
// free TEXT and distinct from PartyRole, but reads the SAME family tints:
// 'gc' shares the person gc PartyRole's dusty-blue; workroom/showroom/vendor/
// supplier all share the maker tint (a vendor firm IS a maker's business).
// Any kind outside this map falls back to the maker tint rather than
// rendering unstyled.
const COMPANY_KIND_BADGE: Record<string, { color: string; border: string }> = {
  gc: BADGE.gc,
  vendor: BADGE.maker,
  workroom: BADGE.maker,
  showroom: BADGE.maker,
  supplier: BADGE.maker,
};

/** Badge tint for a company kind (see COMPANY_KIND_BADGE above) — used by
 *  company-row.tsx's kind pill so a GC firm and a maker/vendor-family firm
 *  read with the same per-role tints a person's RoleBadge already carries. */
export function companyKindBadgeStyle(
  kind: string | null | undefined,
): { color: string; border: string } {
  return (kind ? COMPANY_KIND_BADGE[kind] : undefined) ?? BADGE.maker;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({
  name,
  role,
  shape = 'circle',
  size = 42,
}: {
  name: string;
  /** PartyRole for a people_directory row, OR a studio_contacts contact_kind
   *  (person or company) — loosely typed as string so the rolodex's free-text
   *  kinds resolve through the same tint map without a cast at the call site.
   *  An unrecognized kind falls back to AVATAR_FALLBACK_BG rather than
   *  rendering `undefined` as a background. */
  role: string;
  /** 'square' (8px radius) is the company avatar — slide 9's one difference. */
  shape?: AvatarShape;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center font-mono font-semibold text-white ${
        shape === 'square' ? 'rounded-[8px]' : 'rounded-full'
      }`}
      style={{
        width: size,
        height: size,
        background: AVATAR_BG[role] ?? AVATAR_FALLBACK_BG,
        fontSize: Math.round(size * 0.32),
      }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The role badge, at the 12px `.t-meta` floor (direction §4, house sheet §A3).
 * It shipped at `text-[0.44rem]` — a hair over 7px — which is below every step
 * the type scale has and below what a studio reads at arm's length on a
 * ledger row.
 */
export function RoleBadge({ role }: { role: PartyRole }) {
  const { color, border } = BADGE[role];
  return (
    <span
      data-role-badge={role}
      className="t-meta shrink-0 rounded-[3px] border px-2 py-[2px] font-medium uppercase"
      style={{ color, borderColor: border }}
    >
      {roleLabel(role)}
    </span>
  );
}

/**
 * The consent word a field party's row wears — the studio's own RECORD
 * (`studio_channel_consent`) through `channel_consent_status()`, which already
 * folds an unanswered refusal into `opted_out`.
 *
 * Rebound to `StateWord`'s consent family (direction §4): one primitive, one
 * pigment table, one label map, so the Directory row, the roster row and the
 * party sheet cannot drift apart.
 *
 * A NULL status prints NOTHING. "No record" is its own fact — the readers that
 * feed this chip return NULL when the caller cannot read the record that
 * decides the word — and "Not asked" over a studio's dated `opted_out` is the
 * fail-open word this program exists to remove (R-BB, w1b r8 MAJOR-1). The
 * sentence that names the absence belongs to the card, not to a chip.
 */
export function ConsentChip({
  status,
  plain = false,
}: {
  status: string | null | undefined;
  /** At 390 the row's words print plain and middle-dot separated (R-M). */
  plain?: boolean;
}) {
  return <StateWord family="consent" value={status} plain={plain} />;
}

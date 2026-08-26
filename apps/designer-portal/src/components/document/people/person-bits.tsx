'use client';

/**
 * Shared People-Room primitives: the role-tinted avatar, the role badge, and
 * the status dot. One source of truth so the directory, the profile, the
 * nurture queue, and the threads list all read identically. Zero shadows (D4);
 * colours come from the brand tokens (globals.css).
 */

import type { PartyRole } from '@patina/supabase';
import { SMS_CONSENT_DISPLAY, type SmsConsentStatus } from '@patina/types';
import { roleLabel, type PartyStatus } from '@/lib/document/people-derivation';

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

const BADGE: Record<PartyRole, { color: string; border: string }> = {
  client: { color: '#6f8268', border: 'var(--color-sage)' },
  maker: { color: 'var(--color-aged-oak)', border: '#cbb48f' },
  gc: { color: 'var(--color-dusty-blue)', border: 'var(--color-dusty-blue)' },
  team: { color: 'var(--color-clay-ink)', border: 'var(--color-clay)' },
  lead: { color: 'var(--color-terracotta-ink)', border: 'var(--color-terracotta)' },
  sub: { color: 'var(--color-mocha)', border: 'var(--color-mocha)' },
  installer: { color: '#B89A2E', border: 'var(--color-golden-hour)' },
  receiver: { color: 'var(--color-terracotta-ink)', border: 'var(--color-terracotta)' },
  // Call Sheet Wave 3/4 (00419/00420) roster-widening kinds — same tints as
  // AVATAR_BG above (architect beside the GC's dusty-blue; photographer/
  // stager quiet-ink, neither trade nor firm).
  architect: { color: 'var(--color-dusty-blue)', border: 'var(--color-dusty-blue)' },
  photographer: { color: 'var(--color-quiet-ink)', border: 'var(--color-quiet-ink)' },
  stager: { color: 'var(--color-quiet-ink)', border: 'var(--color-quiet-ink)' },
  // The studio rolodex branch (people_directory role='contact', 00420) —
  // shares the maker tint (a rolodex entry is vendor/maker-adjacent by
  // default, same family AVATAR_FALLBACK_BG/COMPANY_KIND_BADGE lean on).
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

const DOT_BG: Record<PartyStatus, string> = {
  active: 'var(--color-golden-hour)',
  warm: 'var(--color-sage)',
  due: 'var(--color-terracotta)',
  cool: 'var(--color-pearl)',
};

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

export function RoleBadge({ role }: { role: PartyRole }) {
  const { color, border } = BADGE[role];
  return (
    <span
      className="rounded-[3px] border-[1.5px] px-2 py-[2px] font-mono text-[0.44rem] font-semibold uppercase tracking-[0.06em]"
      style={{ color, borderColor: border }}
    >
      {roleLabel(role)}
    </span>
  );
}

/**
 * The SMS-consent chip a field party's row wears (00281 sms_consent_status) —
 * Not asked / Invited / Texting / Opted out, in the field-config vocab.
 * Extracted here from person-row.tsx (Call Sheet Wave 3) so the directory row
 * and the call sheet's roster row can never drift apart.
 *
 * `dotOnly` renders JUST the tinted dot with the label carried as an
 * accessible name — the compact roster row (slide 12) sits the dot beside the
 * name and saves the words for the unfold, where the full chip renders.
 */
export function ConsentChip({
  status,
  dotOnly = false,
}: {
  status: string | null | undefined;
  dotOnly?: boolean;
}) {
  const key = (status ?? 'not_asked') as SmsConsentStatus;
  const cfg = SMS_CONSENT_DISPLAY[key] ?? SMS_CONSENT_DISPLAY.not_asked;

  if (dotOnly) {
    return (
      <span
        role="img"
        aria-label={cfg.label}
        title={cfg.label}
        data-consent-dot={key}
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dotClass}`}
      />
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[0.5rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
      <span
        aria-hidden
        data-consent-dot={key}
        className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dotClass}`}
      />
      {cfg.label}
    </span>
  );
}

export function StatusDot({ status }: { status: PartyStatus }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: DOT_BG[status] }}
    />
  );
}

'use client';

/**
 * A company row in the studio rolodex (Call Sheet Wave 2, slides 8–9: "The
 * Rolodex" / "Circles + squares"). The person-row `.prow` grammar, wearing the
 * ONE visual difference a company gets — a rounded SQUARE avatar (8px radius)
 * instead of a circle — plus:
 *   · a bordered KIND pill naming what kind of firm this is (a company's OWN
 *     vocabulary — see COMPANY_KIND_LABELS below — not a person's PartyKind),
 *   · a relationship line that counts people and jobs, not a trade,
 *   · NO consent dot (a firm cannot consent to a text message — slide 9),
 *   · an OPTIONAL status dot (no real "how is this firm doing" signal exists
 *     yet, so callers omit it by default rather than fake one),
 *   · the same hover lift (-2px, clay border) as a person row.
 *
 * `companyPeopleCount` / `projectsCount` / `lastProjectName` are accepted as
 * props rather than derived here — the data plumbing (who works at this
 * company, which projects) is partial this wave (00417/00418 land the table
 * and the fold; the join queries are a later wave's work), so this row must
 * render gracefully with any subset of them present or absent.
 */

import { Avatar, StatusDot } from '../person-bits';
import type { PartyStatus } from '@/lib/document/people-derivation';

/**
 * A company's OWN kind vocabulary (studio_contacts.contact_kind on an
 * entity_kind='company' row) — deliberately DISTINCT from a person's PartyKind
 * (gc/sub/installer/…): a company card names what KIND OF FIRM it is, not a
 * role on a project. Free TEXT (00417, no CHECK) — an unrecognized value falls
 * back to a prettified raw string via companyKindLabel, never rendering raw
 * snake_case.
 */
const COMPANY_KIND_LABELS: Record<string, string> = {
  gc: 'GC firm',
  workroom: 'Workroom',
  showroom: 'Showroom',
  vendor: 'Vendor',
  supplier: 'Supplier',
};

/** Display label for a company kind; falls back to a prettified raw value —
 *  the same posture as @patina/types' getFieldTradeLabel / getPartyKindLabel. */
export function companyKindLabel(kind: string | null | undefined): string {
  if (!kind) return 'Company';
  return (
    COMPANY_KIND_LABELS[kind] ??
    kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export interface CompanyRowProps {
  name: string;
  /** studio_contacts.contact_kind — free text, labeled via companyKindLabel. */
  kind: string;
  /** People at this company. Undefined/0 omits the count rather than
   *  claiming "0 people" for a card the plumbing hasn't wired yet. */
  companyPeopleCount?: number | null;
  projectsCount?: number | null;
  lastProjectName?: string | null;
  /** No real signal exists yet (see module doc) — omitted unless a caller
   *  has one. */
  statusDot?: PartyStatus;
  onOpen?: () => void;
}

export function CompanyRow({
  name,
  kind,
  companyPeopleCount,
  projectsCount,
  lastProjectName,
  statusDot,
  onOpen,
}: CompanyRowProps) {
  const bits: string[] = [];
  if (companyPeopleCount != null && companyPeopleCount > 0) {
    bits.push(`${companyPeopleCount} ${companyPeopleCount === 1 ? 'person' : 'people'}`);
  }
  if (projectsCount != null && projectsCount > 0) {
    bits.push(`${projectsCount} ${projectsCount === 1 ? 'project' : 'projects'}`);
  }
  if (lastProjectName) bits.push(`last: ${lastProjectName}`);
  const line = bits.length > 0 ? bits.join(' · ') : 'Not yet on a project';

  const body = (
    <>
      <Avatar name={name} role={kind} shape="square" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2.5">
          <span className="truncate text-[0.92rem] font-semibold text-[var(--color-charcoal)]">
            {name}
          </span>
          <span className="rounded-[3px] border-[1.5px] border-[var(--color-aged-oak)] px-2 py-[2px] font-mono text-[0.44rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            {companyKindLabel(kind)}
          </span>
        </span>
        <span className="mt-[0.15rem] block truncate text-[0.7rem] text-[var(--color-aged-oak)]">
          {line}
        </span>
      </span>
      {/* NO consent dot — a firm cannot consent to a text message (slide 9). */}
      {statusDot && <StatusDot status={statusDot} />}
      <span aria-hidden className="shrink-0 text-[0.8rem] text-[var(--color-aged-oak)]">
        ›
      </span>
    </>
  );

  const shared =
    'flex w-full items-center gap-3.5 rounded-[10px] border border-[var(--color-pearl)] bg-white px-3.5 py-3 text-left';

  if (!onOpen) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${shared} transition-[border-color,background-color,transform] duration-300 hover:-translate-y-[2px] hover:border-[var(--color-clay)]`}
    >
      {body}
    </button>
  );
}

'use client';

/**
 * Profile side cards (R51 / Track B) — the right column of the person profile:
 * Projects/Engagements (deep-linking to each document), Trust & history /
 * Track record, the Nurture card (terracotta-edged when due), and the Private
 * note. Flat paper, one-pixel pearl edge, zero shadows (D4) — depth comes from
 * value contrast and the stacked-mark glyph, never a drop-shadow.
 *
 * The cards are dumb: the profile feeds them already-derived rows + handlers.
 */

import type { ReactNode } from 'react';

/** The quiet stacked-paper mark beside a project row (prototype `.proj-mark`). */
function ProjMark() {
  return (
    <span aria-hidden className="flex w-3 shrink-0 flex-col items-start gap-[1.5px]">
      <i className="block h-[2px] w-3 rounded-[1px] bg-[var(--color-clay)]" />
      <i className="block h-[2px] w-2 rounded-[1px] bg-[var(--color-clay)] opacity-50" />
    </span>
  );
}

export function Card({
  title,
  action,
  edge,
  children,
}: {
  title: string;
  action?: ReactNode;
  /** Optional left accent (the Nurture card uses sage / terracotta). */
  edge?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="mb-[0.8rem] rounded-[9px] border border-[var(--color-pearl)] bg-white p-[0.9rem]"
      style={edge ? { borderLeft: `3px solid ${edge}` } : undefined}
    >
      <header className="mb-2 flex items-center justify-between font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        <span>{title}</span>
        {action}
      </header>
      {children}
    </section>
  );
}

export interface ProfileProjectRow {
  id: string;
  name: string;
  state: string;
}

/** Projects (clients) / Engagements (makers, GCs, team) — each opens its doc. */
export function ProjectsCard({
  title,
  projects,
  onOpenProject,
  emptyLine,
}: {
  title: string;
  projects: ProfileProjectRow[];
  onOpenProject: (id: string) => void;
  emptyLine: string;
}) {
  return (
    <Card title={title}>
      {projects.length === 0 ? (
        <p className="text-[0.7rem] leading-relaxed text-[var(--color-aged-oak)]">{emptyLine}</p>
      ) : (
        <ul>
          {projects.map((pr) => (
            <li key={pr.id} className="border-b border-[var(--doc-ink-border)]/40 last:border-b-0">
              <button
                type="button"
                onClick={() => onOpenProject(pr.id)}
                className="flex w-full items-center gap-2.5 py-[0.4rem] text-left"
              >
                <ProjMark />
                <span className="flex-1 truncate text-[0.74rem] font-medium text-[var(--color-charcoal)]">
                  {pr.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] uppercase text-[var(--color-aged-oak)]">
                  {pr.state}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Trust & history (clients) / Track record (network) — a checked list. */
export function TrustCard({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card title={title}>
      <ul>
        {items.map((t, i) => (
          <li
            key={`${i}:${t}`}
            className="flex items-center gap-2 py-[0.25rem] text-[0.7rem] text-[var(--color-mocha)]"
          >
            <span aria-hidden className="font-bold text-[var(--color-sage)]">
              ✓
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The Nurture card — terracotta-edged + terracotta copy when reconnect is due. */
export function NurtureCard({
  text,
  due,
  onReachOut,
}: {
  text: string;
  due: boolean;
  onReachOut: () => void;
}) {
  return (
    <Card title="Nurture" edge={due ? 'var(--color-terracotta)' : 'var(--color-sage)'}>
      <p
        className="text-[0.74rem] leading-relaxed"
        style={{ color: due ? 'var(--color-terracotta-ink)' : 'var(--color-mocha)' }}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={onReachOut}
        className="mt-[0.6rem] rounded-[6px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-[0.7rem] py-[0.4rem] font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-white transition-colors hover:bg-[var(--color-aged-oak)]"
      >
        Reach out
      </button>
    </Card>
  );
}

/** The Private note — the designer's quiet, human margin note on a person. */
export function NoteCard({ note }: { note: string | null }) {
  return (
    <Card title="Private note">
      {note?.trim() ? (
        <p className="text-[0.72rem] italic leading-relaxed text-[var(--color-mocha)]">{note}</p>
      ) : (
        <p className="text-[0.7rem] leading-relaxed text-[var(--color-aged-oak)]">
          No note yet — the quiet things you want to remember about them live here.
        </p>
      )}
    </Card>
  );
}

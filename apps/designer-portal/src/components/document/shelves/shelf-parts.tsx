'use client';

/** The leaf's printed furniture — one register for every shelf, so five
 *  different sources still read as one shelf of one book. */

import type { ReactNode } from 'react';

export function ShelfSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-5 border-t border-[var(--color-pearl)] pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
        {label}
      </p>
      {children}
    </section>
  );
}

export function ShelfGroup({
  name,
  lifted = false,
  children,
}: {
  name: string;
  lifted?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        lifted ? 'doc-room-lifted -mx-1.5 mb-1 px-1.5 pb-1.5' : 'mb-1 pb-1.5'
      }
    >
      <p className="px-0 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        {name}
      </p>
      {children}
    </div>
  );
}

export function ShelfRow({
  name,
  meta,
  value,
  sub,
  lifted = false,
}: {
  name: string;
  meta?: string;
  value?: string;
  sub?: string;
  lifted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-1.5 ${
        lifted
          ? 'doc-room-lifted -mx-1.5 px-1.5'
          : 'border-b border-[rgba(44,41,38,0.10)]'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[13px] leading-snug text-[var(--color-charcoal)]">
          {name}
        </span>
        {meta && (
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
            {meta}
          </span>
        )}
      </span>
      {(value || sub) && (
        <span className="whitespace-nowrap text-right font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
          {value}
          {value && sub && <br />}
          {sub}
        </span>
      )}
    </div>
  );
}

/**
 * What the room lens found on THIS shelf. Only a shelf that CAN lift reports —
 * a shelf with no room dimension at all (the plan room) makes no
 * claim either way, because "nothing here" would read as an answer.
 */
export function ShelfLifted({
  roomName,
  found,
}: {
  roomName: string | null;
  found: number;
}) {
  if (!roomName) return null;
  return (
    <p className="doc-room-lifted -mx-4 mb-4 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.09em] text-[var(--color-charcoal)]">
      {found > 0
        ? `Lifted · ${roomName}`
        : `In hand · ${roomName} — nothing filed here yet`}
    </p>
  );
}

export function ShelfNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-[var(--color-aged-oak)]">
      {children}
    </p>
  );
}

export function ShelfDoor({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 border-t border-[var(--color-pearl)] pt-3 font-mono text-[10px] uppercase tracking-[0.09em] text-[var(--color-clay-ink)] [&_a]:min-h-11 [&_a]:content-center [&_a:hover]:text-[var(--color-charcoal)] [&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-[var(--color-clay)]">
      {children}
    </div>
  );
}

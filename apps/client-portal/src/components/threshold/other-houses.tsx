'use client';

import Link from 'next/link';

import { COLUMN_HEAD_CLASS, LINE_CLASS } from './mat';

/* ── Your other houses ──────────────────────────────────────────────────────
   The doorplate already names the house you are standing in. A client who
   keeps two studios' worth of work needs the other doors named too, and the
   mat — the place by the door where you find the way out — is where they
   belong: read as lines, never as acts.

   A client with one house is told nothing. There is no other house to name,
   and a heading over an empty column would be a sentence about absence.
   ────────────────────────────────────────────────────────────────────────── */

export interface OtherHouse {
  id: string;
  name: string;
  location?: string;
}

export function OtherHouses({ houses }: { houses: OtherHouse[] }) {
  if (houses.length === 0) return null;

  return (
    <div data-testid="mat-other-houses">
      <h2 className={COLUMN_HEAD_CLASS}>Your other houses</h2>
      {houses.map((house) => (
        <Link key={house.id} href={`/projects/${house.id}`} className={LINE_CLASS}>
          {house.name}
          {house.location && (
            <span className="block font-mono text-[11px] leading-[1.5] tracking-[0.04em] text-[var(--text-muted)]">
              {house.location}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

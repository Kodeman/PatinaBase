'use client';

import Link from 'next/link';

import { waitingSentence, type OtherHouse } from '@/lib/threshold/other-houses';

import { COLUMN_HEAD_CLASS, LINE_CLASS, SUBLINE_CLASS } from './mat-classes';

/* ── Your other houses ──────────────────────────────────────────────────────
   The doorplate already names the house you are standing in. A client who
   keeps two studios' worth of work needs the other doors named too, and the
   mat — the place by the door where you find the way out — is where they
   belong: read as lines, never as acts.

   A client with one house is told nothing at all. There is no other house to
   name, and a heading over an empty column would be a sentence about absence.
   ────────────────────────────────────────────────────────────────────────── */

export type { OtherHouse };

function accessibleName(house: OtherHouse, waiting: string | null): string {
  const named = house.location ? `${house.name} · ${house.location}` : house.name;
  return waiting ? `${named}. ${waiting}` : named;
}

export function OtherHouses({ houses }: { houses: OtherHouse[] }) {
  if (houses.length === 0) return null;

  return (
    <div data-testid="mat-other-houses">
      <h2 className={COLUMN_HEAD_CLASS}>Your other houses</h2>
      {houses.map((house) => {
        const waiting = waitingSentence(house);
        return (
          <Link
            key={house.id}
            href={`/projects/${house.id}`}
            className={LINE_CLASS}
            aria-label={accessibleName(house, waiting)}
          >
            {house.name}
            {house.location && <span className={SUBLINE_CLASS}>{house.location}</span>}
            {waiting && <span className={SUBLINE_CLASS}>{waiting}</span>}
          </Link>
        );
      })}
    </div>
  );
}

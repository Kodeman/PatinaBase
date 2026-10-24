'use client';

/**
 * The round-8 studio masthead (WP-01.8): the studio's name, its five doors,
 * a find line and the account. Every door is a registry entry, opened the way
 * the Desk's contents and ⌘K already open it: rooms walk in through the Studio
 * Drawer's `document:open-ledger` path, ledgers slide over, the inbox opens
 * the Post sheet. The masthead only prints its own shorter word for each.
 */

import { useState, type FormEvent } from 'react';
import { STUDIO_LEDGERS, STUDIO_ROOMS, type StudioSurface } from '@/lib/document/registry';
import { openCommandBar, openLedger } from '@/components/document/command-bar';
import { openPost } from '@/components/document/overlays/post-sheet';
import { openAccount } from '@/components/document/account/account-sheet';

/** The masthead's doors, by registry key, in the reference's order. */
const MASTHEAD_DOORS: ReadonlyArray<{ key: string; word: string }> = [
  { key: 'library', word: 'Library' },
  { key: 'people', word: 'People' },
  { key: 'rooms', word: 'Measured rooms' },
  { key: 'accounts', word: 'Studio books' },
  { key: 'the-post', word: 'Correspondence' },
];

const SURFACES: readonly StudioSurface[] = [...STUDIO_ROOMS, ...STUDIO_LEDGERS];

/** A door whose registry entry is gone, or no longer global, is not printed. */
export const STUDIO_DOORS = MASTHEAD_DOORS.flatMap((door) => {
  const surface = SURFACES.find((entry) => entry.key === door.key && entry.scope === 'global');
  return surface ? [{ ...door, surface }] : [];
});

function openDoor(key: string): void {
  if (key === 'the-post') openPost();
  else openLedger(key);
}

function initialsOf(name: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join('') : '·';
}

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

export function StudioMasthead({
  studioName,
  viewerName,
  dateLabel,
}: {
  studioName: string | null;
  viewerName: string | null;
  dateLabel: string;
}) {
  const [query, setQuery] = useState('');
  const find = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openCommandBar(query.trim() || undefined);
  };
  const firstName = viewerName?.trim().split(/\s+/)[0] ?? null;

  return (
    <header data-studio-masthead className="border-b border-[var(--hairline-strong)]">
      <div className="mx-auto flex w-full max-w-[var(--r8-studio-measure)] flex-wrap items-center gap-x-7 gap-y-2 px-[4%] py-5 max-[599px]:gap-x-4 max-[599px]:px-4 max-[599px]:py-4">
        <p className="font-heading text-[30px] leading-none max-[599px]:text-[27px]">Patina</p>
        {studioName && (
          <p className="r8-small border-l border-[var(--hairline-strong)] pl-6 max-[1179px]:mr-auto max-[599px]:pl-4">
            {studioName}
            {firstName && (
              <span className="block text-[var(--ink-faint)]">{`${firstName}’s workspace`}</span>
            )}
          </p>
        )}
        <nav
          aria-label="Studio"
          className="ml-auto max-[1179px]:order-3 max-[1179px]:ml-0 max-[1179px]:w-full max-[1179px]:border-t max-[1179px]:border-[var(--hairline-strong)] max-[1179px]:pt-1"
        >
          <ul className="flex items-center gap-x-6 max-[599px]:gap-x-4 max-[1179px]:overflow-x-auto max-[1179px]:whitespace-nowrap">
            {STUDIO_DOORS.map((door) => (
              <li key={door.key}>
                <button
                  type="button"
                  data-studio-door={door.key}
                  onClick={() => openDoor(door.key)}
                  className={`t-body-sm inline-flex min-h-11 items-center border-b-2 border-transparent text-[var(--ink)] transition-colors hover:border-[var(--hairline-strong)] motion-reduce:transition-none ${FOCUS}`}
                >
                  {door.word}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          onClick={() => openAccount()}
          aria-label={viewerName ? `Your account — ${viewerName}` : 'Your account'}
          className={`r8-small grid size-11 flex-none place-items-center rounded-full bg-[var(--color-green-record)] text-[var(--ink)] ${FOCUS}`}
        >
          <span aria-hidden="true">{initialsOf(viewerName)}</span>
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-[var(--r8-studio-measure)] items-center justify-between gap-5 px-[4%] pb-4 max-[599px]:px-4">
        <span className="r8-small text-[var(--ink-faint)]">{dateLabel}</span>
        <form
          role="search"
          onSubmit={find}
          data-tour-anchor="desk-find-anything"
          className="flex items-center gap-2 border-b border-[var(--hairline-strong)]"
        >
          <label className="sr-only" htmlFor="studio-find">
            Find a job, person, product or record
          </label>
          <input
            id="studio-find"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find in the studio"
            autoComplete="off"
            className={`t-body-sm min-h-11 w-[200px] min-w-0 bg-transparent placeholder:text-[var(--ink-faint)] max-[599px]:w-[140px] ${FOCUS}`}
          />
          <button
            type="submit"
            className={`t-body-sm min-h-11 underline decoration-1 underline-offset-4 ${FOCUS}`}
          >
            Find
          </button>
        </form>
      </div>
    </header>
  );
}

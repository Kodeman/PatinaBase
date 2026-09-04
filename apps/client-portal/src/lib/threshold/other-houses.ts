import type { ProjectListItem } from '@/types/project';

/* ── The other houses, and what waits in them ───────────────────────────────
   Pure, and deliberately not inside the `'use client'` component that renders
   them: both server pages call `toOtherHouses`, and a non-component export of
   a client module is a client reference on the server, not a function.

   The retired `/projects` list carried a count per project, and the retired
   header switcher carried the same. The count is not what the client needed;
   what she needed is to know, from the house she is standing in, that the
   other one is waiting on her. So the count becomes a sentence — prose, not a
   badge (VISION §6) — and a house with nothing waiting says nothing.
   ────────────────────────────────────────────────────────────────────────── */

export interface OtherHouse {
  id: string;
  name: string;
  location?: string;
  /** Approvals this client still owes the studio on that house. */
  approvalsPending?: number;
  /** Studio messages she has not read there. */
  unreadMessages?: number;
}

/**
 * Every house except the one being stood in. The exclusion is here, once, so
 * neither page can put a house inside its own mat.
 */
export function toOtherHouses(
  projects: ProjectListItem[],
  currentProjectId: string,
): OtherHouse[] {
  return projects
    .filter((house) => house.id !== currentProjectId)
    .map((house) => ({
      id: house.id,
      name: house.name,
      location: house.location,
      approvalsPending: house.approvalsPending,
      unreadMessages: house.unreadMessages,
    }));
}

/**
 * What is waiting at another house, in the house's own nouns — a paper is
 * something to sign or approve, a note is something the studio wrote. Null
 * when nothing is waiting: silence is the answer, never "Nothing waiting".
 */
export function waitingSentence(house: OtherHouse): string | null {
  const papers = Math.max(0, Math.trunc(house.approvalsPending ?? 0));
  const notes = Math.max(0, Math.trunc(house.unreadMessages ?? 0));

  const parts: string[] = [];
  if (papers > 0) parts.push(papers === 1 ? 'a paper' : 'papers');
  if (notes > 0) parts.push(notes === 1 ? 'a note' : 'notes');
  if (parts.length === 0) return null;

  const subject = parts.join(' and ');
  const verb = parts.length === 1 && subject.startsWith('a ') ? 'is' : 'are';
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${verb} waiting there.`;
}

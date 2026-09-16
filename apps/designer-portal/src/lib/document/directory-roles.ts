/**
 * The People Room's `?role=` deep-link vocabulary (R21 dissolve —
 * `/portal/clients` and `/portal/vendors` redirect to `?role=client` /
 * `?role=maker` with no person). Pure and dependency-free (no @patina/supabase,
 * no React) so it's importable — and pinnable in a spec — without pulling in
 * the whole People Room component tree.
 *
 * TWO vocabularies live here, and they are not the same list.
 *
 *  · `DIRECTORY_ROLES` — the ELEVEN legacy `?role=` values. FROZEN, in order,
 *    through `company`. Every link ever printed, bookmarked or mailed carries
 *    one of these, so the list never shrinks and never reorders.
 *
 *  · `DIRECTORY_CHIPS` — the SIX chips the redesigned Directory actually shows
 *    (direction §1 line 2, §3.1): Everyone · Clients · Crew · Makers · Studio ·
 *    Firms. Eleven values collapse to six, and `LEGACY_ROLE_TO_CHIP` is the
 *    forward map that keeps an old link landing somewhere true.
 */

import type { DirectoryRole } from '../../components/document/people/views/directory-view';

const LEGACY_DIRECTORY_ROLES = [
  'all',
  'field',
  'client',
  'lead',
  'maker',
  'team',
  'gc',
  'sub',
  'installer',
  'receiver',
  'company',
] as const;

/** One of the eleven values a shipped `?role=` link may carry. Narrower than
 *  `DirectoryRole`, which also spans the four PartyRole values that were never
 *  addressable (`architect`, `photographer`, `stager`, `contact`). */
export type LegacyDirectoryRole = (typeof LEGACY_DIRECTORY_ROLES)[number];

export const DIRECTORY_ROLES: readonly DirectoryRole[] = LEGACY_DIRECTORY_ROLES;

/** The six chips the Directory prints, in the order they print (SPEC §5.1 #2). */
export type DirectoryChip =
  | 'everyone'
  | 'clients'
  | 'crew'
  | 'makers'
  | 'studio'
  | 'firms';

export const DIRECTORY_CHIPS: readonly DirectoryChip[] = [
  'everyone',
  'clients',
  'crew',
  'makers',
  'studio',
  'firms',
] as const;

export const DIRECTORY_CHIP_LABELS: Record<DirectoryChip, string> = {
  everyone: 'Everyone',
  clients: 'Clients',
  crew: 'Crew',
  makers: 'Makers',
  studio: 'Studio',
  firms: 'Firms',
};

/** The chip the Directory opens on when the address names none. */
export const DEFAULT_DIRECTORY_CHIP: DirectoryChip = 'everyone';

/**
 * The legacy eleven, forward. Every old `?role=` value lands on the chip that
 * still answers the question it was asking:
 *  · the four field kinds and the `field` umbrella are one band now, Crew;
 *  · a lead is a client the studio has not signed yet, so it lands on Clients;
 *  · `team` is the studio's own people;
 *  · `company` is the rolodex's firms, which PR-g also mixes into Everyone.
 */
export const LEGACY_ROLE_TO_CHIP: Record<LegacyDirectoryRole, DirectoryChip> = {
  all: 'everyone',
  field: 'crew',
  client: 'clients',
  lead: 'clients',
  maker: 'makers',
  team: 'studio',
  gc: 'crew',
  sub: 'crew',
  installer: 'crew',
  receiver: 'crew',
  company: 'firms',
};

export function isDirectoryChip(value: string | null | undefined): value is DirectoryChip {
  return !!value && (DIRECTORY_CHIPS as readonly string[]).includes(value);
}

export function isLegacyDirectoryRole(
  value: string | null | undefined,
): value is LegacyDirectoryRole {
  return !!value && (LEGACY_DIRECTORY_ROLES as readonly string[]).includes(value);
}

/**
 * Resolve whatever the address carries to a chip. A chip name wins, a legacy
 * role forwards, anything else opens on Everyone — an unreadable `?role=` is
 * never an empty room.
 */
export function directoryChipFromParam(
  raw: string | null | undefined,
): DirectoryChip {
  if (isDirectoryChip(raw)) return raw;
  if (isLegacyDirectoryRole(raw)) return LEGACY_ROLE_TO_CHIP[raw];
  return DEFAULT_DIRECTORY_CHIP;
}

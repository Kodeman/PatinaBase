/**
 * The People Room's `?role=` deep-link param map (R21 dissolve —
 * `/portal/clients` and `/portal/vendors` redirect to `?role=client` /
 * `?role=maker` with no person). Pure and dependency-free (no @patina/supabase,
 * no React) so it's importable — and pinnable in a spec — without pulling in
 * the whole People Room component tree.
 *
 * FROZEN through `receiver`: Call Sheet Wave 2 adds `company` additively at
 * the end. DirectoryView ignores the `company` role when the `call-sheet`
 * flag is off, so an old link never regresses.
 */

import type { DirectoryRole } from '../../components/document/people/views/directory-view';

export const DIRECTORY_ROLES: readonly DirectoryRole[] = [
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
];

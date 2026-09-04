'use client';

import { usePathname } from 'next/navigation';

import type { ProjectListItem } from '../../types/project';

// Routes a visitor reaches with no session at all: auth, the token/guest
// views, the quiz funnel, the demos and the role-mismatch interstitials.
//
// '/piece' is the shared-piece page (SP-03): a stranger opens it from a text
// message with no session, and must not be handed anything that assumes one.
const PUBLIC_PREFIXES = [
  '/auth',
  '/piece',
  '/share',
  '/field',
  '/rfq',
  '/plans',
  '/quiz',
  '/demo',
  '/wrong-portal',
  '/unauthorized',
];

interface AppChromeProps {
  /**
   * Still handed down by the root layout. Nothing above the page reads it now
   * that the header is gone; the layout's fetch retires with the rest of the
   * old tree.
   */
  projects?: ProjectListItem[];
  children: React.ReactNode;
}

/**
 * The shell around every page. It carries no header, no drawer and no project
 * switcher: the client portal's one authenticated surface is the house, which
 * carries its own doorplate, its own details, its own way out and — for a
 * client with more than one — her other houses. Every destination the old
 * header offered is a retired route that 308s back to `/`.
 *
 * The public/authenticated split stays because it is this portal's record of
 * which routes are reachable with no session; `display: contents` means the
 * marker costs the page no box of its own.
 */
export function AppChrome({ children }: AppChromeProps) {
  const pathname = usePathname() ?? '/';
  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return (
    <div className="contents" data-portal-shell={isPublic ? 'public' : 'authenticated'}>
      {children}
    </div>
  );
}

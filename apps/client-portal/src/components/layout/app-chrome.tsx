'use client';

import { usePathname } from 'next/navigation';

import { ClientHeader } from './client-header';
import type { ProjectListItem } from '../../types/project';

// Routes that must NOT get the app chrome (auth, public token views, quiz,
// demo, and the role-mismatch interstitials). Everything else is an
// authenticated app page and gets the global header + mobile drawer.
const PUBLIC_PREFIXES = [
  '/auth',
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
  projects: ProjectListItem[];
  children: React.ReactNode;
}

/**
 * AppChrome renders the client-portal header (and, below md, its drawer) once,
 * around every authenticated page — replacing the old per-page `<ClientHeader>`
 * so no route can render header-less and strand the homeowner. Project data is
 * fetched once in the root layout and threaded through here; the active project
 * and header counts are derived from it + the current path.
 */
export function AppChrome({ projects, children }: AppChromeProps) {
  const pathname = usePathname() ?? '/';
  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isPublic) {
    return <>{children}</>;
  }

  const activeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const approvalsPending = projects.reduce((total, p) => total + (p.approvalsPending ?? 0), 0);
  const unreadMessages = projects.reduce((total, p) => total + (p.unreadMessages ?? 0), 0);

  return (
    <>
      <ClientHeader
        projects={projects}
        activeProjectId={activeProjectId}
        approvalsPending={approvalsPending}
        unreadMessages={unreadMessages}
      />
      {children}
    </>
  );
}

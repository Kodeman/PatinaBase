'use client';

import { usePathname } from 'next/navigation';
import { useMyProjectApprovalReviews } from '@patina/supabase';

import { ClientHeader } from './client-header';
import type { ProjectListItem } from '../../types/project';
import { isClientActionableProjectApproval } from '../../lib/client-attention';

// Routes that must NOT get the app chrome (auth, public token views, quiz,
// demo, and the role-mismatch interstitials). Everything else is an
// authenticated app page and gets the global header + mobile drawer.
//
// '/piece' is the shared-piece page (SP-03): a stranger opens it from a text
// message with no session at all, and must not be handed a Client Portal
// header, a project switcher and links to Projects and Invoices they cannot
// open.
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

  return (
    <AuthenticatedAppChrome projects={projects} pathname={pathname}>
      {children}
    </AuthenticatedAppChrome>
  );
}

function AuthenticatedAppChrome({
  projects,
  pathname,
  children,
}: AppChromeProps & { pathname: string }) {
  const { data: projectApprovals } = useMyProjectApprovalReviews();

  const activeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const nonStage2ApprovalsPending = projects.reduce(
    (total, project) => total + project.nonStage2ApprovalsPending,
    0,
  );
  const stage2ApprovalsPending = (projectApprovals ?? []).filter(
    isClientActionableProjectApproval,
  ).length;
  const approvalsPending =
    nonStage2ApprovalsPending + stage2ApprovalsPending;
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

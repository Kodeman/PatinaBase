'use client';

import Link from 'next/link';
import { Bell, MessageSquare } from 'lucide-react';

import type { ProjectListItem } from '../../types/project';
import { formatRelativeTime } from '../../lib/utils/format';
import { ProjectSwitcher } from './project-switcher';

interface ClientHeaderProps {
  projects: ProjectListItem[];
  activeProjectId?: string;
  approvalsPending?: number;
  unreadMessages?: number;
  lastUpdated?: string;
}

export function ClientHeader({
  projects,
  activeProjectId,
  approvalsPending = 0,
  unreadMessages = 0,
  lastUpdated,
}: ClientHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-default)] bg-[var(--bg-primary)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--bg-primary)]/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/projects" className="font-heading text-lg tracking-wide text-[var(--text-primary)] transition-opacity hover:opacity-70">
            Patina
          </Link>
          <ProjectSwitcher projects={projects} activeProjectId={activeProjectId} />
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden />
            <span className="font-heading text-lg font-bold text-[var(--text-primary)]">{approvalsPending}</span>
            <span className="type-meta hidden sm:inline">approvals</span>
          </div>
          <Link
            href="/messages"
            className="flex items-center gap-2 transition-opacity hover:opacity-70"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden />
            <span className="font-heading text-lg font-bold text-[var(--text-primary)]">{unreadMessages}</span>
            <span className="type-meta hidden sm:inline">messages</span>
          </Link>
          {lastUpdated ? (
            <span className="type-meta">
              Updated {formatRelativeTime(lastUpdated) ?? 'recently'}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

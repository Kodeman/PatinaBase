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
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-canvas)]/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/projects" className="rounded-full bg-[var(--color-card)] px-4 py-2 font-[var(--font-playfair)] text-lg font-semibold tracking-wide text-[var(--color-text)] shadow-sm">
            Patina
          </Link>
          <ProjectSwitcher projects={projects} activeProjectId={activeProjectId} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-[var(--color-muted)]">
          <div className="flex items-center gap-2 rounded-full bg-[var(--color-card)] px-3 py-1.5 shadow-sm">
            <Bell className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
            <span className="font-medium text-[var(--color-text)]">{approvalsPending}</span>
            <span className="hidden sm:inline">approvals awaiting you</span>
          </div>
          <Link
            href="/messages"
            className="flex items-center gap-2 rounded-full bg-[var(--color-card)] px-3 py-1.5 shadow-sm hover:bg-[var(--color-accent)]/10 transition-colors"
          >
            <MessageSquare className="h-4 w-4 text-[var(--color-info)]" aria-hidden />
            <span className="font-medium text-[var(--color-text)]">{unreadMessages}</span>
            <span className="hidden sm:inline">unread messages</span>
          </Link>
          {lastUpdated ? (
            <span className="rounded-full border border-[var(--color-border)] px-3 py-1.5">
              Updated {formatRelativeTime(lastUpdated) ?? 'recently'}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

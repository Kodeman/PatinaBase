'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, Search } from 'lucide-react';

import type { ProjectListItem } from '../../types/project';

interface ProjectSwitcherProps {
  projects: ProjectListItem[];
  activeProjectId?: string;
}

const findProjectName = (projects: ProjectListItem[], id?: string) => {
  if (!id) return undefined;
  return projects.find((project) => project.id === id)?.name;
};

export function ProjectSwitcher({ projects, activeProjectId }: ProjectSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const activeName = findProjectName(projects, activeProjectId);

  const filtered = projects.filter((project) =>
    project.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const handleSelect = (projectId: string) => {
    setIsOpen(false);
    if (pathname !== `/projects/${projectId}`) {
      router.push(`/projects/${projectId}`);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-[3px] border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-primary)] focus-visible:focus-ring"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate max-w-[12rem] text-left">
          {activeName ?? 'Select a project'}
        </span>
        <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-20 w-72 rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
          <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-2.5">
            <Search className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
          <ul
            role="listbox"
            className="max-h-64 overflow-y-auto py-1 text-sm"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[var(--text-muted)]">No projects found</li>
            ) : (
              filtered.map((project) => {
                const isActive = project.id === activeProjectId;
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleSelect(project.id)}
                      className={`flex w-full items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5 text-left transition hover:bg-[rgba(196,165,123,0.06)] ${
                        isActive ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-body)]'
                      }`}
                    >
                      <span className="flex flex-col">
                        <span>{project.name}</span>
                        {project.location ? (
                          <span className="type-meta-small">{project.location}</span>
                        ) : null}
                      </span>
                      {isActive ? <Check className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

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
        className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] shadow-sm transition hover:border-[var(--color-accent)] focus-visible:focus-ring"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate max-w-[12rem] text-left">
          {activeName ?? 'Select a project'}
        </span>
        <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-20 w-72 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-lg">
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm text-[var(--color-muted)] shadow-inner">
            <Search className="h-4 w-4" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              className="w-full bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
            />
          </div>
          <ul
            role="listbox"
            className="mt-3 max-h-64 overflow-y-auto rounded-xl bg-white p-1 text-sm shadow-inner"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[var(--color-muted)]">No projects found</li>
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
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-[var(--color-canvas)] ${
                        isActive ? 'bg-[var(--color-canvas)] font-semibold text-[var(--color-text)]' : 'text-[var(--color-muted)]'
                      }`}
                    >
                      <span className="flex flex-col">
                        <span>{project.name}</span>
                        {project.location ? (
                          <span className="text-xs text-[var(--color-muted)]">{project.location}</span>
                        ) : null}
                      </span>
                      {isActive ? <Check className="h-4 w-4 text-[var(--color-accent)]" aria-hidden /> : null}
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

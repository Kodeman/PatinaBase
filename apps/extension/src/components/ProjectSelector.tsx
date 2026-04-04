/**
 * Project selector dropdown for capture modal
 */

import { useState, useEffect } from 'react';
import type { Project, UUID } from '@patina/shared';
import { StrataMark } from './StrataMark';

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: UUID | null;
  isPersonalCatalog: boolean;
  onSelectProject: (projectId: UUID | null) => void;
  onTogglePersonalCatalog: (value: boolean) => void;
  isLoading?: boolean;
}

export function ProjectSelector({
  projects,
  selectedProjectId,
  isPersonalCatalog,
  onSelectProject,
  onTogglePersonalCatalog,
  isLoading = false,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeProjects = projects.filter(p => p.status === 'active');
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleSelectProject = (projectId: UUID) => {
    onSelectProject(projectId);
    onTogglePersonalCatalog(false);
    setIsOpen(false);
  };

  const handleTogglePersonal = () => {
    onTogglePersonalCatalog(!isPersonalCatalog);
    if (!isPersonalCatalog) {
      onSelectProject(null);
    }
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-project-selector]')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="space-y-2" data-project-selector>
      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="w-full px-3 py-2 text-left bg-surface border border-pearl rounded-[3px]
                   hover:border-clay focus:border-clay focus:ring-1 focus:ring-clay
                   transition-colors flex items-center justify-between"
        >
          <span className={selectedProject ? 'text-charcoal text-[0.88rem]' : 'text-aged-oak text-[0.85rem]'}>
            {isLoading ? 'Loading projects...' : selectedProject?.name || 'Select project...'}
          </span>
          <svg
            className={`w-4 h-4 text-aged-oak transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {isOpen && !isLoading && (
          <div className="absolute z-10 w-full mt-1 bg-surface border border-pearl rounded-md shadow-lg max-h-60 overflow-y-auto">
            {activeProjects.length > 0 ? (
              activeProjects.map(project => (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project.id)}
                  className={`w-full px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2
                           ${project.id === selectedProjectId ? 'bg-off-white' : ''}`}
                >
                  <svg className="w-4 h-4 text-aged-oak" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  <span className="text-[0.88rem] text-charcoal">{project.name}</span>
                  {project.id === selectedProjectId && (
                    <svg className="w-4 h-4 text-clay ml-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-aged-oak text-[0.85rem] font-display italic">
                No active projects
              </div>
            )}

            <StrataMark variant="micro" className="mx-3" />

            {/* Personal catalog toggle inside dropdown */}
            <button
              onClick={handleTogglePersonal}
              className={`w-full px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2
                       ${isPersonalCatalog ? 'bg-off-white' : ''}`}
            >
              <svg className="w-4 h-4 text-aged-oak" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <span className="text-[0.88rem] text-charcoal">Personal catalog</span>
              {isPersonalCatalog && (
                <svg className="w-4 h-4 text-clay ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Personal catalog checkbox (outside dropdown) */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isPersonalCatalog}
          onChange={handleTogglePersonal}
          className="w-4 h-4 rounded-[3px] border-pearl text-clay focus:ring-clay"
        />
        <span className="text-[0.85rem] text-charcoal">Save to personal catalog only</span>
      </label>
    </div>
  );
}

/**
 * Project selector dropdown for capture modal
 */

import { useState, useEffect } from 'react';
import type { Project, UUID } from '@patina/shared';

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
          className="w-full px-3 py-2 text-left bg-white border border-patina-clay-beige/50 rounded-lg
                   hover:border-patina-mocha-brown focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown
                   transition-colors flex items-center justify-between"
        >
          <span className={selectedProject ? 'text-patina-charcoal' : 'text-patina-mocha-brown/50'}>
            {isLoading ? 'Loading projects...' : selectedProject?.name || 'Select project...'}
          </span>
          <svg
            className={`w-4 h-4 text-patina-mocha-brown transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {isOpen && !isLoading && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-patina-clay-beige/50 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {activeProjects.length > 0 ? (
              activeProjects.map(project => (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project.id)}
                  className={`w-full px-3 py-2 text-left hover:bg-patina-off-white transition-colors flex items-center gap-2
                           ${project.id === selectedProjectId ? 'bg-patina-clay-beige/20' : ''}`}
                >
                  <svg className="w-4 h-4 text-patina-mocha-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  <span className="text-patina-charcoal">{project.name}</span>
                  {project.id === selectedProjectId && (
                    <svg className="w-4 h-4 text-patina-mocha-brown ml-auto" fill="currentColor" viewBox="0 0 20 20">
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
              <div className="px-3 py-2 text-patina-mocha-brown/70 text-sm">
                No active projects
              </div>
            )}
          </div>
        )}
      </div>

      {/* Personal catalog checkbox */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isPersonalCatalog}
          onChange={handleTogglePersonal}
          className="w-4 h-4 rounded border-patina-clay-beige text-patina-mocha-brown focus:ring-patina-mocha-brown"
        />
        <span className="text-sm text-patina-charcoal">Save to personal catalog only</span>
      </label>
    </div>
  );
}

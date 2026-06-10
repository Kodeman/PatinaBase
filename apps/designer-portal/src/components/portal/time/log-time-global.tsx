'use client';

import { useState } from 'react';
import { Button, Select } from '@/components/ui/controls';
import { useStartableProjects } from '@/hooks/use-startable-projects';
import { useToast } from '@/components/portal/toast-provider';
import { LogTimeDialog } from './log-time-dialog';

interface LogTimeGlobalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Global (header-launched) manual time entry. LogTimeDialog requires a
 * projectId, so this wrapper fronts it with a project picker: phase A picks
 * the project, phase B mounts the existing dialog unchanged.
 */
export function LogTimeGlobal({ open, onClose }: LogTimeGlobalProps) {
  const [projectId, setProjectId] = useState('');
  const projects = useStartableProjects(undefined, Number.POSITIVE_INFINITY);
  const { toast } = useToast();

  if (!open) return null;

  const handleClose = () => {
    setProjectId('');
    onClose();
  };

  if (projectId) {
    return (
      <LogTimeDialog
        open
        projectId={projectId}
        onClose={handleClose}
        onLogged={() => toast('Time logged', 'success')}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Log time — choose project"
        className="w-full max-w-sm rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-base font-medium text-[var(--text-primary)]">Log time</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Choose the project this time belongs to.
        </p>

        <div className="mt-4">
          {projects.length === 0 ? (
            <p className="rounded-md bg-[var(--bg-subtle)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
              No active projects yet — time is logged against an active or planning project.
            </p>
          ) : (
            <Select
              value=""
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Project"
            >
              <option value="" disabled>
                Select a project…
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? 'Untitled project'}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

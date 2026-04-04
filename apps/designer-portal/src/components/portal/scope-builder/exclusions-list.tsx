'use client';

import { useState } from 'react';
import { PortalButton } from '@/components/portal/button';
import {
  useProposalExclusions,
  useAddExclusion,
  useRemoveExclusion,
} from '@patina/supabase';

const CATEGORY_OPTIONS = [
  { value: 'construction', label: 'Construction' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'design', label: 'Design' },
  { value: 'other', label: 'Other' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  construction: 'var(--color-terracotta)',
  procurement: 'var(--color-sage)',
  design: 'var(--accent-primary)',
  other: 'var(--text-muted)',
};

const COMMON_DEFAULTS = [
  { description: 'Structural changes or modifications', category: 'construction' },
  { description: 'Contractor management and oversight', category: 'construction' },
  { description: 'Permit applications and approvals', category: 'construction' },
  { description: 'Custom millwork fabrication', category: 'procurement' },
];

interface ExclusionsListProps {
  proposalId: string;
}

export function ExclusionsList({ proposalId }: ExclusionsListProps) {
  const { data: exclusions = [], isLoading } = useProposalExclusions(proposalId);
  const addExclusion = useAddExclusion();
  const removeExclusion = useRemoveExclusion();

  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<string>('other');
  const [isAdding, setIsAdding] = useState(false);

  function handleAdd() {
    if (!newText.trim()) return;
    addExclusion.mutate(
      { proposalId, description: newText.trim(), category: newCategory },
      {
        onSuccess: () => {
          setNewText('');
          setIsAdding(false);
        },
      }
    );
  }

  function handleAddCommon() {
    const existingDescriptions = new Set(
      exclusions.map((e: { description: string }) => e.description.toLowerCase())
    );
    COMMON_DEFAULTS.forEach((d) => {
      if (!existingDescriptions.has(d.description.toLowerCase())) {
        addExclusion.mutate({ proposalId, description: d.description, category: d.category });
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === 'Escape') {
      setIsAdding(false);
      setNewText('');
    }
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center font-body text-[0.82rem] text-[var(--text-muted)]">
        Loading exclusions...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="type-meta">Exclusions</span>
        <div className="flex gap-2">
          <PortalButton variant="ghost" onClick={handleAddCommon}>
            Add Common
          </PortalButton>
          <PortalButton variant="secondary" onClick={() => setIsAdding(true)}>
            + Add
          </PortalButton>
        </div>
      </div>

      {/* Exclusion items */}
      {exclusions.map((excl: { id: string; description: string; category: string | null }) => (
        <div
          key={excl.id}
          className="group flex items-start gap-3 border-b py-2.5"
          style={{ borderColor: 'rgba(229, 226, 221, 0.4)' }}
        >
          {/* Category tag */}
          {excl.category && (
            <span
              className="mt-0.5 shrink-0 rounded-[2px] px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider"
              style={{
                color: CATEGORY_COLORS[excl.category] || 'var(--text-muted)',
                backgroundColor: `color-mix(in srgb, ${CATEGORY_COLORS[excl.category] || 'var(--text-muted)'} 10%, transparent)`,
              }}
            >
              {excl.category}
            </span>
          )}

          {/* Description */}
          <span className="flex-1 font-body text-[0.88rem] text-[var(--text-primary)]">
            {excl.description}
          </span>

          {/* Remove */}
          <button
            className="shrink-0 rounded-[3px] px-1.5 py-0.5 text-[0.7rem] text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] group-hover:opacity-100"
            onClick={() => removeExclusion.mutate({ exclusionId: excl.id, proposalId })}
            title="Remove"
          >
            x
          </button>
        </div>
      ))}

      {/* Inline add form */}
      {isAdding && (
        <div
          className="mt-2 flex items-center gap-3 border-b border-dashed border-[var(--accent-primary)] py-2.5"
        >
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="shrink-0 cursor-pointer border-b border-transparent bg-transparent font-mono text-[0.68rem] uppercase text-[var(--text-muted)] outline-none focus:border-[var(--accent-primary)]"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <input
            type="text"
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the exclusion..."
            className="flex-1 border-b border-transparent bg-transparent font-body text-[0.88rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/40 focus:border-[var(--accent-primary)]"
          />

          <div className="flex gap-1.5">
            <PortalButton
              variant="primary"
              onClick={handleAdd}
              disabled={!newText.trim() || addExclusion.isPending}
              className="!px-3 !py-1"
            >
              Add
            </PortalButton>
            <PortalButton
              variant="ghost"
              onClick={() => {
                setIsAdding(false);
                setNewText('');
              }}
              className="!px-2 !py-1"
            >
              Cancel
            </PortalButton>
          </div>
        </div>
      )}

      {/* Empty state */}
      {exclusions.length === 0 && !isAdding && (
        <div className="py-10 text-center">
          <p className="font-body text-[0.88rem] text-[var(--text-muted)]">
            No exclusions defined.
          </p>
          <p className="mt-1 font-body text-[0.78rem] text-[var(--text-muted)]">
            Clearly stating what is not included protects both you and your client.
          </p>
        </div>
      )}
    </div>
  );
}

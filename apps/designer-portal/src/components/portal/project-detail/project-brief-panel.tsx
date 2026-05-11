'use client';

import { useState } from 'react';
import { useProjectNarrativeSections } from '@patina/supabase';

const SECTION_ORDER: Record<string, number> = {
  vision: 0,
  concept: 1,
  space_plan: 2,
  selections: 3,
  investment: 4,
  timeline: 5,
  terms: 6,
};

interface ProjectBriefPanelProps {
  projectId: string;
}

export function ProjectBriefPanel({ projectId }: ProjectBriefPanelProps) {
  const { data: sections = [], isLoading } = useProjectNarrativeSections(projectId);
  const [openType, setOpenType] = useState<string | null>(null);

  if (isLoading) return null;
  if (sections.length === 0) return null;

  const ordered = [...sections].sort((a, b) => {
    const aRank = SECTION_ORDER[a.type] ?? a.sort_order;
    const bRank = SECTION_ORDER[b.type] ?? b.sort_order;
    return aRank - bRank;
  });

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h3
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            fontSize: '1.25rem',
            lineHeight: 1.35,
          }}
        >
          Project Brief
        </h3>
        <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
          From signed proposal
        </span>
      </div>
      <div className="divide-y divide-[var(--border-default)] rounded-md border border-[var(--border-default)]">
        {ordered.map((s) => {
          const isOpen = openType === s.type;
          return (
            <div key={s.id}>
              <button
                type="button"
                onClick={() => setOpenType(isOpen ? null : s.type)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span className="font-body text-sm text-[var(--text-primary)]">{s.title}</span>
                <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
                  {isOpen ? '— Hide' : '+ Show'}
                </span>
              </button>
              {isOpen ? (
                <div className="px-4 pb-4 type-body-small whitespace-pre-wrap text-[var(--text-body)]">
                  {s.body || (
                    <em className="text-[var(--text-muted)]">No content for this section.</em>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

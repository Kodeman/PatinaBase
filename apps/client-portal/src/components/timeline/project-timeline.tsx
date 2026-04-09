'use client';

import { useMemo, useState, useTransition } from 'react';
import { logEngagementAction } from '@/app/projects/[projectId]/actions';
import type { MilestoneDetail } from '@/types/project';
import { MilestoneCard } from './milestone-card';

interface ProjectTimelineProps {
  projectId: string;
  milestones: MilestoneDetail[];
}

export function ProjectTimeline({ projectId, milestones }: ProjectTimelineProps) {
  const defaultActiveId = useMemo(() => {
    return (
      milestones.find((milestone) => milestone.status === 'in_progress' || milestone.status === 'attention')?.id ??
      milestones[0]?.id
    );
  }, [milestones]);

  const [activeId, setActiveId] = useState<string | undefined>(defaultActiveId);
  const [, startEngagementTransition] = useTransition();

  const handleToggle = (milestoneId: string) => {
    setActiveId((current) => {
      const next = current === milestoneId ? undefined : milestoneId;
      if (next) {
        startEngagementTransition(() =>
          logEngagementAction({
            projectId,
            event: 'client_portal.milestone_opened',
            metadata: { milestoneId: next },
          })
        );
      }
      return next;
    });
  };

  return (
    <div className="relative pb-24">
      {/* Thin hairline timeline spine */}
      <div
        className="absolute left-[7px] top-0 hidden h-full w-[1px] bg-[var(--border-default)] sm:block"
      />
      <div className="space-y-0 sm:pl-10">
        {milestones.map((milestone) => (
          <div key={milestone.id} className="relative">
            {/* Small clay dot */}
            <span className="absolute -left-[13px] top-8 hidden h-2 w-2 rounded-full bg-patina-clay sm:block" />
            <MilestoneCard
              projectId={projectId}
              milestone={milestone}
              isExpanded={activeId === milestone.id}
              onToggle={() => handleToggle(milestone.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

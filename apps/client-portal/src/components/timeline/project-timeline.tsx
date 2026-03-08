'use client';

import { useMemo, useState, useTransition } from 'react';
import { motion } from 'framer-motion';

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
      <motion.div
        className="timeline-gradient absolute left-5 top-0 hidden h-full w-1 rounded-full sm:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      />
      <div className="space-y-6 sm:pl-12">
        {milestones.map((milestone) => (
          <div key={milestone.id} className="relative">
            <span className="timeline-gradient absolute -left-11 top-6 hidden h-6 w-6 rounded-full border border-white shadow-sm sm:block" />
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

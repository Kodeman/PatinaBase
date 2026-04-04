'use client';

import { useRouter } from 'next/navigation';
import { ProgressBar } from './progress-bar';

interface ProjectListItemProps {
  id: string;
  name: string;
  phase: string;
  progress: number;
}

export function ProjectListItem({
  id,
  name,
  phase,
  progress,
}: ProjectListItemProps) {
  const router = useRouter();

  return (
    <div
      className="cursor-pointer border-b border-[var(--border-subtle)] py-[1.1rem] transition-all hover:bg-[var(--bg-hover)] hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
      style={{ transitionDuration: 'var(--duration-fast)' }}
      onClick={() => router.push(`/portal/projects/${id}`)}
    >
      <div className="flex items-baseline justify-between">
        <span className="type-label">{name}</span>
        <span className="type-meta">{phase}</span>
      </div>
      <div className="mt-2.5">
        <ProgressBar progress={progress} />
      </div>
    </div>
  );
}

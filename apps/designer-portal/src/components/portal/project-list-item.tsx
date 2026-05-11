'use client';

import { useRouter } from 'next/navigation';
import { RowItem } from '@patina/catalog-ui';
import { ProgressBar } from './progress-bar';

interface ProjectListItemProps {
  id: string;
  name: string;
  phase: string;
  progress: number;
}

export function ProjectListItem({ id, name, phase, progress }: ProjectListItemProps) {
  const router = useRouter();

  return (
    <RowItem
      onClick={() => router.push(`/portal/projects/${id}`)}
      leading={<span className="type-label">{name}</span>}
      end={<span className="type-meta">{phase}</span>}
      below={<ProgressBar progress={progress} />}
    />
  );
}

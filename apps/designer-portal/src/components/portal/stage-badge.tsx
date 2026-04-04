'use client';

type Stage = 'lead' | 'proposal' | 'active' | 'completed' | 'nurture';

const stageConfig: Record<Stage, { label: string; color: string }> = {
  lead: {
    label: 'New Lead',
    color: 'var(--color-dusty-blue)',
  },
  proposal: {
    label: 'Proposal',
    color: 'var(--color-golden-hour)',
  },
  active: {
    label: 'Active',
    color: 'var(--color-sage)',
  },
  completed: {
    label: 'Completed',
    color: 'var(--text-muted)',
  },
  nurture: {
    label: 'Nurture',
    color: 'var(--accent-primary)',
  },
};

interface StageBadgeProps {
  stage: Stage;
  label?: string;
}

export function StageBadge({ stage, label }: StageBadgeProps) {
  const config = stageConfig[stage] || stageConfig.active;

  return (
    <span
      className="type-meta-small inline-flex whitespace-nowrap"
      style={{ color: config.color }}
    >
      {label || config.label}
    </span>
  );
}

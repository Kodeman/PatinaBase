import { PHASE_CONFIG, type ProjectPhase } from '@/types/project-ui';

interface PhaseDotProps {
  phase: ProjectPhase;
  size?: 'sm' | 'default';
}

export function PhaseDot({ phase, size = 'default' }: PhaseDotProps) {
  const config = PHASE_CONFIG[phase];
  const dimension = size === 'sm' ? '8px' : '10px';

  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: dimension,
        height: dimension,
        backgroundColor: config?.color ?? 'var(--color-pearl)',
      }}
    />
  );
}

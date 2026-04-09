import { ProgressBar as SharedProgressBar } from '@patina/design-system';

interface ProgressBarProps {
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  return <SharedProgressBar value={progress} max={100} size="sm" />;
}

interface ProgressBarProps {
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-patina-pearl">
      <div
        className="h-full rounded-full bg-patina-clay animate-bar-fill"
        style={{
          width: `${Math.min(100, Math.max(0, progress))}%`,
          transformOrigin: 'left center',
        }}
      />
    </div>
  );
}

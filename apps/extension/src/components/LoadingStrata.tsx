interface LoadingStrataProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingStrata({ size = 'md', className = '' }: LoadingStrataProps) {
  const widths = {
    sm: ['w-[30px]', 'w-[24px]', 'w-[18px]'],
    md: ['w-[50px]', 'w-[40px]', 'w-[30px]'],
    lg: ['w-[70px]', 'w-[56px]', 'w-[42px]'],
  };
  const h = size === 'sm' ? 'h-[1.5px]' : 'h-[2px]';
  const gap = size === 'sm' ? 'gap-[3px]' : 'gap-[5px]';
  const py = size === 'sm' ? 'py-2' : 'py-6';
  const w = widths[size];

  return (
    <div className={`flex flex-col ${gap} items-center ${py} ${className}`}>
      <div className={`${h} ${w[0]} rounded-sm bg-mocha animate-strata-pulse`} />
      <div className={`${h} ${w[1]} rounded-sm bg-clay animate-strata-pulse`} style={{ animationDelay: '0.15s' }} />
      <div className={`${h} ${w[2]} rounded-sm bg-clay opacity-50 animate-strata-pulse`} style={{ animationDelay: '0.3s' }} />
    </div>
  );
}

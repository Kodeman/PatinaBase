interface StrataMarkProps {
  variant?: 'full' | 'mini' | 'micro';
  className?: string;
}

export function StrataMark({ variant = 'mini', className = '' }: StrataMarkProps) {
  if (variant === 'micro') {
    return <div className={`h-px w-full bg-pearl ${className}`} />;
  }

  if (variant === 'full') {
    return (
      <div className={`flex flex-col gap-[5px] py-6 ${className}`}>
        <div className="h-[2px] w-full rounded-sm bg-mocha" />
        <div className="h-[2px] w-4/5 rounded-sm bg-clay opacity-70" />
        <div className="h-[2px] w-3/5 rounded-sm bg-clay opacity-35" />
      </div>
    );
  }

  // mini (default)
  return (
    <div className={`flex flex-col gap-1 py-3 ${className}`}>
      <div className="h-[1.5px] w-[60px] rounded-sm bg-mocha" />
      <div className="h-[1.5px] w-[48px] rounded-sm bg-clay opacity-70" />
      <div className="h-[1.5px] w-[36px] rounded-sm bg-clay opacity-35" />
    </div>
  );
}

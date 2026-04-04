interface StrataMarkProps {
  variant: 'full' | 'mini' | 'micro';
}

export function StrataMark({ variant }: StrataMarkProps) {
  if (variant === 'micro') {
    return <div className="h-px bg-patina-pearl" />;
  }

  if (variant === 'mini') {
    return (
      <div className="flex flex-col gap-1 py-8">
        <div
          className="h-[1.5px] w-[60px] rounded-full bg-patina-mocha animate-strata-draw"
          style={{ animationDelay: '0ms' }}
        />
        <div
          className="h-[1.5px] w-[48px] rounded-full bg-patina-clay opacity-70 animate-strata-draw"
          style={{ animationDelay: '150ms' }}
        />
        <div
          className="h-[1.5px] w-[36px] rounded-full bg-patina-clay opacity-35 animate-strata-draw"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 py-12">
      <div
        className="h-[2px] w-full rounded-full bg-patina-mocha animate-strata-draw"
        style={{ animationDelay: '0ms' }}
      />
      <div
        className="h-[2px] w-[80%] rounded-full bg-patina-clay opacity-70 animate-strata-draw"
        style={{ animationDelay: '200ms' }}
      />
      <div
        className="h-[2px] w-[60%] rounded-full bg-patina-clay opacity-35 animate-strata-draw"
        style={{ animationDelay: '400ms' }}
      />
    </div>
  );
}

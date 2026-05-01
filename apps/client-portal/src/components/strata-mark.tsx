interface StrataMarkProps {
  variant: 'full' | 'mini' | 'micro';
}

/**
 * The patina-strata-* keyframes wash each row from a soft start tone into the
 * mocha/clay accents on first paint. Wrapped in `motion-safe:` so users with
 * `prefers-reduced-motion: reduce` see only the static composition.
 */
export function StrataMark({ variant }: StrataMarkProps) {
  if (variant === 'micro') {
    return <div className="h-px bg-patina-pearl" />;
  }

  if (variant === 'mini') {
    return (
      <div className="flex flex-col gap-1 py-8">
        <div className="patina-strata-row-1 h-[1.5px] w-[60px] rounded-full bg-patina-mocha" />
        <div className="patina-strata-row-2 h-[1.5px] w-[48px] rounded-full bg-patina-clay opacity-70" />
        <div className="patina-strata-row-3 h-[1.5px] w-[36px] rounded-full bg-patina-clay opacity-35" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 py-12">
      <div className="patina-strata-row-1 h-[2px] w-full rounded-full bg-patina-mocha" />
      <div className="patina-strata-row-2 h-[2px] w-[80%] rounded-full bg-patina-clay opacity-70" />
      <div className="patina-strata-row-3 h-[2px] w-[60%] rounded-full bg-patina-clay opacity-35" />
    </div>
  );
}

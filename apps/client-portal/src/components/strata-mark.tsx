interface StrataMarkProps {
  variant: 'full' | 'mini' | 'micro';
  /** `forest` is the homeowner page's mark (US-45 A2, green replaces clay);
   *  everywhere else keeps the house's mocha/clay. */
  tone?: 'clay' | 'forest';
}

/**
 * The patina-strata-* keyframes wash each row from a soft start tone into the
 * mocha/clay accents (forest on the homeowner page) on first paint. Wrapped
 * in `motion-safe:` so users with `prefers-reduced-motion: reduce` see only
 * the static composition.
 */
export function StrataMark({ variant, tone = 'clay' }: StrataMarkProps) {
  if (variant === 'micro') {
    return <div className="h-px bg-patina-pearl" />;
  }

  const lead = tone === 'forest' ? 'bg-patina-forest' : 'bg-patina-mocha';
  const follow = tone === 'forest' ? 'bg-patina-forest' : 'bg-patina-clay';

  if (variant === 'mini') {
    return (
      <div data-strata-tone={tone} className="flex flex-col gap-1 py-8">
        <div className={`patina-strata-row-1 h-[1.5px] w-[60px] rounded-full ${lead}`} />
        <div className={`patina-strata-row-2 h-[1.5px] w-[48px] rounded-full ${follow} opacity-70`} />
        <div className={`patina-strata-row-3 h-[1.5px] w-[36px] rounded-full ${follow} opacity-35`} />
      </div>
    );
  }

  return (
    <div data-strata-tone={tone} className="flex flex-col gap-1.5 py-12">
      <div className={`patina-strata-row-1 h-[2px] w-full rounded-full ${lead}`} />
      <div className={`patina-strata-row-2 h-[2px] w-[80%] rounded-full ${follow} opacity-70`} />
      <div className={`patina-strata-row-3 h-[2px] w-[60%] rounded-full ${follow} opacity-35`} />
    </div>
  );
}

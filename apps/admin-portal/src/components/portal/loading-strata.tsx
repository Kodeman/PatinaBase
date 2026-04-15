export function LoadingStrata() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-20">
      <div className="h-[2px] w-[60px] animate-pulse rounded-full bg-patina-mocha" />
      <div
        className="h-[2px] w-[48px] animate-pulse rounded-full bg-patina-clay opacity-70"
        style={{ animationDelay: '100ms' }}
      />
      <div
        className="h-[2px] w-[36px] animate-pulse rounded-full bg-patina-clay opacity-35"
        style={{ animationDelay: '200ms' }}
      />
    </div>
  );
}

interface StaggeredAnimationOptions {
  itemCount: number;
  staggerMs?: number;
  maxDelayMs?: number;
}

export function useStaggeredAnimation({
  itemCount,
  staggerMs = 100,
  maxDelayMs = 500,
}: StaggeredAnimationOptions) {
  const getDelay = (index: number): number => {
    const delay = index * staggerMs;
    return Math.min(delay, maxDelayMs);
  };

  const getDelayVar = (index: number): string => {
    return `${getDelay(index)}ms`;
  };

  return {
    getDelay,
    getDelayVar,
  };
}
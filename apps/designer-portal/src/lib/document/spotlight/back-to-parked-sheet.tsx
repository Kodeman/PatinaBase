"use client";

import { useParked } from "./parking";

/** A landing can offer its parked sheet without owning the parking store. */
export function BackToParkedSheet({
  parkingKey,
  sheet,
  onReturn,
  className,
}: {
  parkingKey: string;
  sheet: string;
  onReturn: () => void;
  className?: string;
}) {
  const state = useParked(parkingKey);
  if (state === null) return null;
  return (
    <button type="button" className={className} onClick={onReturn}>
      Back to {sheet}
    </button>
  );
}

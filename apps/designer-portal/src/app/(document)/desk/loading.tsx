/** /desk before its chunk lands, under the loading register (US-34 N10):
 *  the Desk shaped, filled bars, no words. Flag off it stands still (no breath) rather than
 *  blank: a loading boundary swaps the old page out at once. */
import { DeskSkeleton, RegisterFallback } from "@/components/loading";

export default function Loading() {
  return (
    <RegisterFallback>
      <DeskSkeleton />
    </RegisterFallback>
  );
}

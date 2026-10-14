/** /doc/[id] before its chunk lands, under the loading register (US-34 N10):
 *  the same DocumentSkeleton the page holds on, so the paper is set in one
 *  shape (arrival C). Flag off it stands still (no breath) rather than
 *  blank: a loading boundary swaps the old page out at once. */
import { DocumentSkeleton, RegisterFallback } from "@/components/loading";

export default function Loading() {
  return (
    <RegisterFallback>
      <DocumentSkeleton />
    </RegisterFallback>
  );
}

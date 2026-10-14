/** /doc/[id] before its chunk lands, under the loading register (US-34 N10):
 *  the same DocumentSkeleton the page holds on, so the paper is set in one
 *  shape (arrival C). Flag off, nothing (today). */
import { DocumentSkeleton, RegisterOnly } from "@/components/loading";

export default function Loading() {
  return (
    <RegisterOnly>
      <DocumentSkeleton />
    </RegisterOnly>
  );
}

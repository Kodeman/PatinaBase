/** /desk before its chunk lands, under the loading register (US-34 N10):
 *  the Desk shaped, filled bars, no words. Flag off, nothing (today). */
import { DeskSkeleton, RegisterOnly } from "@/components/loading";

export default function Loading() {
  return (
    <RegisterOnly>
      <DeskSkeleton />
    </RegisterOnly>
  );
}

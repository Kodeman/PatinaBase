/** /doc/[id]/pieces/finishes/print before its chunk lands (US-34 F13): a
 *  quiet busy sheet, as the print shows while it reads, so the painter's
 *  print never wears the Build room's skeleton. */
import { QuietLoading } from "@/components/loading";

export default function Loading() {
  return <QuietLoading label="Loading the finish schedule." />;
}

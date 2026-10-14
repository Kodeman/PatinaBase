/** /library/[id] before its chunk lands (US-34 F13d): a quiet busy sheet, so
 *  the Piece never wears the shelf's skeleton. */
import { QuietLoading } from "@/components/loading";

export default function Loading() {
  return <QuietLoading label="Loading the piece." />;
}

/** /room/[id]/file before its chunk lands (US-34 F13): a quiet busy sheet,
 *  so the Room File never wears the Room view's skeleton. */
import { QuietLoading } from "@/components/loading";

export default function Loading() {
  return <QuietLoading label="Loading the room file." />;
}

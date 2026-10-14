/** /board/[boardId] before its chunk lands (US-34 F13e): the chrome-less
 *  board, the same skeleton the page shows while the board is read. */
import { MoodBoardSkeleton } from "@/components/loading";

export default function Loading() {
  return <MoodBoardSkeleton />;
}

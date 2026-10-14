/** Any Document-group room without its own fallback, under the loading
 *  register (US-34 N10): a quiet busy sheet. Its shape is unknown here, so no
 *  bars and no sweep on blank paper (PQ6); the slow line only after 4 s.
 *  Flag off, nothing (today). */
import { LoadingRegion, RegisterOnly, SlowLine } from "@/components/loading";

export default function Loading() {
  return (
    <RegisterOnly>
      <LoadingRegion as="main" label="Loading the page." className="relative min-h-screen">
        <SlowLine />
      </LoadingRegion>
    </RegisterOnly>
  );
}

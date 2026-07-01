/** C1 — Extracting. The transitional read-the-page state. */
import { LoadingStrata } from '../components/LoadingStrata';

export function ExtractingScreen() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <LoadingStrata size="md" />
      <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-ink-soft">
        Reading the page…
      </p>
    </div>
  );
}

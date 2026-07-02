import { Suspense } from 'react';
import type { Metadata } from 'next';
import { QuizFlow } from './quiz-flow';

export const metadata: Metadata = {
  title: 'The Style Quiz · Patina',
  description:
    'Five questions, no sign-up. See how your taste settles across warmth, boldness, craftsmanship — and the pieces that fit.',
};

/**
 * Pre-auth style quiz (design §7.1, Wave 3A). Allowlisted in middleware
 * `isPublicPage` — anonymous visitors take the quiz, results are theirs to
 * claim after signup via the localStorage session key.
 */
export default function QuizPage() {
  // Suspense: QuizFlow reads useSearchParams (utm attribution) — Next 15
  // requires a boundary for static prerender.
  return (
    <Suspense fallback={null}>
      <QuizFlow />
    </Suspense>
  );
}

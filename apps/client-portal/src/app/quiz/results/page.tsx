import type { Metadata } from 'next';
import { ResultsView } from './results-view';

export const metadata: Metadata = {
  title: 'Your Style Profile · Patina',
  description: 'Your style profile and the pieces that fit it — from Designer-Taught Intelligence.',
};

/**
 * Quiz results (Wave 3A — design §7.1 flow, §10.6 rendering rules). Pre-auth:
 * the localStorage session key is the capability; signed-in visitors get the
 * profile bound to their account here (claim_quiz_session).
 */
export default function QuizResultsPage() {
  return <ResultsView />;
}

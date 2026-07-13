import { redirect } from 'next/navigation';

import { getUser } from '@patina/supabase/server';
// F3 — client-portal /reviews migrated to ambient help-system per spec §9.2.
// Consumer voice: "share your experience" — never "rate" or "submit feedback"
// — keeps the warm hospitality framing.
import { SectionIntro, SurfaceKeys } from '@patina/help-system';

import { ReviewsIndex } from '@/components/reviews/ReviewsIndex';
import { StrataMark } from '@/components/strata-mark';

export default async function ReviewsPage() {
  const user = await getUser();
  if (!user) redirect('/auth/signin?callbackUrl=/reviews');

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <main className="mx-auto flex w-full max-w-4xl flex-col px-6 py-12">
        <section>
          <p className="type-meta">Reviews</p>
          <h1 className="type-page-title mt-4">
            Share your experience with each project.
          </h1>
          <SectionIntro
            surfaceKey={SurfaceKeys.ClientPortal.Reviews.ListIntro}
            fallback="When a designer wraps your project, you’ll see a request to leave a review here."
            className="mt-4 type-body max-w-prose"
          />
        </section>

        <StrataMark variant="mini" />

        <ReviewsIndex userId={user.id} />
      </main>
    </div>
  );
}

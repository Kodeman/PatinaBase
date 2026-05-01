import { redirect } from 'next/navigation';

import { getUser } from '@patina/supabase/server';

import { ClientHeader } from '@/components/layout/client-header';
import { ReviewsIndex } from '@/components/reviews/ReviewsIndex';
import { StrataMark } from '@/components/strata-mark';
import { fetchClientProjects } from '@/lib/data/projects';

export default async function ReviewsPage() {
  const user = await getUser();
  if (!user) redirect('/auth/signin?callbackUrl=/reviews');

  const projects = await fetchClientProjects();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ClientHeader projects={projects} />
      <main className="mx-auto flex w-full max-w-4xl flex-col px-6 py-12">
        <section>
          <p className="type-meta">Reviews</p>
          <h1 className="type-page-title mt-4">
            Share your experience with each project.
          </h1>
          <p className="type-body mt-4">
            When a designer wraps your project, you&rsquo;ll see a request to leave a review here.
          </p>
        </section>

        <StrataMark variant="mini" />

        <ReviewsIndex userId={user.id} />
      </main>
    </div>
  );
}

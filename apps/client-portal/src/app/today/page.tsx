import { redirect } from 'next/navigation';

import { getUser } from '@patina/supabase/server';

import { ClientHeader } from '@/components/layout/client-header';
import { StrataMark } from '@/components/strata-mark';
import { TodayPage } from '@/components/today/TodayPage';
import { fetchClientProjects } from '@/lib/data/projects';

export default async function Page() {
  const user = await getUser();
  if (!user) redirect('/auth/signin?callbackUrl=/today');

  const projects = await fetchClientProjects();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ClientHeader projects={projects} />
      <main className="mx-auto flex w-full max-w-4xl flex-col px-6 py-12">
        <section>
          <p className="type-meta">Today</p>
          <h1 className="type-page-title mt-4">Curated for you.</h1>
          <p className="type-body mt-4">
            A daily story from the Patina editors and fresh recommendations for each of your rooms.
          </p>
        </section>

        <StrataMark variant="mini" />

        <TodayPage userId={user.id} />
      </main>
    </div>
  );
}

import { redirect } from 'next/navigation';

import { getUser } from '@patina/supabase/server';
// F3 — client-portal /today migrated to ambient help-system per spec §9.2.
// The SectionIntro below the page hero is CMS-backed with a consumer-voice
// fallback ("A daily story from the Patina editors...") that ships until the
// homeowner-targeted Sanity content lands. Voice: warm, second-person, no
// designer jargon. Analytics fire automatically on first CMS hit.
import { SectionIntro, SurfaceKeys } from '@patina/help-system';

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
          <SectionIntro
            surfaceKey={SurfaceKeys.ClientPortal.Home.GreetingIntro}
            fallback="A daily story from the Patina editors and fresh recommendations for each of your rooms."
            className="mt-4 type-body max-w-prose"
          />
        </section>

        <StrataMark variant="mini" />

        <TodayPage userId={user.id} />
      </main>
    </div>
  );
}

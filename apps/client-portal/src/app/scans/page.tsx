import { redirect } from 'next/navigation';

import { getUser } from '@patina/supabase/server';
// F3 — client-portal /scans migrated to ambient help-system per spec §9.2.
// Consumer voice: we call them "rooms" externally (not "scans") since that's
// the homeowner's mental model. The iOS app is the capture surface.
import { SectionIntro, SurfaceKeys } from '@patina/help-system';

import { ClientHeader } from '@/components/layout/client-header';
import { RoomScanList } from '@/components/scans/RoomScanList';
import { StrataMark } from '@/components/strata-mark';
import { fetchClientProjects } from '@/lib/data/projects';

export default async function ScansPage() {
  const user = await getUser();
  if (!user) redirect('/auth/signin?callbackUrl=/scans');

  const projects = await fetchClientProjects();
  const approvalsPending = projects.reduce((total, project) => total + project.approvalsPending, 0);
  const unreadMessages = projects.reduce((total, project) => total + project.unreadMessages, 0);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ClientHeader
        projects={projects}
        approvalsPending={approvalsPending}
        unreadMessages={unreadMessages}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col px-6 py-12">
        <section>
          <p className="type-meta">Your rooms</p>
          <h1 className="type-page-title mt-4">
            Captured rooms from the Patina iOS app.
          </h1>
          <SectionIntro
            surfaceKey={SurfaceKeys.ClientPortal.Scans.ListIntro}
            fallback="Open a room to view its 3D model, manage who you’ve shared it with, or get design help."
            className="mt-4 type-body max-w-prose"
          />
        </section>

        <StrataMark variant="mini" />

        <RoomScanList userId={user.id} />
      </main>
    </div>
  );
}

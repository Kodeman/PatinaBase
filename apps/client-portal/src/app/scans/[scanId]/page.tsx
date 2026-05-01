import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { getUser } from '@patina/supabase/server';

import { ClientHeader } from '@/components/layout/client-header';
import { ClientRoomScanViewer } from '@/components/scans/ClientRoomScanViewer';
import { RoomScanShareStatus } from '@/components/scans/RoomScanShareStatus';
import { fetchClientProjects } from '@/lib/data/projects';

interface ScanDetailPageProps {
  params: Promise<{ scanId: string }>;
}

export default async function ScanDetailPage({ params }: ScanDetailPageProps) {
  const { scanId } = await params;

  const user = await getUser();
  if (!user) redirect(`/auth/signin?callbackUrl=/scans/${scanId}`);

  const projects = await fetchClientProjects();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ClientHeader projects={projects} />
      <main className="mx-auto flex w-full max-w-6xl flex-col px-6 py-10">
        <Link
          href="/scans"
          className="inline-flex items-center gap-1.5 type-meta no-underline transition hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to rooms
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ClientRoomScanViewer scanId={scanId} />
          </div>
          <aside>
            <RoomScanShareStatus scanId={scanId} />
          </aside>
        </div>
      </main>
    </div>
  );
}

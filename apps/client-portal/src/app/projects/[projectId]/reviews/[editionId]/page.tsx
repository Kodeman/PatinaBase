import Link from 'next/link';
import { ProjectReviewEdition } from '@/components/project/ProjectReviewEdition';

interface ProjectReviewPageProps {
  params: Promise<{ projectId: string; editionId: string }>;
}

export default async function ProjectReviewPage({ params }: ProjectReviewPageProps) {
  const { projectId, editionId } = await params;

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl bg-[var(--bg-primary)] px-6 py-10">
      <Link href={`/projects/${projectId}`} className="type-meta-small text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        ← Back to project
      </Link>
      <ProjectReviewEdition projectId={projectId} editionId={editionId} />
    </main>
  );
}

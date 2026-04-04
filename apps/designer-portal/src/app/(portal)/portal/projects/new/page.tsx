'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { ProjectForm } from '@/components/portal/project-form';
import { useCreateProject } from '@/hooks/use-projects';

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createProject = useCreateProject();

  // Check if pre-filled from a lead
  const fromLeadId = searchParams.get('leadId');
  const fromLead = fromLeadId
    ? {
        clientName: searchParams.get('clientName') ?? '',
        rooms: searchParams.get('rooms') ?? '',
        budget: searchParams.get('budget') ?? '',
        styleTags: (searchParams.get('styles') ?? '').split(',').filter(Boolean),
      }
    : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSubmit = (data: any) => {
    createProject.mutate(data, {
      onSuccess: (result: unknown) => {
        const id = (result as { id?: string })?.id ?? '';
        router.push(`/portal/projects/${id}`);
      },
    });
  };

  const handleSaveDraft = () => {
    createProject.mutate({ status: 'draft' }, {
      onSuccess: () => {
        router.push('/portal/projects');
      },
    });
  };

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: 'New Project' },
        ]}
      />

      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
          New Project
        </h1>
      </div>

      <ProjectForm
        fromLead={fromLead}
        onSubmit={handleSubmit}
        onSaveDraft={handleSaveDraft}
        onCancel={() => router.push('/portal/projects')}
        styleTags={fromLead?.styleTags ?? ['Warm Minimalist', 'Organic Modern']}
      />
    </div>
  );
}

'use client';

import { useParams } from 'next/navigation';
import { useTemplate } from '@patina/supabase/hooks';
import { EmailTemplateBuilder } from '@/components/email-builder';

export default function EditTemplatePage() {
  const params = useParams();
  const id = params.id as string;
  const { data: template, isLoading } = useTemplate(id);

  if (isLoading || !template) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <EmailTemplateBuilder template={template} />;
}

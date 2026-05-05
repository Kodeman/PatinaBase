'use client';

import { useMemo } from 'react';
import { useTemplateBuilderStore } from '@/stores/template-builder-store';
import { renderTemplate } from '@patina/email/renderer';
import { buildSampleData } from '@patina/shared';
import type { ContentBlock } from '@patina/shared/types';

export function PreviewPane() {
  const getAllBlocks = useTemplateBuilderStore((s) => s.getAllBlocks);
  const headerBlock = useTemplateBuilderStore((s) => s.headerBlock);
  const footerBlock = useTemplateBuilderStore((s) => s.footerBlock);
  const contentBlocks = useTemplateBuilderStore((s) => s.contentBlocks);
  const previewDevice = useTemplateBuilderStore((s) => s.previewDevice);
  const variables = useTemplateBuilderStore((s) => s.variables);

  // Re-render when blocks or variable samples change
  const previewHtml = useMemo(() => {
    const allBlocks = [headerBlock, ...contentBlocks, footerBlock] as unknown as ContentBlock[];
    return renderTemplate(allBlocks, {
      previewMode: true,
      variables: buildSampleData(variables),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerBlock, footerBlock, contentBlocks, variables]);

  return (
    <div className="bg-[#F0EDE9] overflow-y-auto flex justify-center p-6 min-w-[400px]">
      <div className={previewDevice === 'mobile' ? 'w-[375px]' : 'w-[600px]'}>
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              className="w-full min-h-[800px] border-0"
              title="Email Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-96 text-patina-clay-beige text-sm">
              Add blocks to see a preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useTemplateBuilderStore } from '@/stores/template-builder-store';

export function HtmlEditor() {
  const rawHtml = useTemplateBuilderStore((s) => s.rawHtml);
  const setRawHtml = useTemplateBuilderStore((s) => s.setRawHtml);
  const previewDevice = useTemplateBuilderStore((s) => s.previewDevice);

  return (
    <div className="flex flex-1 h-full">
      {/* Editor */}
      <div className="w-1/2 border-r border-patina-clay-beige/20 overflow-y-auto p-6">
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-3">HTML Content</h3>
          <textarea
            value={rawHtml}
            onChange={(e) => setRawHtml(e.target.value)}
            rows={30}
            placeholder="Paste your email HTML here..."
            className="w-full px-3 py-2 text-sm font-mono border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 resize-y"
          />
        </div>
      </div>

      {/* Preview */}
      <div className="w-1/2 bg-[#F0EDE9] overflow-y-auto flex justify-center p-6">
        <div className={previewDevice === 'mobile' ? 'w-[375px]' : 'w-[600px]'}>
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {rawHtml ? (
              <iframe
                srcDoc={rawHtml}
                className="w-full min-h-[600px] border-0"
                title="Email Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-96 text-patina-clay-beige text-sm">
                Preview will appear here
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

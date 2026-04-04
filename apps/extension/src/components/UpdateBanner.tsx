import { useState } from 'react';
import { useUpdateCheck } from '../hooks/use-update-check';

export function UpdateBanner() {
  const { hasUpdate, updateInfo, dismissUpdate } = useUpdateCheck();
  const [showInstructions, setShowInstructions] = useState(false);

  if (!hasUpdate || !updateInfo) return null;

  return (
    <div className="mx-4 mt-3 p-3 bg-surface border-l-[3px] border-golden-hour rounded-md shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <svg className="w-4 h-4 text-golden-hour mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <div className="min-w-0">
            <p className="text-[0.85rem] font-medium text-charcoal">
              Update available: v{updateInfo.version}
            </p>
            {updateInfo.changelog && (
              <p className="text-[0.82rem] text-aged-oak mt-0.5 truncate">{updateInfo.changelog}</p>
            )}
          </div>
        </div>
        <button
          onClick={dismissUpdate}
          className="text-aged-oak hover:text-charcoal flex-shrink-0"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <a
          href={updateInfo.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-3 py-1.5 text-[0.78rem] font-medium rounded-[3px] bg-charcoal text-off-white hover:bg-mocha transition-colors"
        >
          Download
        </a>
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="inline-flex items-center px-3 py-1.5 text-[0.78rem] font-medium rounded-[3px] border border-pearl text-charcoal hover:bg-[var(--bg-hover)] transition-colors"
        >
          {showInstructions ? 'Hide' : 'How to install'}
        </button>
      </div>

      {showInstructions && (
        <ol className="mt-2 ml-4 text-[0.82rem] text-mocha list-decimal space-y-1">
          <li>Click "Download" above to get the .zip file</li>
          <li>Open <code className="bg-off-white px-1 rounded-sm font-mono text-[0.72rem]">chrome://extensions</code> in a new tab</li>
          <li>Enable "Developer mode" (top right toggle)</li>
          <li>Drag and drop the .zip file onto the extensions page</li>
        </ol>
      )}
    </div>
  );
}

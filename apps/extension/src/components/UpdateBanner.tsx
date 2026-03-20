import { useState } from 'react';
import { useUpdateCheck } from '../hooks/use-update-check';

export function UpdateBanner() {
  const { hasUpdate, updateInfo, dismissUpdate } = useUpdateCheck();
  const [showInstructions, setShowInstructions] = useState(false);

  if (!hasUpdate || !updateInfo) return null;

  return (
    <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800">
              Update available: v{updateInfo.version}
            </p>
            {updateInfo.changelog && (
              <p className="text-xs text-amber-700 mt-0.5 truncate">{updateInfo.changelog}</p>
            )}
          </div>
        </div>
        <button
          onClick={dismissUpdate}
          className="text-amber-400 hover:text-amber-600 flex-shrink-0"
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
          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
        >
          Download
        </a>
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
        >
          {showInstructions ? 'Hide' : 'How to install'}
        </button>
      </div>

      {showInstructions && (
        <ol className="mt-2 ml-4 text-xs text-amber-700 list-decimal space-y-1">
          <li>Click "Download" above to get the .zip file</li>
          <li>Open <code className="bg-amber-100 px-1 rounded">chrome://extensions</code> in a new tab</li>
          <li>Enable "Developer mode" (top right toggle)</li>
          <li>Drag and drop the .zip file onto the extensions page</li>
        </ol>
      )}
    </div>
  );
}

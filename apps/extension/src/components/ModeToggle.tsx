/**
 * Toggle switch between Product and Vendor capture modes
 */

interface ModeToggleProps {
  mode: 'product' | 'vendor';
  onModeChange: (mode: 'product' | 'vendor') => void;
  autoDetected?: boolean;
}

export function ModeToggle({ mode, onModeChange, autoDetected = false }: ModeToggleProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center bg-patina-off-white rounded-lg p-1">
        <button
          onClick={() => onModeChange('product')}
          className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all
                   ${mode === 'product'
                     ? 'bg-white text-patina-charcoal shadow-sm'
                     : 'text-patina-mocha-brown hover:text-patina-charcoal'
                   }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            Product
          </div>
        </button>
        <button
          onClick={() => onModeChange('vendor')}
          className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all
                   ${mode === 'vendor'
                     ? 'bg-white text-patina-charcoal shadow-sm'
                     : 'text-patina-mocha-brown hover:text-patina-charcoal'
                   }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            Vendor
          </div>
        </button>
      </div>

      {/* Auto-detected indicator */}
      {autoDetected && (
        <div className="flex items-center justify-center gap-1 text-xs text-patina-mocha-brown/70">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Auto-detected
        </div>
      )}
    </div>
  );
}

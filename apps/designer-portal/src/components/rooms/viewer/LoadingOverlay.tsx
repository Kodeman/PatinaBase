'use client';

import { useViewerStore } from '@/stores/viewer-store';
import { clsx } from 'clsx';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { StrataMark } from '@/components/document/strata-mark';

const loadingMessages: Record<string, string> = {
  idle: 'Initializing...',
  wireframe: 'Loading wireframe...',
  lowpoly: 'Loading geometry...',
  full: 'Loading textures...',
  complete: 'Ready',
  error: 'Failed to load model',
};

export function LoadingOverlay() {
  const { loadingState, loadingProgress, loadingError } = useViewerStore();

  const message = loadingMessages[loadingState] || 'Loading...';

  return (
    <div className="absolute inset-0 bg-patina-charcoal/80 backdrop-blur-sm flex items-center justify-center z-10">
      <div className="text-center">
        {loadingState === 'error' ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <h3 className="text-lg font-medium text-red-400 mb-2">
              {message}
            </h3>
            <p className="text-sm text-white/60 max-w-sm">
              {loadingError || 'An unexpected error occurred while loading the 3D model.'}
            </p>
          </>
        ) : (
          <>
            {/* R35: the Strata sweep replaces the spinner — the scan
                accumulating, line by line. On complete it settles to a full
                static mark. The % rides beneath. */}
            <div className="mb-4 flex flex-col items-center gap-2">
              {loadingState === 'complete' ? (
                <StrataMark size="md" fill={[1, 1, 1]} ground="dark" />
              ) : (
                <StrataSweep size="md" ground="dark" label={message} />
              )}
              {loadingProgress > 0 && (
                <div className="font-mono text-xs font-medium text-white">
                  {Math.round(loadingProgress)}%
                </div>
              )}
            </div>

            <h3 className="text-lg font-medium text-white mb-1">
              {message}
            </h3>

            {/* Progress bar */}
            {loadingProgress > 0 && loadingState !== 'complete' && (
              <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden mx-auto mt-3">
                <div
                  className="h-full rounded-full bg-[var(--color-clay)] transition-all duration-300"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
            )}

            {/* Loading stage indicators */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {['wireframe', 'lowpoly', 'full', 'complete'].map((stage, index) => {
                const stages = ['wireframe', 'lowpoly', 'full', 'complete'];
                const currentIndex = stages.indexOf(loadingState);
                const isActive = index <= currentIndex;
                const isCurrent = stage === loadingState;

                return (
                  <div
                    key={stage}
                    className={clsx(
                      'w-2 h-2 rounded-full transition-colors',
                      isActive ? 'bg-[var(--color-clay)]' : 'bg-white/20',
                      isCurrent && 'animate-pulse'
                    )}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

export function ClientViewerLoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-patina-charcoal/80 backdrop-blur-sm z-10">
      <div className="text-center">
        <div className="relative mx-auto mb-3 h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div
            className="absolute inset-0 animate-spin rounded-full border-4 border-t-[var(--accent-primary)]"
            style={{ animationDuration: '1s' }}
          />
        </div>
        <p className="text-sm text-white/80">Loading 3D model…</p>
      </div>
    </div>
  );
}

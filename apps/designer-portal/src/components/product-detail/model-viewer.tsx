'use client';

/**
 * 3D Model Viewer placeholder.
 *
 * @react-three/fiber v8 is incompatible with React 19.
 * Once upgraded to R3F v9+ (React 19 support), swap this placeholder
 * for the real Three.js Canvas implementation.
 *
 * The component API is stable — glbUrl + usdzUrl — so the swap is seamless.
 */

interface ModelViewerProps {
  glbUrl: string;
  usdzUrl?: string;
}

export function ModelViewer({ glbUrl, usdzUrl }: ModelViewerProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Gradient background matching design spec */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-[#f0ede8] via-[#e8e4de] to-[#f5f2ed]" />

      {/* Label */}
      <div className="z-10 text-center">
        <span className="font-mono text-[0.75rem] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Interactive 3D Model
        </span>
        <span className="mt-1 block font-body text-[0.72rem] text-[var(--text-body)]">
          Drag to orbit · Pinch to zoom · Double-tap to reset
        </span>
        <span className="mt-2 block font-mono text-[0.55rem] uppercase tracking-[0.04em] text-[var(--color-golden-hour)]">
          3D viewer requires R3F v9+ (React 19)
        </span>
      </div>

      {/* Controls bar */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3 rounded-full bg-[rgba(44,41,38,0.6)] px-4 py-2 backdrop-blur-sm">
        {['Orbit', 'Zoom', 'Details', 'Underside'].map((label, i) => (
          <span
            key={label}
            className={`font-mono text-[0.55rem] uppercase tracking-[0.04em] ${
              i === 0 ? 'text-white' : 'text-[rgba(255,255,255,0.6)]'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      {/* AR button */}
      {usdzUrl && (
        <a
          rel="ar"
          href={usdzUrl}
          className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded bg-[var(--accent-primary)] px-4 py-2 font-body text-[0.72rem] font-medium text-white no-underline"
        >
          ◇ View in AR
        </a>
      )}

      {/* Suppress unused warning */}
      <span className="hidden">{glbUrl}</span>
    </div>
  );
}

'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// global-error.tsx replaces the ENTIRE root layout (it must render its own
// <html>/<body>), so it cannot rely on the root layout's globals.css import
// having run — the CSS custom properties defined there (var(--bg-primary),
// var(--text-primary), etc.) and the Tailwind-compiled bg-patina-* utility
// classes may not be available. Colors are hardcoded here to the same brand
// values (see apps/client-portal/src/app/globals.css) via inline styles so
// this last-resort screen always renders correctly regardless of whether the
// rest of the app's styling loaded.
const COLORS = {
  background: '#FAF7F2', // --color-off-white
  text: '#2C2926', // --color-charcoal
  muted: '#8B7355', // --color-aged-oak
  border: '#E5E2DD', // --color-pearl
  accent: '#2C2926', // --color-charcoal (button)
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          backgroundColor: COLORS.background,
          color: COLORS.text,
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <style>{`
          .global-error-actions { display: flex; flex-direction: column; gap: 12px; align-items: center; }
          @media (min-width: 640px) {
            .global-error-actions { flex-direction: row; justify-content: center; }
          }
        `}</style>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
          }}
        >
          <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: COLORS.text }}>
                Something went wrong
              </h1>
              <p style={{ marginTop: 8, fontSize: 16, lineHeight: 1.6, color: COLORS.muted }}>
                Something went wrong with the application. Please try again, or reload the page.
              </p>
            </div>

            {error.digest && (
              <div
                style={{
                  marginTop: 24,
                  borderLeft: `2px solid ${COLORS.border}`,
                  paddingLeft: 16,
                  textAlign: 'left',
                }}
              >
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: COLORS.muted }}>
                  Error Reference
                </p>
                <p
                  style={{
                    marginTop: 4,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: COLORS.muted,
                  }}
                >
                  {error.digest}
                </p>
              </div>
            )}

            <div className="global-error-actions" style={{ marginTop: 24 }}>
              <button
                onClick={reset}
                style={{
                  borderRadius: 3,
                  backgroundColor: COLORS.accent,
                  color: '#FFFFFF',
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <button
                onClick={() => {
                  window.location.href = '/';
                }}
                style={{
                  borderRadius: 3,
                  backgroundColor: 'transparent',
                  color: COLORS.text,
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  border: `1px solid ${COLORS.border}`,
                  cursor: 'pointer',
                }}
              >
                Reload application
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <details
                style={{
                  marginTop: 24,
                  borderTop: `1px solid ${COLORS.border}`,
                  paddingTop: 16,
                  textAlign: 'left',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 12, color: COLORS.muted }}>
                  Error details (development only)
                </summary>
                <pre
                  style={{
                    marginTop: 8,
                    overflow: 'auto',
                    fontSize: 12,
                    color: COLORS.muted,
                  }}
                >
                  {error.stack || error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}

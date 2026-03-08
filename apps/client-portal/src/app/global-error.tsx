'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-gray-50">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-gray-900">
                Application Error
              </h1>
              <p className="text-lg text-gray-600">
                Something went wrong with the application. Please refresh the page.
              </p>
            </div>

            {error.digest && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
                <p className="font-medium">Error Reference</p>
                <p className="mt-1 font-mono text-xs">{error.digest}</p>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={reset}
                className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Reload application
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <details className="mt-6 rounded-lg bg-gray-100 p-4 text-left">
                <summary className="cursor-pointer font-medium text-gray-900">
                  Error details (development only)
                </summary>
                <pre className="mt-2 overflow-auto text-xs text-gray-700">
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

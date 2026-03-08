'use client';

import { useEffect } from 'react';
import { Button } from '@patina/design-system';

interface ProjectsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProjectsError({ error, reset }: ProjectsErrorProps) {
  useEffect(() => {
    console.error('Projects page error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="font-[var(--font-playfair)] text-4xl text-[var(--color-text)]">
            Unable to load projects
          </h1>
          <p className="text-lg text-[var(--color-muted)]">
            We&rsquo;re having trouble loading your projects. This might be a temporary issue.
          </p>
        </div>

        {error.digest && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Error Reference</p>
            <p className="mt-1 font-mono text-xs">{error.digest}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset} variant="default" size="lg">
            Try again
          </Button>
          <Button onClick={() => (window.location.href = '/')} variant="outline" size="lg">
            Go home
          </Button>
        </div>

        <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
          <p className="font-medium">Suggestions:</p>
          <ul className="mt-2 space-y-1 text-left">
            <li>• Check your internet connection</li>
            <li>• Try refreshing the page</li>
            <li>• Contact support if the issue persists</li>
          </ul>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="mt-6 rounded-lg bg-gray-50 p-4 text-left">
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
  );
}

/**
 * ErrorFallback Component
 *
 * A styled error state component for displaying errors with retry actions.
 */

'use client';

import React from 'react';
import { Button } from '../Button';

export interface ErrorFallbackProps {
  error?: Error;
  errorMessage?: string;
  title?: string;
  onRetry?: () => void;
  onBack?: () => void;
  showDetails?: boolean;
}

export function ErrorFallback({
  error,
  errorMessage,
  title = 'Something went wrong',
  onRetry,
  onBack,
  showDetails = false,
}: ErrorFallbackProps) {
  const message = errorMessage || error?.message || 'An unexpected error occurred';
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="flex min-h-[400px] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          <p className="text-base text-gray-600">{message}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {onRetry && (
            <Button onClick={onRetry} variant="default" size="lg">
              Try again
            </Button>
          )}
          {onBack && (
            <Button onClick={onBack} variant="outline" size="lg">
              Go back
            </Button>
          )}
        </div>

        {showDetails && error && isDev && (
          <details className="mt-6 rounded-lg bg-gray-50 p-4 text-left">
            <summary className="cursor-pointer text-sm font-medium text-gray-900">
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

export default ErrorFallback;

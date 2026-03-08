'use client';

import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import {
  Button
} from '@patina/design-system';

interface CatalogErrorFallbackProps {
  error?: Error;
  reset?: () => void;
}

/**
 * CatalogErrorFallback Component
 *
 * Specialized error fallback UI for catalog-related errors.
 * Provides helpful context and recovery actions specific to catalog operations.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary fallback={<CatalogErrorFallback error={error} reset={reset} />}>
 *   <CatalogComponent />
 * </ErrorBoundary>
 * ```
 */
export function CatalogErrorFallback({ error, reset }: CatalogErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-8">
      <AlertCircle className="w-16 h-16 text-orange-500 mb-4" />
      <h3 className="text-xl font-semibold mb-2">Failed to load catalog</h3>
      <p className="text-gray-600 mb-4 text-center max-w-md">
        There was an error loading the product catalog. This could be due to:
      </p>
      <ul className="text-sm text-gray-500 mb-6 list-disc list-inside space-y-1">
        <li>Network connectivity issues</li>
        <li>Catalog service temporarily unavailable</li>
        <li>Invalid data format or schema mismatch</li>
        <li>Authentication or permission problems</li>
      </ul>
      {error && (
        <details className="mb-6 max-w-xl w-full">
          <summary className="cursor-pointer text-sm text-gray-500 mb-2 hover:text-gray-700">
            Technical Details
          </summary>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48 border border-gray-200">
            {error.message}
            {error.stack && (
              <>
                {'\n\n'}
                {error.stack}
              </>
            )}
          </pre>
        </details>
      )}
      <div className="flex gap-3">
        {reset && (
          <Button onClick={reset} variant="default" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Reload Page
        </Button>
        <Button
          variant="ghost"
          onClick={() => (window.location.href = '/dashboard')}
          className="gap-2"
        >
          <Home className="w-4 h-4" />
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

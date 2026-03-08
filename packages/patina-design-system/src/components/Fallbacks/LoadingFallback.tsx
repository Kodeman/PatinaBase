/**
 * LoadingFallback Component
 *
 * A styled loading state component with spinner animation.
 */

'use client';

import React from 'react';

export interface LoadingFallbackProps {
  message?: string;
}

export function LoadingFallback({ message = 'Loading...' }: LoadingFallbackProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center px-6 py-12">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        <p className="text-lg text-gray-600">{message}</p>
      </div>
    </div>
  );
}

export default LoadingFallback;

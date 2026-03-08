/**
 * EmptyStateFallback Component
 *
 * A styled empty state component for when there's no data to display.
 */

'use client';

import React from 'react';
import { Button } from '../Button';

export interface EmptyStateFallbackProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyStateFallback({
  title = 'No data available',
  message = "There's nothing here yet",
  actionLabel,
  onAction,
}: EmptyStateFallbackProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg
              className="h-8 w-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>

          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          <p className="text-base text-gray-600">{message}</p>
        </div>

        {actionLabel && onAction && (
          <Button onClick={onAction} variant="default" size="lg">
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export default EmptyStateFallback;

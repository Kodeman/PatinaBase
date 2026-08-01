'use client';

import { DocumentAction, DocumentActionGroup } from '../document-action';

export function AccountsQueryFailure({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => unknown;
}) {
  return (
    <div
      role="alert"
      data-testid="accounts-query-failure"
      className="my-5 border-l-2 border-[var(--color-terracotta)] bg-[rgba(212,160,144,0.08)] px-4 py-3"
    >
      <p className="font-heading text-[14px] italic text-[var(--color-charcoal)]">
        {title}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-aged-oak)]">
        {message}
      </p>
      <DocumentActionGroup
        surfaceKey="accounts"
        regionKey="query-failure"
        className="mt-3"
      >
        <DocumentAction
          actionKey="retry-accounts-query"
          variant="primary"
          onClick={() => void onRetry()}
        >
          Try again
        </DocumentAction>
      </DocumentActionGroup>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { DocumentAction } from './document-action';
import { HELP_EVENTS, safeCapture } from '@/lib/help-system/help-events';

const EMPTY_STATE_SURFACE_KEY = 'open-document';
const EMPTY_STATE_REGION_KEY = 'guided-empty-state';

type EmptyAction =
  | { key: string; label: string; href: string; onClick?: never }
  | { key: string; label: string; onClick: () => void; href?: never };

export function GuidedEmptyState({
  title,
  description,
  inputs,
  action,
  secondary,
  className = '',
}: {
  title: string;
  description: string;
  inputs: string[];
  action: EmptyAction;
  secondary?: EmptyAction;
  className?: string;
}) {
  const actionProps = {
    actionKey: action.key,
    surfaceKey: EMPTY_STATE_SURFACE_KEY,
    regionKey: EMPTY_STATE_REGION_KEY,
    variant: 'primary' as const,
  };

  // Onboarding Wave 1 (L6) — the taxonomy existed but no call site fired it
  // (synthesis §10, UNVERIFIED). Once per mount, via the guarded helper.
  useEffect(() => {
    safeCapture(HELP_EVENTS.EMPTY_STATE_SHOWN, {
      surface_key: EMPTY_STATE_SURFACE_KEY,
      region_key: EMPTY_STATE_REGION_KEY,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`border-y border-dashed border-[var(--color-pearl)] py-5 ${className}`}>
      <p className="font-heading text-[15px] font-medium text-[var(--color-charcoal)]">{title}</p>
      <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-[var(--text-muted)]">{description}</p>
      {inputs.length > 0 && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          Start with · {inputs.join(' · ')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {'href' in action ? (
          <DocumentAction {...actionProps} href={action.href}>{action.label}</DocumentAction>
        ) : (
          <DocumentAction {...actionProps} onClick={action.onClick}>{action.label}</DocumentAction>
        )}
        {secondary && ('href' in secondary ? (
          <DocumentAction actionKey={secondary.key} surfaceKey="open-document" regionKey="guided-empty-state" variant="secondary" href={secondary.href}>{secondary.label}</DocumentAction>
        ) : (
          <DocumentAction actionKey={secondary.key} surfaceKey="open-document" regionKey="guided-empty-state" variant="secondary" onClick={secondary.onClick}>{secondary.label}</DocumentAction>
        ))}
      </div>
    </div>
  );
}

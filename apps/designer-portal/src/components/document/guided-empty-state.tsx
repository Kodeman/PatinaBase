'use client';

import { DocumentAction } from './document-action';

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
    surfaceKey: 'open-document',
    regionKey: 'guided-empty-state',
    variant: 'primary' as const,
  };
  return (
    <div className={`border-y border-dashed border-[var(--color-pearl)] py-5 ${className}`}>
      <p className="font-heading text-[15px] font-medium text-[var(--color-charcoal)]">{title}</p>
      <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-[var(--text-muted)]">{description}</p>
      {inputs.length > 0 && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
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

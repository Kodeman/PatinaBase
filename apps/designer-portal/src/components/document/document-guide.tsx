'use client';

import { DocumentAction } from './document-action';
import { useMobilePrimaryAction } from './mobile/mobile-shell';
import type { DocumentGuideModel } from '@/lib/document/document-guide';
import { documentEvents } from '@/lib/analytics/document-events';
import { useEffect } from 'react';

export function DocumentGuide({ model, onActivate }: { model: DocumentGuideModel; onActivate: () => void }) {
  const href = model.action?.destination.kind === 'href' ? model.action.destination.href : null;
  useMobilePrimaryAction(
    model.action
      ? {
          actionKey: model.action.key,
          surfaceKey: 'open-document',
          regionKey: 'next-up',
          label: model.action.label,
          target: href ? { kind: 'href', href } : { kind: 'press', onPress: onActivate },
        }
      : null,
    { priority: 100 },
  );
  useEffect(() => {
    documentEvents.guideShown({
      stage: model.stage,
      state: model.state,
      action_key: model.action?.key ?? null,
      input_count: (model.topInput ? 1 : 0) + model.remainingInputCount,
    });
  }, [model.action?.key, model.remainingInputCount, model.stage, model.state, model.topInput]);

  return (
    <section aria-labelledby="document-next-up" className="my-5 border-y border-[var(--color-pearl)] py-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.09em] text-[var(--color-clay)]">{model.eyebrow}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="document-next-up" className="font-heading text-[19px] font-medium text-[var(--color-charcoal)]">{model.headline}</h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--text-muted)]">{model.reason}</p>
          {model.topInput && (
            <p className="mt-2 text-[11px] text-[var(--color-charcoal)]">
              <span className="font-medium">Input needed:</span> {model.topInput.label} · {model.topInput.owner}
              <span className="text-[var(--text-muted)]"> · blocks {model.topInput.blocks}</span>
              {model.remainingInputCount > 0 && <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)]"> · + {model.remainingInputCount} more</span>}
            </p>
          )}
        </div>
        {model.action && (
          <div className="hidden min-[1180px]:block">
            {href ? (
              <DocumentAction actionKey={model.action.key} surfaceKey="open-document" regionKey="next-up" variant="primary" href={href}>{model.action.label}</DocumentAction>
            ) : (
              <DocumentAction actionKey={model.action.key} surfaceKey="open-document" regionKey="next-up" variant="primary" onClick={onActivate}>{model.action.label}</DocumentAction>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

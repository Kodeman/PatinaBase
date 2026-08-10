'use client';

import { DocumentAction } from './document-action';
import { useMobilePrimaryAction } from './mobile/mobile-shell';
import type { DocumentGuideModel } from '@/lib/document/document-guide';
import { documentEvents } from '@/lib/analytics/document-events';
import React, { useEffect } from 'react';
import { MOBILE_ACTION_PRIORITY } from './mobile/lifecycle-mobile-action';

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
    { priority: MOBILE_ACTION_PRIORITY.guide },
  );
  useEffect(() => {
    documentEvents.guideShown({
      stage: model.stage,
      state: model.state,
      action_key: model.action?.key ?? null,
    });
  }, [model.action?.key, model.stage, model.state]);

  return (
    <section aria-labelledby="document-next-up" className="my-5 border-y border-[var(--color-pearl)] py-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.09em] text-[var(--color-clay)]">{model.eyebrow}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="document-next-up" className="font-heading text-[19px] font-medium text-[var(--color-charcoal)]">{model.headline}</h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--text-muted)]">{model.reason}</p>
          {model.topInput && (
            <p className="mt-2 text-[11px] text-[var(--color-charcoal)]">
              <span className="font-medium">Input needed · {model.topInput.label}</span>
              <span className="text-[var(--text-muted)]">
                {' '}· {model.topInput.owner} · blocks {model.topInput.blocks}
                {model.remainingInputCount > 0 ? ` · +${model.remainingInputCount} more` : ''}
              </span>
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
      <GuideAnnouncement
        announcementKey={`${model.state}:${model.headline}:${model.action?.key ?? 'none'}`}
        headline={model.headline}
      />
    </section>
  );
}

function GuideAnnouncement({
  announcementKey,
  headline,
}: {
  announcementKey: string;
  headline: string;
}) {
  const previousKey = React.useRef(announcementKey);
  const [announcement, setAnnouncement] = React.useState('');
  useEffect(() => {
    if (previousKey.current === announcementKey) return;
    previousKey.current = announcementKey;
    setAnnouncement(`Next up: ${headline}`);
  }, [announcementKey, headline]);
  return <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>;
}

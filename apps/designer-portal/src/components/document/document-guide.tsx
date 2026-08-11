'use client';

import { DocumentAction } from './document-action';
import { useMobilePrimaryAction } from './mobile/mobile-shell';
import type { DocumentGuideModel } from '@/lib/document/document-guide';
import { documentEvents } from '@/lib/analytics/document-events';
import React, { useEffect, useRef } from 'react';
import { MOBILE_ACTION_PRIORITY } from './mobile/lifecycle-mobile-action';

export function DocumentGuide({ model, onActivate }: { model: DocumentGuideModel; onActivate: () => void }) {
  const href = model.action?.destination.kind === 'href' ? model.action.destination.href : null;
  const inputCount = model.topInput ? model.remainingInputCount + 1 : 0;

  // Guidance enriches in place: a locally derived anchor action can become a
  // link (or the reverse) once the Desk composition lands. React renders those
  // as different elements, so the old one unmounts and focus falls to <body>.
  // A designer who had tabbed to the action keeps it.
  const actionIdentity = model.action ? `${model.action.key}:${href ? 'href' : 'press'}` : null;
  const actionRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const focusedIdentityRef = useRef<string | null>(null);
  const previousIdentityRef = useRef<string | null>(actionIdentity);
  const holdFocus = () => {
    focusedIdentityRef.current = actionIdentity;
  };

  useEffect(() => {
    const previous = previousIdentityRef.current;
    previousIdentityRef.current = actionIdentity;
    if (previous === actionIdentity) return;
    if (!actionIdentity || focusedIdentityRef.current !== previous) return;
    // Only reclaim focus the swap itself dropped — if the designer has since
    // moved to another control, activeElement is that control, not <body>.
    if (document.activeElement !== document.body) return;
    actionRef.current?.focus();
    focusedIdentityRef.current = actionIdentity;
  }, [actionIdentity]);
  const recordSelection = () => {
    if (!model.action) return;
    documentEvents.guideSelected({
      stage: model.stage,
      state: model.state,
      action_key: model.action.key,
      input_count: inputCount,
    });
  };
  useMobilePrimaryAction(
    model.action
      ? {
          actionKey: model.action.key,
          surfaceKey: 'open-document',
          regionKey: 'next-up',
          label: model.action.label,
          target: href ? { kind: 'href', href } : { kind: 'press', onPress: onActivate },
          onSelected: recordSelection,
        }
      : null,
    { priority: MOBILE_ACTION_PRIORITY.guide },
  );
  useEffect(() => {
    documentEvents.guideShown({
      stage: model.stage,
      state: model.state,
      action_key: model.action?.key ?? null,
      input_count: inputCount,
    });
  }, [inputCount, model.action?.key, model.stage, model.state]);

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
              <DocumentAction ref={actionRef} onFocus={holdFocus} actionKey={model.action.key} surfaceKey="open-document" regionKey="next-up" variant="primary" href={href} onClick={recordSelection}>{model.action.label}</DocumentAction>
            ) : (
              <DocumentAction ref={actionRef} onFocus={holdFocus} actionKey={model.action.key} surfaceKey="open-document" regionKey="next-up" variant="primary" onClick={() => { recordSelection(); onActivate(); }}>{model.action.label}</DocumentAction>
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

'use client';

/**
 * The Terms agreement body (R85 · PRO-07) — the free-text agreement prose that
 * rides ABOVE the structured change-order terms in the Drafting Room's Terms
 * facet. It persists to `proposal_sections.body` (type='terms'), the SAME row
 * the client's proposal copy already renders (proposal-document.tsx renders
 * `section.body` for the terms section) — so what the designer writes here is
 * exactly what the client reads. The structured ChangeOrderTermsEditor stays
 * beside it untouched; this is additive prose, not a replacement.
 *
 * Paper grammar (ChangeOrderTermsEditor's rhythm), self-saving (debounced),
 * failures render inline (R83 — no toast; the mutation carries
 * meta.errorSurface='inline').
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/controls';
import {
  useProposalSections,
  useUpsertProposalSection,
  type ProposalSection,
} from '@patina/supabase';

const TERMS_TITLE = 'Terms & Agreement';

export function TermsAgreementBody({ proposalId }: { proposalId: string }) {
  const { data: sections, isLoading } = useProposalSections(proposalId);
  const upsert = useUpsertProposalSection({ errorSurface: 'inline' });

  const termsSection: ProposalSection | undefined = (sections ?? []).find(
    (s) => s.type === 'terms',
  );

  const [body, setBody] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the local draft once the server row loads (or once we know there is none).
  useEffect(() => {
    if (initialized || isLoading) return;
    setBody(termsSection?.body ?? '');
    setInitialized(true);
  }, [initialized, isLoading, termsSection?.body]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(
    (next: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setError(null);
        upsert.mutate(
          {
            id: termsSection?.id,
            proposalId,
            type: 'terms',
            title: termsSection?.title ?? TERMS_TITLE,
            body: next,
          },
          {
            onError: (e) =>
              setError(e instanceof Error ? e.message : 'Could not save the agreement text.'),
          },
        );
      }, 800);
    },
    [upsert, proposalId, termsSection?.id, termsSection?.title],
  );

  // Flush a pending save on unmount so a fast exit never drops the last keystrokes.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onChange = (next: string) => {
    setBody(next);
    save(next);
  };

  return (
    <div className="mb-8">
      <div className="mb-1.5 flex items-baseline justify-between">
        <label
          htmlFor={`terms-body-${proposalId}`}
          className="font-body text-[0.78rem] font-medium text-[var(--text-primary)]"
        >
          Agreement
        </label>
        <span className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Reaches the client&apos;s copy
        </span>
      </div>
      <Textarea
        id={`terms-body-${proposalId}`}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={7}
        placeholder="The agreement text the client reads and signs — scope of services, ownership, cancellation, whatever this engagement needs. Saved as you write."
      />
      <span className="mt-1 block font-body text-[0.68rem] text-[var(--text-muted)]">
        Free-form prose above the structured change-order terms below. Both are part of the
        proposal the client signs.
      </span>
      {error && (
        <div
          role="alert"
          className="mt-2 rounded-[3px] border border-[var(--color-terracotta,#c77b6e)] bg-[rgba(199,123,110,0.06)] px-2.5 py-1.5 text-[0.7rem] leading-snug text-[var(--color-terracotta,#c77b6e)]"
        >
          {error} <span className="opacity-80">Keep typing to retry.</span>
        </div>
      )}
    </div>
  );
}

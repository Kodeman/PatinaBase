'use client';

import { useState } from 'react';
import { useApplyDecisionOverride } from '@patina/supabase';
import type {
  ClientDecision,
  ClientDecisionOption,
  ConsentMethod,
} from '@patina/supabase';

interface OverrideDecisionModalProps {
  decision: ClientDecision;
  options: ClientDecisionOption[];
  onClose: () => void;
}

const CONSENT_METHODS: { value: ConsentMethod; label: string }[] = [
  { value: 'verbal', label: 'Verbal' },
  { value: 'written', label: 'Written' },
  { value: 'text_excerpt', label: 'Text excerpt' },
  { value: 'email_excerpt', label: 'Email excerpt' },
];

export function OverrideDecisionModal({
  decision,
  options,
  onClose,
}: OverrideDecisionModalProps) {
  const apply = useApplyDecisionOverride();

  const sortedOptions = [...options].sort((a, b) => a.sort_order - b.sort_order);
  const recommendedId =
    decision.recommended_option_id ??
    sortedOptions.find((o) => o.is_recommended)?.id ??
    sortedOptions[0]?.id ??
    '';

  const [optionId, setOptionId] = useState<string>(recommendedId);
  const [consentMethod, setConsentMethod] = useState<ConsentMethod>('verbal');
  const [consentEvidence, setConsentEvidence] = useState('');
  const [error, setError] = useState<string | null>(null);

  const evidenceOk = consentEvidence.trim().length >= 10;
  const canSubmit = !!optionId && evidenceOk && !apply.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await apply.mutateAsync({
        decisionId: decision.id,
        optionId,
        consentMethod,
        consentEvidence: consentEvidence.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply override');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="type-section-head" style={{ fontSize: '1.2rem' }}>
            Override on client&apos;s behalf
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[1.1rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p
          className="mb-4 type-body"
          style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}
        >
          Records explicit client consent for the audit trail. The selected option will be
          applied and any blocked FF&amp;E will unblock.
        </p>

        <div className="mb-4">
          <div
            className="mb-2"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            Option
          </div>
          <div className="flex flex-col gap-2">
            {sortedOptions.map((opt) => (
              <label
                key={opt.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2"
                style={{
                  borderColor:
                    optionId === opt.id
                      ? 'var(--color-sage)'
                      : 'var(--border-default)',
                  background:
                    optionId === opt.id ? 'rgba(122, 155, 118, 0.04)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="override-option"
                  checked={optionId === opt.id}
                  onChange={() => setOptionId(opt.id)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div
                    className="type-label"
                    style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}
                  >
                    {opt.name}
                    {opt.is_recommended && (
                      <span
                        className="ml-2 rounded-sm px-1.5 py-0.5"
                        style={{
                          fontFamily: 'var(--font-meta)',
                          fontSize: '0.52rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--accent-primary)',
                          background: 'rgba(196, 165, 123, 0.08)',
                        }}
                      >
                        Recommended
                      </span>
                    )}
                  </div>
                  {opt.price != null && (
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        marginTop: 2,
                      }}
                    >
                      ${(opt.price / 100).toFixed(0)}
                      {opt.quantity > 1 ? ` × ${opt.quantity}` : ''}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label
            className="mb-1 block"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            Consent method
          </label>
          <select
            value={consentMethod}
            onChange={(e) => setConsentMethod(e.target.value as ConsentMethod)}
            className="w-full rounded-[3px] border bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
            style={{ borderColor: 'var(--border-default)' }}
          >
            {CONSENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label
            className="mb-1 block"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            Consent evidence
          </label>
          <textarea
            value={consentEvidence}
            onChange={(e) => setConsentEvidence(e.target.value)}
            rows={3}
            placeholder="Client confirmed via SMS at 2:14pm Apr 27"
            className="w-full rounded-[3px] border bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
            style={{ borderColor: 'var(--border-default)' }}
          />
          <p className="mt-1 text-[0.7rem] text-[var(--text-muted)]">
            Required. Minimum 10 characters{' '}
            {consentEvidence.trim().length > 0 && !evidenceOk
              ? `(${consentEvidence.trim().length}/10)`
              : ''}
          </p>
        </div>

        {error && (
          <p
            className="mt-3 rounded-md border-2 p-2 type-body text-[0.8rem]"
            style={{ borderColor: 'var(--color-terracotta, #D4A090)' }}
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
            style={{ borderColor: 'var(--border-default)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-[3px] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
            style={{
              background: canSubmit ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {apply.isPending ? 'Applying…' : 'Apply override'}
          </button>
        </div>
      </div>
    </div>
  );
}

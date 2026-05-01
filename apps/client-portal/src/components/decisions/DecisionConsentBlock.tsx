'use client';

import { useState } from 'react';

interface DecisionConsentBlockProps {
  decisionTitle: string;
  optionName: string;
  busy?: boolean;
  onConfirm: (consent: { method: 'electronic_signature'; signature: string }) => void;
  onCancel: () => void;
}

export function DecisionConsentBlock({
  decisionTitle,
  optionName,
  busy = false,
  onConfirm,
  onCancel,
}: DecisionConsentBlockProps) {
  const [signature, setSignature] = useState('');
  const [agreed, setAgreed] = useState(false);

  const canSubmit = signature.trim().length >= 2 && agreed && !busy;

  return (
    <div
      className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
      data-testid="decision-consent-block"
    >
      <p className="type-meta mb-2 text-[var(--accent-primary)]">Confirm with signature</p>
      <p className="type-body-small mb-4 text-[var(--text-body)]">
        You&rsquo;re selecting <strong>{optionName}</strong> for{' '}
        <strong>{decisionTitle}</strong>. Type your full name below to confirm — this becomes
        a permanent record on the project.
      </p>

      <label className="block">
        <span className="type-meta-small mb-1 block text-[var(--text-muted)]">Full name</span>
        <input
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="Your full name"
          autoComplete="name"
          className="w-full rounded-md border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
          data-testid="decision-consent-signature"
        />
      </label>

      <label className="mt-3 flex items-start gap-2 text-sm text-[var(--text-body)]">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4"
          data-testid="decision-consent-agree"
        />
        <span>
          I authorize this selection and understand it cannot be changed without designer
          approval.
        </span>
      </label>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() =>
            onConfirm({ method: 'electronic_signature', signature: signature.trim() })
          }
          disabled={!canSubmit}
          className="rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          data-testid="decision-consent-confirm"
        >
          {busy ? 'Submitting…' : 'Confirm with signature'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-[3px] border border-[var(--border-default)] px-4 py-2.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

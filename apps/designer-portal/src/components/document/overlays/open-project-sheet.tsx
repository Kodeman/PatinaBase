'use client';

/**
 * OpenProjectSheet (Track 7 · R79) — projects that skip the proposal. The
 * capture-lead-sheet's sibling on the Desk header: a repeat client calls, the
 * work is agreed on a handshake, and the designer opens the project directly —
 * essentials only, then compose in /doc/{id}.
 *
 * Household (ClientPicker — R73 invite-and-link rows are live) · Title ·
 * Budget band · Start date. One RPC — open_project_direct (00237) — inserts
 * the project (status 'active', proposal_id NULL) and ensures/advances the
 * designer↔client relationship in the same transaction (§5). The sheet
 * generates the project id up front so a retried submit can never
 * double-insert.
 *
 * Built on the DocSheet frame (R3 / I5): charcoal D8 overlay, hairline top
 * border, ZERO shadows (D4). An overlay while open — the Desk beneath does not
 * unmount (D1). Failures render inline at the act (R83) — no toasts (D2).
 *
 * The old wizard's Step06 visibility-tier choice moved to a letterhead
 * instrument on the open document (R79); it is deliberately NOT asked here.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClientPicker } from '@/components/portal/client-picker';
import { useOpenProjectDirect } from '@/hooks/use-project-lifecycle';
import { dollarsToCents } from '@/lib/document/closure-derivation';
import { todayYmd } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocSheet } from './doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

export function OpenProjectSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const openProject = useOpenProjectDirect();

  // The retry-safe project id — one per sheet-open (00237 p_id).
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [bandMin, setBandMin] = useState('');
  const [bandMax, setBandMax] = useState('');
  const [startDate, setStartDate] = useState(todayYmd());
  const [dateValid, setDateValid] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fresh form (and a fresh retry-id) every open; clear any prior error.
  useEffect(() => {
    if (open) {
      setProjectId(crypto.randomUUID());
      setClientId(null);
      setTitle('');
      setBandMin('');
      setBandMax('');
      setStartDate(todayYmd());
      setDateValid(true);
      setError(null);
    }
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!dateValid) {
      setError('Enter a valid start date in MM/DD/YYYY format.');
      return;
    }

    const min = dollarsToCents(bandMin);
    const max = dollarsToCents(bandMax);
    if (min != null && max != null && min > max) {
      setError(
        'The budget band reads backwards — the floor is above the ceiling.',
      );
      return;
    }

    openProject.mutate(
      {
        id: projectId,
        title: title.trim(),
        clientId,
        budgetMinCents: min,
        budgetMaxCents: max,
        startDate: startDate || null,
      },
      {
        onSuccess: (newId) => {
          onClose();
          router.push(`/doc/${newId}`);
        },
        onError: (err: Error) => {
          setError(err.message ?? 'Could not open the project. Try again.');
        },
      },
    );
  };

  return (
    <DocSheet open={open} onClose={onClose} title="Open a project">
      <form onSubmit={submit} className="mx-auto w-full max-w-[34rem]">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-clay)]">
          New project · no proposal needed
        </span>
        <h2 className="mt-2 font-heading text-[1.5rem] italic text-[var(--color-charcoal)]">
          What are you opening?
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-aged-oak)]">
          Essentials only — the document fills in as you compose. Everything
          here can change from the letterhead later.
        </p>

        <div className="mt-7 space-y-5">
          <Field label="Title">
            <Input
              autoFocus
              value={title}
              onChange={setTitle}
              placeholder="e.g. Marlowe lake house refresh"
            />
          </Field>

          <Field label="Household">
            {/* The R73 picker: linked clients select directly; captured
                households with an email invite-and-link in place. Optional —
                the household sheet can set it later. */}
            <ClientPicker
              value={clientId}
              onChange={setClientId}
              placeholder="Who is this for? (optional)"
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Budget band">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] text-[var(--color-aged-oak)]">
                  $
                </span>
                <Input
                  value={bandMin}
                  onChange={setBandMin}
                  placeholder="from"
                  inputMode="decimal"
                />
                <span className="text-[13px] text-[var(--color-aged-oak)]">
                  –
                </span>
                <Input
                  value={bandMax}
                  onChange={setBandMax}
                  placeholder="to"
                  inputMode="decimal"
                />
              </div>
            </Field>
            <Field label="Start date">
              <DateTextInput
                value={startDate}
                onChange={(value) => setStartDate(value ?? '')}
                ariaLabel="Start date"
                onValidityChange={setDateValid}
                className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 font-mono text-[12px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
              />
            </Field>
          </div>
        </div>

        {error && (
          <p
            className="mt-5 text-[12px] text-[var(--color-terracotta)]"
            role="alert"
          >
            {error}
          </p>
        )}

        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="open-project-sheet"
          className="mt-8"
          aria-label="Open project actions"
        >
          <DocumentAction
            actionKey="create-project"
            variant="primary"
            type="submit"
            disabled={!title.trim() || !dateValid}
            loading={openProject.isPending}
            loadingLabel="Opening…"
            trailing="→"
          >
            Open the project
          </DocumentAction>
          <DocumentAction
            actionKey="cancel-open-project"
            variant="tertiary"
            onClick={onClose}
          >
            Cancel
          </DocumentAction>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            opens the document
          </span>
        </DocumentActionGroup>
      </form>
    </DocSheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  autoFocus,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputMode?: 'decimal';
}) {
  return (
    <input
      type="text"
      autoFocus={autoFocus}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 text-[14px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
    />
  );
}

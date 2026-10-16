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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganizations } from '@patina/supabase';
import { ClientPicker } from '@/components/portal/client-picker';
import { useOpenProjectDirect } from '@/hooks/use-project-lifecycle';
import { dollarsToCents } from '@/lib/document/closure-derivation';
import {
  activeDesignStudios,
  type ComposerStudio,
} from '@/lib/document/invoice-composer';
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
  // K9 (00796) — which studio the project belongs to, asked only when there is
  // a choice; one studio is stamped by the server as before.
  const { data: organizations } = useOrganizations();
  const studios = useMemo(
    () => activeDesignStudios((organizations ?? []) as ComposerStudio[]),
    [organizations],
  );
  const multiStudio = studios.length > 1;
  const [studioId, setStudioId] = useState('');
  const studioRef = useRef<HTMLSelectElement>(null);

  // Fresh form (and a fresh retry-id) every open; clear any prior error.
  useEffect(() => {
    if (open) {
      setProjectId(crypto.randomUUID());
      setStudioId('');
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
    if (multiStudio && !studioId) {
      setError('Choose the studio this project belongs to.');
      studioRef.current?.focus();
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
        ...(multiStudio ? { studioId } : {}),
      },
      {
        onSuccess: (newId) => {
          onClose();
          router.push(`/doc/${newId}`);
        },
        onError: (err: Error) => {
          setError(openProjectRefusal(err?.message));
        },
      },
    );
  };

  return (
    <DocSheet open={open} onClose={onClose} title="Create a project file">
      <form onSubmit={submit} className="mx-auto w-full max-w-[34rem]">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-clay-ink)]">
          Direct project setup
        </span>
        <h2 className="mt-2 font-heading text-[1.5rem] italic text-[var(--color-charcoal)]">
          New project details
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-aged-oak)]">
          Set up the project essentials. Edit these details from the project header later.
        </p>

        <div className="mt-7 space-y-5">
          <Field label="Project title">
            <Input
              autoFocus
              value={title}
              onChange={setTitle}
              placeholder="e.g. Marlowe lake house refresh"
            />
          </Field>

          {multiStudio && (
            <Field label="Studio">
              <select
                ref={studioRef}
                aria-required="true"
                value={studioId}
                onChange={(e) => setStudioId(e.target.value)}
                className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 text-[14px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
              >
                <option value="">Choose a studio</option>
                {studios.map((studio) => (
                  <option key={studio.id} value={studio.id}>
                    {studio.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Client">
            {/* The R73 picker: linked clients select directly; a captured
                household with an email arms an invite that only sends on an
                explicit confirm (J2). Optional — the household sheet can set
                it later. */}
            <ClientPicker
              value={clientId}
              onChange={setClientId}
              placeholder="Select client (optional)"
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Project budget range">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] text-[var(--color-aged-oak)]">
                  $
                </span>
                <Input
                  value={bandMin}
                  onChange={setBandMin}
                  placeholder="Lower budget"
                  inputMode="decimal"
                />
                <span className="text-[13px] text-[var(--color-aged-oak)]">
                  –
                </span>
                <Input
                  value={bandMax}
                  onChange={setBandMax}
                  placeholder="Upper budget"
                  inputMode="decimal"
                />
              </div>
            </Field>
            <Field label="Project start date">
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
            className="mt-5 text-[12px] text-[var(--color-terracotta-ink)]"
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
            loadingLabel="Creating project file…"
            trailing="→"
          >
            Create project file
          </DocumentAction>
          <DocumentAction
            actionKey="cancel-open-project"
            variant="tertiary"
            onClick={onClose}
          >
            Cancel
          </DocumentAction>
          <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            Creates and opens the project file
          </span>
        </DocumentActionGroup>
      </form>
    </DocSheet>
  );
}

/** The refusal in words; a raw server or trigger message is never printed. */
function openProjectRefusal(message: unknown): string {
  const text = typeof message === 'string' ? message : '';
  if (/studio_not_member/.test(text)) {
    return "You don't hold a seat in that studio. Choose another.";
  }
  if (/studio_id_not_designer_studio/.test(text)) {
    return 'You belong to more than one studio. Choose the one this project belongs to.';
  }
  if (/requires an authenticated user/.test(text)) {
    return "You're signed out. Sign in again to create the project file.";
  }
  return "The project file couldn't be created. Try again.";
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
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
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

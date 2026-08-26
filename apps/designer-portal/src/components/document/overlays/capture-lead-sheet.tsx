'use client';

/**
 * CaptureLeadSheet (Track 6 · G1 capture · R62 + R65) — the Desk-native front
 * door for a new lead. A captured `leads` row surfaces immediately as a Brief
 * folder on the Desk (`document_state` Shape C); this sheet is the ≤5s way to
 * be the one who starts it.
 *
 * "Just enough to begin. The Brief fills in as you go." (prototype §captureScrim)
 * Name · Contact (email or phone) · The project (one line) · Where from.
 *
 * Built on the DocSheet frame (R3 / I5): charcoal D8 overlay, hairline top
 * border, ZERO shadows (D4). An overlay while open — the Desk beneath does not
 * unmount (D1).
 *
 * R62: `response_deadline` defaults to +1 day so the new lead rises as a
 * `new_lead` need on the Desk.
 * R65: on submit the capture **opens the new Brief** (`/doc/{leadId}`) so the
 * designer keeps filling it in the document; the **"Where from" field is free
 * text with suggestion chips**, stored in the canonical `leads.source` column
 * (00223) so People's pipeline / referral stats stay clean.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateLead } from '@patina/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { DocSheet } from './doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

/** R65 — quick suggestion chips for "Where from". Clicking one fills the
 *  free-text field with a canonical label; the designer can also type any
 *  channel. The chosen string lands in `leads.source` (00223). */
const SOURCE_CHIPS = [
  'Referral',
  'Website quiz',
  'Instagram',
  'Past client',
] as const;

/** Cheap email vs phone discrimination. The table carries `contact_email` only
 *  (no phone column); a phone is preserved in the Brief one-liner instead of
 *  being written to a column that doesn't exist. */
function looksLikeEmail(v: string): boolean {
  return /\S+@\S+\.\S+/.test(v.trim());
}

export function CaptureLeadSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const createLead = useCreateLead();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [project, setProject] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ name: false, project: false });

  // Fresh form every open; clear any prior error.
  useEffect(() => {
    if (open) {
      setName('');
      setContact('');
      setProject('');
      setSource('');
      setError(null);
      setTouched({ name: false, project: false });
    }
  }, [open]);

  const nameMissing = name.trim() === '';
  const projectMissing = project.trim() === '';
  const canSubmit = !nameMissing && !projectMissing;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) {
      setTouched({ name: true, project: true });
      setError('Add a name and a one-line project note before beginning the Brief.');
      return;
    }

    const trimmedContact = contact.trim();
    const contactIsEmail =
      trimmedContact !== '' && looksLikeEmail(trimmedContact);

    // The Brief one-liner carries the project line and any non-email contact
    // (phone) — the table has no `phone` column, so it lives honestly in the
    // description. The source now has its own column (R65), so it's no longer
    // folded into the one-liner.
    const descParts: string[] = [];
    if (project.trim()) descParts.push(project.trim());
    if (trimmedContact && !contactIsEmail)
      descParts.push(`Contact: ${trimmedContact}`);
    const description = descParts.join(' · ');

    createLead.mutate(
      {
        // The table requires project_type (NOT NULL). A captured front-door
        // lead has no type chosen yet — 'consultation' is the honest default
        // for "someone just came in"; the Brief refines it as the work begins.
        project_type: 'consultation',
        project_description: description || undefined,
        contact_name: name.trim() || undefined,
        contact_email: contactIsEmail ? trimmedContact : undefined,
        // R62 — +1 day so the lead rises as a `new_lead` need on the Desk.
        response_deadline: new Date(Date.now() + 86_400_000).toISOString(),
        // R65 — "Where from" in its own column (00223), not the one-liner.
        source: source.trim() || undefined,
      },
      {
        onSuccess: (lead: { id: string }) => {
          // R65 — capture opens the new Brief so the designer keeps filling it
          // in the document. The Desk also re-derives (Shape C) for when they
          // put it down. (useCreateLead already invalidates ['leads'].)
          queryClient.invalidateQueries({
            queryKey: ['document-state', 'desk'],
          });
          onClose();
          router.push(`/doc/${lead.id}`);
        },
        onError: (err: Error) => {
          setError(err.message ?? 'Could not begin the Brief. Try again.');
        },
      },
    );
  };

  return (
    <DocSheet open={open} onClose={onClose} title="Capture a lead">
      <form
        onSubmit={submit}
        data-overlay-capture-lead
        className="mx-auto w-full max-w-[34rem]"
      >
        <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--color-clay-ink)]">
          New lead · begin a Brief
        </span>
        <h2 className="mt-2 font-heading text-[1.5rem] italic text-[var(--color-charcoal)]">
          Who just came in?
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-charcoal)]">
          A name and one-line project note are enough to begin. Contact and
          source can come later.
        </p>

        <div className="mt-7 space-y-5">
          <Field
            id="capture-lead-name"
            label="Name"
            required
            error={touched.name && nameMissing ? 'Add the client or household name.' : undefined}
          >
            <Input
              id="capture-lead-name"
              autoFocus
              value={name}
              onChange={setName}
              onBlur={() => setTouched((current) => ({ ...current, name: true }))}
              placeholder="e.g. The Okafors"
              required
              invalid={touched.name && nameMissing}
              describedBy={touched.name && nameMissing ? 'capture-lead-name-error' : undefined}
            />
          </Field>

          <div
            data-testid="lead-contact-project-fields"
            className="grid grid-cols-1 gap-5"
          >
            <Field id="capture-lead-contact" label="Contact">
              <Input
                id="capture-lead-contact"
                value={contact}
                onChange={setContact}
                placeholder="email or phone"
              />
            </Field>
            <Field
              id="capture-lead-project"
              label="The project (one line)"
              required
              error={
                touched.project && projectMissing
                  ? 'Add a one-line note about the project.'
                  : undefined
              }
            >
              <Input
                id="capture-lead-project"
                value={project}
                onChange={setProject}
                onBlur={() => setTouched((current) => ({ ...current, project: true }))}
                placeholder="e.g. Downtown loft refresh"
                required
                invalid={touched.project && projectMissing}
                describedBy={
                  touched.project && projectMissing ? 'capture-lead-project-error' : undefined
                }
              />
            </Field>
          </div>

          <Field id="capture-lead-source" label="Where from">
            <Input
              id="capture-lead-source"
              value={source}
              onChange={setSource}
              placeholder="how they found you"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SOURCE_CHIPS.map((s) => {
                const on = source.trim().toLowerCase() === s.toLowerCase();
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSource(s)}
                    className={`min-h-11 min-w-11 rounded-[4px] border px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.06em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none ${
                      on
                        ? 'border-[var(--color-clay)] bg-[rgba(196,165,123,0.18)] text-[var(--color-charcoal)]'
                        : 'border-[var(--color-pearl)] text-[var(--color-aged-oak)] hover:border-[var(--color-clay)]'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        {error && (
          <p
            className="mt-5 border-l-2 border-[var(--color-terracotta)] pl-3 text-[14px] text-[var(--color-charcoal)]"
            role="alert"
          >
            {error}
          </p>
        )}

        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="capture-lead-sheet"
          className="mt-8"
          aria-label="Capture lead actions"
        >
          <DocumentAction
            actionKey="begin-brief"
            variant="primary"
            type="submit"
            disabled={!canSubmit || createLead.isPending}
            loading={createLead.isPending}
            loadingLabel="Beginning…"
            trailing="→"
            aria-describedby={!canSubmit ? 'capture-lead-requirements' : undefined}
          >
            Begin the Brief
          </DocumentAction>
          <DocumentAction
            actionKey="cancel-capture-lead"
            variant="tertiary"
            onClick={onClose}
          >
            Cancel
          </DocumentAction>
          <span className="ml-auto font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-body)]">
            opens the Brief
          </span>
        </DocumentActionGroup>
        {!canSubmit && (
          <p
            id="capture-lead-requirements"
            role="status"
            className="mt-2 text-[12px] text-[var(--color-aged-oak)]"
          >
            Add a name and one-line project note to begin.
          </p>
        )}
      </form>
    </DocSheet>
  );
}

function Field({
  id,
  label,
  required = false,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <label
        htmlFor={id}
        className="mb-1.5 block font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--color-charcoal)]"
      >
        {label}
        {required && (
          <span className="ml-1 text-[var(--color-terracotta-ink)]">required</span>
        )}
      </label>
      {children}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-[12px] text-[var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function Input({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  autoFocus,
  required = false,
  invalid = false,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      required={required}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className="min-h-11 min-w-0 w-full border-b border-[var(--color-pearl)] bg-transparent px-1 py-2 text-[16px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
    />
  );
}

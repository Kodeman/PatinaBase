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

/** R65 — quick suggestion chips for "Where from". Clicking one fills the
 *  free-text field with a canonical label; the designer can also type any
 *  channel. The chosen string lands in `leads.source` (00223). */
const SOURCE_CHIPS = ['Referral', 'Website quiz', 'Instagram', 'Past client'] as const;

/** Cheap email vs phone discrimination. The table carries `contact_email` only
 *  (no phone column); a phone is preserved in the Brief one-liner instead of
 *  being written to a column that doesn't exist. */
function looksLikeEmail(v: string): boolean {
  return /\S+@\S+\.\S+/.test(v.trim());
}

export function CaptureLeadSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const createLead = useCreateLead();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [project, setProject] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fresh form every open; clear any prior error.
  useEffect(() => {
    if (open) {
      setName('');
      setContact('');
      setProject('');
      setSource('');
      setError(null);
    }
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedContact = contact.trim();
    const contactIsEmail = trimmedContact !== '' && looksLikeEmail(trimmedContact);

    // The Brief one-liner carries the project line and any non-email contact
    // (phone) — the table has no `phone` column, so it lives honestly in the
    // description. The source now has its own column (R65), so it's no longer
    // folded into the one-liner.
    const descParts: string[] = [];
    if (project.trim()) descParts.push(project.trim());
    if (trimmedContact && !contactIsEmail) descParts.push(`Contact: ${trimmedContact}`);
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
          queryClient.invalidateQueries({ queryKey: ['document-state', 'desk'] });
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
      <form onSubmit={submit} className="mx-auto w-full max-w-[34rem]">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-clay)]">
          New lead · begin a Brief
        </span>
        <h2 className="mt-2 font-heading text-[1.5rem] italic text-[var(--color-charcoal)]">
          Who just came in?
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-mocha)]">
          Just enough to begin. The Brief fills in as you go — nothing else is required.
        </p>

        <div className="mt-7 space-y-5">
          <Field label="Name">
            <Input
              autoFocus
              value={name}
              onChange={setName}
              placeholder="e.g. The Okafors"
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Contact">
              <Input
                value={contact}
                onChange={setContact}
                placeholder="email or phone"
              />
            </Field>
            <Field label="The project (one line)">
              <Input
                value={project}
                onChange={setProject}
                placeholder="e.g. Downtown loft refresh"
              />
            </Field>
          </div>

          <Field label="Where from">
            <Input value={source} onChange={setSource} placeholder="how they found you" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SOURCE_CHIPS.map((s) => {
                const on = source.trim().toLowerCase() === s.toLowerCase();
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSource(s)}
                    className={`rounded-[4px] border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${
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
          <p className="mt-5 text-[12px] text-[var(--color-terracotta)]" role="alert">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center gap-4">
          <button
            type="submit"
            disabled={createLead.isPending}
            className="rounded-[4px] bg-[var(--color-clay)] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)] transition-colors hover:bg-[var(--color-aged-oak)] disabled:opacity-50"
          >
            {createLead.isPending ? 'Beginning…' : 'Begin the Brief →'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
          >
            Cancel
          </button>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            opens the Brief
          </span>
        </div>
      </form>
    </DocSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 text-[14px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
    />
  );
}

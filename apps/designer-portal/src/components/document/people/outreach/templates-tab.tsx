'use client';

/**
 * Outreach · Templates (Track D) — the email template library.
 *
 * Browse via `useTemplates`, author a new one via `useCreateTemplate`, remove
 * one via `useDeleteTemplate`. "Used in N sends" reads off the template's own
 * campaigns where available; otherwise the category is the sub-line. The author
 * form is a quiet inline composer (D1 strict focus, no modal). Zero shadows (D4).
 */

import { useState } from 'react';
import {
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
} from '@patina/supabase';
import type {
  EmailTemplate,
  EmailTemplateCategory,
} from '@patina/shared/types';
import {
  CampRow,
  OutreachButton,
  ListHeader,
  QuietNote,
} from './outreach-bits';

const CATEGORY_LABEL: Record<EmailTemplateCategory, string> = {
  transactional: 'Transactional',
  engagement: 'Engagement',
  campaign: 'Campaign',
  sequence: 'Sequence',
};

const CATEGORIES: EmailTemplateCategory[] = [
  'campaign',
  'engagement',
  'sequence',
  'transactional',
];

function templateStat(t: EmailTemplate): string {
  const cat = CATEGORY_LABEL[t.category] ?? t.category;
  return t.description?.trim() || cat;
}

export function TemplatesTab({ notify }: { notify: (m: string) => void }) {
  const { data: templates, isLoading } = useTemplates();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<EmailTemplateCategory>('campaign');

  const canSubmit = name.trim() && !createTemplate.isPending;

  const submit = () => {
    if (!canSubmit) return;
    createTemplate.mutate(
      {
        name: name.trim(),
        category,
        subject_default: subject.trim() || null,
        content_blocks: [],
        is_active: true,
      },
      {
        onSuccess: () => {
          notify('Template created. Open it to compose its blocks.');
          setComposing(false);
          setName('');
          setSubject('');
          setCategory('campaign');
        },
        onError: (e) =>
          notify(
            e instanceof Error ? e.message : 'Could not create the template.',
          ),
      },
    );
  };

  return (
    <div>
      <ListHeader
        label="Template library"
        action={
          <OutreachButton
            actionKey="new-template"
            tone="primary"
            onClick={() => setComposing((v) => !v)}
          >
            {composing ? 'Close' : '+ New template'}
          </OutreachButton>
        }
      />

      {composing && (
        <div className="mb-4 rounded-[10px] border border-[var(--color-pearl)] bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="mb-1 block font-mono text-[0.44rem] font-semibold uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
                Template name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seasonal check-in"
                className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="mb-1 block font-mono text-[0.44rem] font-semibold uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
                Default subject
              </span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Thinking of your space this season"
                className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="mb-1 block font-mono text-[0.44rem] font-semibold uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
                Category
              </span>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as EmailTemplateCategory)
                }
                className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <OutreachButton
              actionKey="create-template"
              tone="primary"
              onClick={submit}
              disabled={!canSubmit}
            >
              {createTemplate.isPending ? 'Creating…' : 'Create template'}
            </OutreachButton>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="px-1 py-5 text-[0.74rem] text-[var(--color-aged-oak)]">
          Reading the library…
        </p>
      ) : !templates || templates.length === 0 ? (
        <QuietNote>
          No templates yet. Author one above — the welcome note, the proposal
          follow-up, the project-complete review ask. They become the body of
          your campaigns.
        </QuietNote>
      ) : (
        templates.map((t) => (
          <CampRow
            key={t.id}
            name={t.name}
            stat={templateStat(t)}
            right={
              <OutreachButton
                actionKey="delete-template"
                tone="quiet"
                onClick={() =>
                  deleteTemplate.mutate(t.id, {
                    onSuccess: () =>
                      notify(`“${t.name}” removed from the library.`),
                    onError: (e) =>
                      notify(
                        e instanceof Error
                          ? e.message
                          : 'Could not remove the template.',
                      ),
                  })
                }
                disabled={deleteTemplate.isPending}
              >
                Delete
              </OutreachButton>
            }
          />
        ))
      )}
    </div>
  );
}

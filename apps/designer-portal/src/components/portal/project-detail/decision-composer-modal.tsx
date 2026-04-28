'use client';

import { useState } from 'react';
import { useCreateDecision } from '@patina/supabase';
import {
  CurrencyInput,
  FieldRow,
  Select,
  TextArea,
  TextInput,
} from '../activation-wizard/field-primitives';

interface DecisionComposerModalProps {
  projectId: string;
  designerClientId: string;
  onClose: () => void;
}

interface DraftOption {
  id: string;
  name: string;
  designerNote: string;
  priceCents: number;
  isRecommended: boolean;
}

const DECISION_TYPES = [
  { value: 'material', label: 'Material' },
  { value: 'color', label: 'Color' },
  { value: 'product', label: 'Product' },
  { value: 'layout', label: 'Layout' },
  { value: 'substitution', label: 'Substitution' },
  { value: 'approval', label: 'Approval' },
];

const BLOCKING = [
  { value: 'non_blocking', label: 'Not blocking' },
  { value: 'blocks_procurement', label: 'Blocks procurement' },
  { value: 'blocks_phase', label: 'Blocks phase' },
];

export function DecisionComposerModal({
  projectId,
  designerClientId,
  onClose,
}: DecisionComposerModalProps) {
  const create = useCreateDecision();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [decisionType, setDecisionType] = useState('material');
  const [blockingStatus, setBlockingStatus] = useState('non_blocking');
  const [dueDate, setDueDate] = useState('');
  const [options, setOptions] = useState<DraftOption[]>([
    { id: '1', name: '', designerNote: '', priceCents: 0, isRecommended: false },
    { id: '2', name: '', designerNote: '', priceCents: 0, isRecommended: false },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    title.trim().length > 0 &&
    options.length >= 2 &&
    options.every((o) => o.name.trim().length > 0);

  const updateOption = (id: string, patch: Partial<DraftOption>) =>
    setOptions(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const addOption = () => {
    if (options.length >= 4) return;
    setOptions([
      ...options,
      {
        id: crypto.randomUUID(),
        name: '',
        designerNote: '',
        priceCents: 0,
        isRecommended: false,
      },
    ]);
  };

  const removeOption = (id: string) => {
    if (options.length <= 2) return;
    setOptions(options.filter((o) => o.id !== id));
  };

  const setRecommended = (id: string) =>
    setOptions(options.map((o) => ({ ...o, isRecommended: o.id === id })));

  const submit = async (status: 'draft' | 'pending') => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await create.mutateAsync({
        designerClientId,
        projectId,
        title,
        context: description || undefined,
        decisionType: decisionType as 'material' | 'color' | 'product' | 'layout' | 'substitution' | 'budget' | 'approval',
        blockingStatus: blockingStatus as 'blocks_procurement' | 'blocks_phase' | 'non_blocking',
        dueDate: dueDate || undefined,
        status,
        options: options.map((o) => ({
          name: o.name,
          designerNote: o.designerNote || undefined,
          isRecommended: o.isRecommended,
          price: o.priceCents > 0 ? o.priceCents : undefined,
        })),
      });
      onClose();
    } catch (err) {
      console.error('Failed to create decision:', err);
      setError(err instanceof Error ? err.message : 'Failed to create decision');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="type-section-head" style={{ fontSize: '1.2rem' }}>
            New decision
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

        <FieldRow label="Title" hint="A short question for the client">
          <TextInput
            value={title}
            onChange={setTitle}
            placeholder="Choose primary upholstery fabric for sectional"
          />
        </FieldRow>

        <FieldRow label="Context" hint="Optional. Describe what's at stake.">
          <TextArea value={description} onChange={setDescription} rows={3} />
        </FieldRow>

        <div className="grid gap-3 md:grid-cols-3">
          <FieldRow label="Type">
            <Select value={decisionType} onChange={setDecisionType} options={DECISION_TYPES} />
          </FieldRow>
          <FieldRow label="Blocking">
            <Select value={blockingStatus} onChange={setBlockingStatus} options={BLOCKING} />
          </FieldRow>
          <FieldRow label="Deadline">
            <TextInput type="date" value={dueDate} onChange={setDueDate} />
          </FieldRow>
        </div>

        <div className="mb-2 mt-4 flex items-baseline justify-between">
          <span className="type-meta-small uppercase tracking-wider">
            Options · {options.length} of 4 max
          </span>
          {options.length < 4 && (
            <button
              type="button"
              onClick={addOption}
              className="rounded-[3px] border bg-transparent px-2 py-0.5 text-[0.7rem]"
              style={{ borderColor: 'var(--border-default)' }}
            >
              + Add option
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {options.map((opt, idx) => (
            <div
              key={opt.id}
              className="rounded-md border p-3"
              style={{
                borderColor: opt.isRecommended ? 'var(--color-sage, #A8B5A0)' : 'var(--border-default)',
                background: opt.isRecommended ? 'rgba(168,181,160,0.05)' : undefined,
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="type-meta-small font-mono text-[var(--text-muted)]">
                  {String.fromCharCode(65 + idx)}
                </span>
                <input
                  type="text"
                  value={opt.name}
                  onChange={(e) => updateOption(opt.id, { name: e.target.value })}
                  placeholder="Option name (e.g. Belgian Linen — Stone)"
                  className="flex-1 rounded-[3px] border border-[var(--border-default)] bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
                />
                <label className="flex items-center gap-1 text-[0.72rem]">
                  <input
                    type="radio"
                    name="recommended"
                    checked={opt.isRecommended}
                    onChange={() => setRecommended(opt.id)}
                  />
                  Recommend
                </label>
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(opt.id)}
                    className="text-[0.8rem] text-[var(--text-muted)] hover:text-[var(--color-terracotta, #D4A090)]"
                    aria-label={`Remove option ${idx + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <CurrencyInput
                  cents={opt.priceCents}
                  onChange={(c) => updateOption(opt.id, { priceCents: c })}
                  placeholder="Price (optional)"
                />
                <input
                  type="text"
                  value={opt.designerNote}
                  onChange={(e) => updateOption(opt.id, { designerNote: e.target.value })}
                  placeholder="Designer note (optional)"
                  className="rounded-[3px] border border-[var(--border-default)] bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
                />
              </div>
            </div>
          ))}
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
            onClick={() => submit('draft')}
            disabled={!canSubmit || submitting}
            className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
            style={{ borderColor: 'var(--border-default)' }}
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => submit('pending')}
            disabled={!canSubmit || submitting}
            className="rounded-[3px] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
            style={{ background: canSubmit ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {submitting ? 'Sending…' : 'Send to client'}
          </button>
        </div>
      </div>
    </div>
  );
}

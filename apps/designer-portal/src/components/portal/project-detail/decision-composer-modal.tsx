'use client';

import { useState } from 'react';
import { useCreateDecision, useProjectFFEItems } from '@patina/supabase';
import { Button, IconButton } from '@/components/ui/controls';
import { FieldRow, Select, TextArea, TextInput } from '../activation-wizard/field-primitives';
import {
  DecisionOptionBuilder,
  emptyOption,
  optionValueToInput,
  useMaterializeDraftOptions,
  type DecisionOptionValue,
} from '../decision-option-builder';

interface DecisionComposerModalProps {
  projectId: string;
  designerClientId: string;
  onClose: () => void;
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
  const materialize = useMaterializeDraftOptions();
  const { data: ffeItemsRaw } = useProjectFFEItems(projectId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffeItems = (Array.isArray(ffeItemsRaw) ? ffeItemsRaw : []) as any[];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [decisionType, setDecisionType] = useState('material');
  const [blockingStatus, setBlockingStatus] = useState('non_blocking');
  const [dueDate, setDueDate] = useState('');
  const [blockedFfeIds, setBlockedFfeIds] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<DecisionOptionValue[]>([emptyOption(), emptyOption()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    title.trim().length > 0 &&
    options.length >= 2 &&
    options.every((o) => o.name.trim().length > 0);

  const isBlocking = blockingStatus === 'blocks_phase' || blockingStatus === 'blocks_procurement';

  const updateOption = (index: number, value: DecisionOptionValue) => {
    let next = [...options];
    next[index] = value;
    // Only one option can be the recommendation — clear the others.
    if (value.isRecommended) {
      next = next.map((o, i) => (i === index ? o : { ...o, isRecommended: false }));
    }
    setOptions(next);
  };

  const addOption = () => {
    if (options.length >= 4) return;
    setOptions([...options, emptyOption()]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const toggleFfe = (id: string) => {
    setBlockedFfeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (status: 'draft' | 'pending') => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const materialized = await materialize(options);
      await create.mutateAsync({
        designerClientId,
        projectId,
        title,
        context: description || undefined,
        decisionType: decisionType as
          | 'material'
          | 'color'
          | 'product'
          | 'layout'
          | 'substitution'
          | 'budget'
          | 'approval',
        blockingStatus: blockingStatus as 'blocks_procurement' | 'blocks_phase' | 'non_blocking',
        dueDate: dueDate || undefined,
        status,
        blockedFfeItemIds:
          isBlocking && blockedFfeIds.size > 0 ? Array.from(blockedFfeIds) : undefined,
        options: materialized.map(optionValueToInput),
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
          <IconButton
            label="Close"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <span aria-hidden="true" style={{ fontSize: '1.1rem', lineHeight: 1 }}>×</span>
          </IconButton>
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

        {/* A9: blocked FF&E items picker — only when blocking */}
        {isBlocking && (
          <div className="mb-3 rounded-md border p-3" style={{ borderColor: 'var(--border-default)' }}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="type-meta-small uppercase tracking-wider">
                Blocked items{blockedFfeIds.size > 0 ? ` · ${blockedFfeIds.size} selected` : ''}
              </span>
              <span className="type-meta-small text-[var(--text-muted)]">
                Tag FF&amp;E lines that wait on this decision
              </span>
            </div>
            {ffeItems.length === 0 ? (
              <p className="type-body text-[0.78rem] text-[var(--text-muted)]">
                No FF&amp;E items yet on this project.
              </p>
            ) : (
              <div className="max-h-[160px] overflow-y-auto">
                {ffeItems.map((item) => {
                  const id = item.id as string;
                  const checked = blockedFfeIds.has(id);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--bg-hover,rgba(0,0,0,0.02))]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFfe(id)}
                      />
                      <span className="type-body flex-1 truncate text-[0.82rem]">
                        {item.product?.name ?? item.item_name ?? 'FF&E item'}
                      </span>
                      {item.room?.name && (
                        <span className="type-meta-small text-[var(--text-muted)]">{item.room.name}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="mb-2 mt-4 flex items-baseline justify-between">
          <span className="type-meta-small uppercase tracking-wider">
            Options · {options.length} of 4 max
          </span>
          {options.length < 4 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addOption}
            >
              + Add option
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {options.map((opt, idx) => (
            <DecisionOptionBuilder
              key={idx}
              index={idx}
              value={opt}
              onChange={(val) => updateOption(idx, val)}
              onRemove={options.length > 2 ? () => removeOption(idx) : undefined}
            />
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => submit('draft')}
            disabled={!canSubmit || submitting}
          >
            Save draft
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => submit('pending')}
            disabled={!canSubmit || submitting}
            loading={submitting}
          >
            {submitting ? 'Sending…' : 'Send to client'}
          </Button>
        </div>
      </div>
    </div>
  );
}

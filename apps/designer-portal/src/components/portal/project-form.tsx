'use client';

import { useState } from 'react';
import { StyleTag } from './style-tag';
import { StrataMark } from './strata-mark';
import { ALL_PHASES, PHASE_CONFIG } from '@/types/project-ui';

interface ProjectFormData {
  name: string;
  clientName: string;
  projectType: string;
  rooms: string;
  location: string;
  timeline: string;
  description: string;
  totalBudget: string;
  designFee: string;
  furnitureBudget: string;
  contingency: string;
  status?: string;
  changeReason?: string;
  startDate?: string;
  estCompletion?: string;
  currentPhase?: string;
}

interface ProjectFormProps {
  initialData?: Partial<ProjectFormData>;
  isEdit?: boolean;
  fromLead?: { clientName: string; rooms: string; budget: string; styleTags: string[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (data: any) => void;
  onSaveDraft?: () => void;
  onCancel: () => void;
  originalBudget?: string;
  styleTags?: string[];
}

export function ProjectForm({
  initialData = {},
  isEdit = false,
  fromLead,
  onSubmit,
  onSaveDraft,
  onCancel,
  originalBudget,
  styleTags = [],
}: ProjectFormProps) {
  const [form, setForm] = useState<ProjectFormData>({
    name: initialData.name ?? fromLead?.clientName ?? '',
    clientName: initialData.clientName ?? fromLead?.clientName ?? '',
    projectType: initialData.projectType ?? 'Full Room Design',
    rooms: initialData.rooms ?? fromLead?.rooms ?? '',
    location: initialData.location ?? '',
    timeline: initialData.timeline ?? '3 months',
    description: initialData.description ?? '',
    totalBudget: initialData.totalBudget ?? fromLead?.budget ?? '',
    designFee: initialData.designFee ?? '',
    furnitureBudget: initialData.furnitureBudget ?? '',
    contingency: initialData.contingency ?? '',
    status: initialData.status,
    changeReason: initialData.changeReason ?? '',
    startDate: initialData.startDate ?? '',
    estCompletion: initialData.estCompletion ?? '',
    currentPhase: initialData.currentPhase ?? '',
  });

  const update = (field: keyof ProjectFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Lead pre-fill banner */}
      {fromLead && (
        <div
          className="mb-8 rounded-md border px-4 py-3.5"
          style={{
            background: 'rgba(196, 165, 123, 0.04)',
            borderColor: 'rgba(196, 165, 123, 0.15)',
          }}
        >
          <p className="type-meta mb-0.5" style={{ color: 'var(--accent-primary)' }}>
            Pre-filled from Lead
          </p>
          <p className="font-body text-[0.82rem] text-[var(--text-body)]">
            This project was created from {fromLead.clientName}&apos;s accepted lead. Room scan, style profile, and budget have been imported.
          </p>
        </div>
      )}

      {/* Client & Scope */}
      <h3 className="type-section-head mb-4 border-b border-[var(--border-default)] pb-2" style={{ fontSize: '1.25rem' }}>
        Client & Scope
      </h3>
      <div className="mb-6 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        <FormField label="Project Name" value={form.name} onChange={(v) => update('name', v)} />
        <FormField
          label="Client"
          value={form.clientName}
          onChange={(v) => update('clientName', v)}
          disabled={isEdit}
        />
        <FormField label="Project Type" type="select" value={form.projectType} onChange={(v) => update('projectType', v)}
          options={['Full Room Design', 'Room Refresh', 'Consultation Only', 'Virtual Design']}
        />
        {isEdit && (
          <FormField label="Status" type="select" value={form.status ?? 'Active'} onChange={(v) => update('status', v)}
            options={['Active', 'On Hold', 'Completed', 'Cancelled']}
          />
        )}
        <FormField label="Rooms" value={form.rooms} onChange={(v) => update('rooms', v)} />
        <FormField label="Location" value={form.location} onChange={(v) => update('location', v)} />
        {!isEdit && (
          <FormField label="Estimated Timeline" value={form.timeline} onChange={(v) => update('timeline', v)} />
        )}
        <div className="md:col-span-2">
          <FormField label="Project Description" type="textarea" value={form.description} onChange={(v) => update('description', v)} />
        </div>
      </div>

      <StrataMark variant="mini" />

      {/* Budget */}
      <h3 className="type-section-head mb-4 border-b border-[var(--border-default)] pb-2" style={{ fontSize: '1.25rem' }}>
        Budget
      </h3>
      <div className="mb-6 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        {isEdit && originalBudget && (
          <FormField label="Original Budget" value={originalBudget} disabled />
        )}
        <FormField label={isEdit ? 'Current Budget' : 'Total Budget'} value={form.totalBudget} onChange={(v) => update('totalBudget', v)} />
        <FormField label="Design Fee" value={form.designFee} onChange={(v) => update('designFee', v)} />
        <FormField label="Furniture Budget" value={form.furnitureBudget} onChange={(v) => update('furnitureBudget', v)} />
        <FormField label="Contingency" value={form.contingency} onChange={(v) => update('contingency', v)} />
        {isEdit && (
          <FormField label="Change Reason" value={form.changeReason ?? ''} onChange={(v) => update('changeReason', v)} />
        )}
      </div>

      {/* Timeline (edit only) */}
      {isEdit && (
        <>
          <StrataMark variant="mini" />
          <h3 className="type-section-head mb-4 border-b border-[var(--border-default)] pb-2" style={{ fontSize: '1.25rem' }}>
            Timeline
          </h3>
          <div className="mb-6 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            <FormField label="Start Date" value={form.startDate ?? ''} onChange={(v) => update('startDate', v)} />
            <FormField label="Estimated Completion" value={form.estCompletion ?? ''} onChange={(v) => update('estCompletion', v)} />
            <FormField
              label="Current Phase"
              type="select"
              value={form.currentPhase ?? ''}
              onChange={(v) => update('currentPhase', v)}
              options={ALL_PHASES.map((p) => PHASE_CONFIG[p].label)}
            />
          </div>
        </>
      )}

      {/* Style Context (create only) */}
      {!isEdit && styleTags.length > 0 && (
        <>
          <StrataMark variant="mini" />
          <h3 className="type-section-head mb-4 border-b border-[var(--border-default)] pb-2" style={{ fontSize: '1.25rem' }}>
            Style Context
          </h3>
          <div className="mb-6">
            <div className="type-meta-small mb-2" style={{ textTransform: 'uppercase' }}>
              Imported Style Profile
            </div>
            <div className="flex flex-wrap gap-1.5">
              {styleTags.map((tag) => (
                <StyleTag key={tag} label={tag} active />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2 border-t border-[var(--border-default)] pt-6 mt-8">
        <button
          type="submit"
          className="type-btn-text rounded-[3px] bg-[var(--text-primary)] px-5 py-2.5 text-[var(--bg-primary)]"
        >
          {isEdit ? 'Save Changes' : 'Create Project'}
        </button>
        {!isEdit && onSaveDraft && (
          <button
            type="button"
            className="type-btn-text rounded-[3px] border border-[var(--border-default)] bg-transparent px-5 py-2.5 text-[var(--text-primary)]"
            onClick={onSaveDraft}
          >
            Save as Draft
          </button>
        )}
        <button
          type="button"
          className="type-btn-text bg-transparent px-5 py-2.5 text-[var(--text-muted)]"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Internal Form Field ──

function FormField({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  options = [],
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: 'text' | 'textarea' | 'select';
  disabled?: boolean;
  options?: string[];
}) {
  const labelClass = 'mb-1.5 block type-meta-small';
  const inputClass = `w-full rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] ${disabled ? 'bg-[var(--bg-primary)] text-[var(--text-muted)]' : ''}`;

  if (type === 'textarea') {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <textarea
          className={`${inputClass} min-h-[80px] resize-y`}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          rows={3}
        />
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <select
          className={inputClass}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

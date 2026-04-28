'use client';

import { useMemo } from 'react';
import { useClients } from '@patina/supabase';
import {
  useActivationWizard,
  type ClientVisibilityTier,
  type WizardRoom,
  type WizardPhase,
  type WizardMilestone,
} from '@/stores/project-activation-store';
import {
  CurrencyInput,
  FieldRow,
  NumberInput,
  Select,
  TextArea,
  TextInput,
} from './field-primitives';

const ROOM_TYPES = [
  'Living Room', 'Kitchen', 'Dining Room', 'Primary Suite', 'Bedroom',
  'Bathroom', 'Office', 'Hallway', 'Outdoor', 'Other',
];

const VISIBILITY_OPTIONS: { value: ClientVisibilityTier; label: string; desc: string }[] = [
  { value: 'full', label: 'Full Access', desc: 'Client sees daily progress, all updates, photos as they happen.' },
  { value: 'milestone', label: 'Milestone Updates', desc: 'Client sees curated phase-end updates and major decisions only.' },
  { value: 'curated', label: 'Curated Reveals', desc: 'Designer publishes specific updates. Final reveal at completion.' },
];

// ── Step 01 — Basics ─────────────────────────────────────────────────────────

export function Step01Basics() {
  const { name, address, clientId, clientName, leadDesignerId, leadDesignerName, setField } =
    useActivationWizard();
  const { data: clients } = useClients();

  const clientOptions = useMemo(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((clients ?? []) as any[]).map((c) => ({
        value: c.client_id || c.id,
        label: c.client?.full_name || c.nickname || 'Unnamed client',
      })),
    [clients]
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <FieldRow label="Project name" hint="Often the residence name (e.g. 'Chen Residence')">
          <TextInput value={name} onChange={(v) => setField('name', v)} placeholder="Chen Residence" />
        </FieldRow>
      </div>
      <div className="md:col-span-2">
        <FieldRow label="Project address">
          <TextInput value={address} onChange={(v) => setField('address', v)} placeholder="123 Maple Lane, Portland, OR" />
        </FieldRow>
      </div>
      <FieldRow label="Client" hint="Pick from your client directory">
        <Select
          value={clientId ?? ''}
          onChange={(v) => {
            const opt = clientOptions.find((o) => o.value === v);
            setField('clientId', v || null);
            setField('clientName', opt?.label ?? '');
          }}
          options={clientOptions}
          placeholder="Select a client…"
        />
      </FieldRow>
      <FieldRow label="Lead designer" hint="Defaults to you. Reassign anytime.">
        <TextInput
          value={leadDesignerName}
          onChange={(v) => setField('leadDesignerName', v)}
          placeholder="You"
        />
      </FieldRow>
    </div>
  );
}

// ── Step 02 — Scope & Rooms ──────────────────────────────────────────────────

export function Step02Scope() {
  const { rooms, setField } = useActivationWizard();

  const addRoom = () => {
    const newRoom: WizardRoom = {
      id: crypto.randomUUID(),
      name: '',
      roomType: '',
      dimensions: '',
      budgetCents: 0,
      ffeCategories: [],
      notes: '',
    };
    setField('rooms', [...rooms, newRoom]);
  };

  const updateRoom = (id: string, patch: Partial<WizardRoom>) => {
    setField(
      'rooms',
      rooms.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const removeRoom = (id: string) =>
    setField('rooms', rooms.filter((r) => r.id !== id));

  const totalBudget = rooms.reduce((sum, r) => sum + r.budgetCents, 0);

  return (
    <div>
      {rooms.length === 0 ? (
        <div className="rounded-md border-2 border-dashed py-12 text-center" style={{ borderColor: 'var(--border-default)' }}>
          <p className="type-body mb-3 text-[var(--text-muted)]">No rooms yet</p>
          <button
            type="button"
            onClick={addRoom}
            className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
            style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)' }}
          >
            + Add first room
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="type-meta-small uppercase tracking-wider">
              {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'} · ${(totalBudget / 100).toLocaleString()} allocated
            </span>
            <button
              type="button"
              onClick={addRoom}
              className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
              style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)' }}
            >
              + Add room
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="rounded-md border p-4"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="grid flex-1 gap-3 md:grid-cols-3">
                    <FieldRow label="Room name">
                      <TextInput
                        value={room.name}
                        onChange={(v) => updateRoom(room.id, { name: v })}
                        placeholder="Living Room"
                      />
                    </FieldRow>
                    <FieldRow label="Room type">
                      <Select
                        value={room.roomType}
                        onChange={(v) => updateRoom(room.id, { roomType: v })}
                        options={ROOM_TYPES.map((t) => ({ value: t, label: t }))}
                        placeholder="Select…"
                      />
                    </FieldRow>
                    <FieldRow label="Dimensions">
                      <TextInput
                        value={room.dimensions}
                        onChange={(v) => updateRoom(room.id, { dimensions: v })}
                        placeholder='14 x 18 ft'
                      />
                    </FieldRow>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRoom(room.id)}
                    className="ml-2 text-[0.72rem] text-[var(--text-muted)] hover:text-[var(--color-terracotta,#D4A090)]"
                    aria-label={`Remove ${room.name || 'room'}`}
                  >
                    ✕
                  </button>
                </div>
                <FieldRow label="Budget allocation">
                  <CurrencyInput
                    cents={room.budgetCents}
                    onChange={(c) => updateRoom(room.id, { budgetCents: c })}
                  />
                </FieldRow>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 03 — Schedule & Phases ─────────────────────────────────────────────

export function Step03Schedule() {
  const { kickoffDate, phases, setField } = useActivationWizard();

  const totalWeeks = phases.reduce((s, p) => s + p.durationWeeks, 0);
  const expectedEnd = useMemo(() => {
    if (!kickoffDate) return null;
    const start = new Date(kickoffDate);
    return new Date(start.getTime() + totalWeeks * 7 * 86400000);
  }, [kickoffDate, totalWeeks]);

  const updatePhase = (id: string, patch: Partial<WizardPhase>) =>
    setField('phases', phases.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <FieldRow label="Kickoff date">
          <TextInput
            type="date"
            value={kickoffDate}
            onChange={(v) => setField('kickoffDate', v)}
          />
        </FieldRow>
        <FieldRow label="Expected completion" hint={`Auto-calculated: ${totalWeeks} weeks total`}>
          <TextInput
            type="text"
            value={expectedEnd ? expectedEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
            onChange={() => {}}
          />
        </FieldRow>
      </div>

      <div className="type-meta-small mb-2 uppercase tracking-wider">Phases</div>
      <div className="flex flex-col gap-2">
        {phases.map((phase, idx) => (
          <div
            key={phase.id}
            className="grid items-center gap-3 rounded-md border p-3"
            style={{ borderColor: 'var(--border-default)', gridTemplateColumns: 'auto 1fr 100px 1.5fr' }}
          >
            <span className="type-meta-small font-mono text-[var(--text-muted)]">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <TextInput
              value={phase.name}
              onChange={(v) => updatePhase(phase.id, { name: v })}
            />
            <NumberInput
              value={phase.durationWeeks}
              onChange={(v) => updatePhase(phase.id, { durationWeeks: v })}
              placeholder="weeks"
            />
            <TextInput
              value={phase.gateCondition}
              onChange={(v) => updatePhase(phase.id, { gateCondition: v })}
              placeholder="Gate condition (e.g. Design package signed)"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 04 — Financials ────────────────────────────────────────────────────

export function Step04Financials() {
  const { budgetTotalCents, designFeeCents, contingencyPercent, milestones, setField } =
    useActivationWizard();

  const addMilestone = () => {
    const newMs: WizardMilestone = {
      id: crypto.randomUUID(),
      label: '',
      percentage: 0,
      amountCents: 0,
      triggerCondition: '',
    };
    setField('milestones', [...milestones, newMs]);
  };

  const updateMs = (id: string, patch: Partial<WizardMilestone>) => {
    setField(
      'milestones',
      milestones.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  const removeMs = (id: string) =>
    setField('milestones', milestones.filter((m) => m.id !== id));

  const milestoneTotalPct = milestones.reduce((s, m) => s + m.percentage, 0);

  return (
    <div>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <FieldRow label="Total project budget">
          <CurrencyInput
            cents={budgetTotalCents}
            onChange={(c) => setField('budgetTotalCents', c)}
          />
        </FieldRow>
        <FieldRow label="Design fee">
          <CurrencyInput
            cents={designFeeCents}
            onChange={(c) => setField('designFeeCents', c)}
          />
        </FieldRow>
        <FieldRow label="Contingency %">
          <NumberInput
            value={contingencyPercent}
            onChange={(v) => setField('contingencyPercent', v)}
          />
        </FieldRow>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="type-meta-small uppercase tracking-wider">
          Payment milestones · {milestoneTotalPct}% allocated
        </span>
        <button
          type="button"
          onClick={addMilestone}
          className="rounded-[3px] border bg-transparent px-2.5 py-1 text-[0.72rem]"
          style={{ borderColor: 'var(--border-default)' }}
        >
          + Add milestone
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {milestones.map((ms) => (
          <div
            key={ms.id}
            className="grid items-center gap-3 rounded-md border p-3"
            style={{ borderColor: 'var(--border-default)', gridTemplateColumns: '2fr 80px 140px 2fr 24px' }}
          >
            <TextInput
              value={ms.label}
              onChange={(v) => updateMs(ms.id, { label: v })}
              placeholder="e.g. Design Approval"
            />
            <NumberInput value={ms.percentage} onChange={(v) => updateMs(ms.id, { percentage: v })} placeholder="%" />
            <CurrencyInput cents={ms.amountCents} onChange={(c) => updateMs(ms.id, { amountCents: c })} />
            <TextInput
              value={ms.triggerCondition}
              onChange={(v) => updateMs(ms.id, { triggerCondition: v })}
              placeholder="Trigger (e.g. Phase 2 sign-off)"
            />
            <button
              type="button"
              onClick={() => removeMs(ms.id)}
              className="text-[0.72rem] text-[var(--text-muted)] hover:text-[var(--color-terracotta,#D4A090)]"
              aria-label="Remove milestone"
            >
              ✕
            </button>
          </div>
        ))}
        {milestones.length === 0 && (
          <p className="type-body py-6 text-center italic text-[var(--text-muted)]">
            No milestones yet. Common pattern: 25% kickoff · 25% design approval · 25% procurement · 25% installation.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step 05 — Team & Vendors (simplified MVP) ───────────────────────────────

export function Step05Team() {
  const { team, vendorAssignments, setField } = useActivationWizard();

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 type-meta-small uppercase tracking-wider">Support designers</div>
        <p className="type-body mb-3 text-[var(--text-muted)] text-[0.82rem]">
          Add additional designers from your studio who will work on this project. They&rsquo;ll
          be able to log hours, update tasks, and upload photos. Financial editing and change
          order signing remain with the lead designer.
        </p>
        <div className="rounded-md border-2 border-dashed py-8 text-center" style={{ borderColor: 'var(--border-default)' }}>
          <p className="type-body text-[var(--text-muted)] text-[0.82rem]">
            Studio team management ships in Sprint 3. For MVP, support designers can be added from the project detail page after activation.
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 type-meta-small uppercase tracking-wider">Vendor pre-assignments</div>
        <p className="type-body mb-3 text-[var(--text-muted)] text-[0.82rem]">
          Optional. Pre-assign vendors to FF&E categories for items where you have standing
          relationships. Other items can be assigned during procurement.
        </p>
        <div className="rounded-md border-2 border-dashed py-8 text-center" style={{ borderColor: 'var(--border-default)' }}>
          <p className="type-body text-[var(--text-muted)] text-[0.82rem]">
            Skip for now and assign vendors per-item from the FF&E pipeline.
          </p>
        </div>
      </div>

      {/* Suppress unused warnings while these features are scaffolded */}
      <span className="hidden">{team.length}{vendorAssignments.length}{setField.toString().length}</span>
    </div>
  );
}

// ── Step 06 — Client Access ─────────────────────────────────────────────────

export function Step06Access() {
  const { visibilityTier, setField } = useActivationWizard();

  return (
    <div>
      <p className="type-body mb-4 text-[0.85rem] text-[var(--text-body)]">
        Choose how much detail your client sees. You can change this later.
      </p>
      <div className="flex flex-col gap-3">
        {VISIBILITY_OPTIONS.map((opt) => {
          const active = opt.value === visibilityTier;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setField('visibilityTier', opt.value)}
              className="rounded-md border p-4 text-left transition-colors"
              style={{
                borderColor: active ? 'var(--text-primary)' : 'var(--border-default)',
                background: active ? 'var(--bg-hover)' : 'transparent',
              }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full border"
                  style={{
                    borderColor: active ? 'var(--text-primary)' : 'var(--border-default)',
                    background: active ? 'var(--text-primary)' : 'transparent',
                  }}
                />
                <span className="type-label">{opt.label}</span>
              </div>
              <p className="type-body text-[0.78rem] text-[var(--text-muted)]">{opt.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 07 — Review ────────────────────────────────────────────────────────

export function Step07Review() {
  const w = useActivationWizard();

  const totalRoomsBudget = w.rooms.reduce((s, r) => s + r.budgetCents, 0);
  const totalWeeks = w.phases.reduce((s, p) => s + p.durationWeeks, 0);
  const milestonePct = w.milestones.reduce((s, m) => s + m.percentage, 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ReviewBlock title="Basics">
        <ReviewRow label="Name" value={w.name || '—'} />
        <ReviewRow label="Address" value={w.address || '—'} />
        <ReviewRow label="Client" value={w.clientName || '—'} />
        <ReviewRow label="Lead designer" value={w.leadDesignerName || '—'} />
      </ReviewBlock>

      <ReviewBlock title="Scope">
        <ReviewRow label="Rooms" value={`${w.rooms.length}`} />
        <ReviewRow label="Total room budget" value={`$${(totalRoomsBudget / 100).toLocaleString()}`} />
      </ReviewBlock>

      <ReviewBlock title="Schedule">
        <ReviewRow label="Kickoff" value={w.kickoffDate ? new Date(w.kickoffDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'} />
        <ReviewRow label="Phases" value={`${w.phases.length}`} />
        <ReviewRow label="Total duration" value={`${totalWeeks} weeks`} />
      </ReviewBlock>

      <ReviewBlock title="Financials">
        <ReviewRow label="Project budget" value={`$${(w.budgetTotalCents / 100).toLocaleString()}`} />
        <ReviewRow label="Design fee" value={`$${(w.designFeeCents / 100).toLocaleString()}`} />
        <ReviewRow label="Contingency" value={`${w.contingencyPercent}%`} />
        <ReviewRow label="Payment milestones" value={`${w.milestones.length} (${milestonePct}% allocated)`} />
      </ReviewBlock>

      <ReviewBlock title="Access">
        <ReviewRow label="Client visibility" value={w.visibilityTier} />
      </ReviewBlock>

      <div className="md:col-span-2 rounded-md border-2 p-4" style={{ borderColor: 'var(--color-sage, #A8B5A0)', background: 'rgba(168, 181, 160, 0.06)' }}>
        <p className="type-body text-[0.85rem]">
          Activating will create the project workspace, generate room cards and FF&E pipeline,
          assign payment milestones, and notify the client. You&rsquo;ll be able to edit any
          field afterward from the Project Detail page.
        </p>
      </div>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-4" style={{ borderColor: 'var(--border-default)' }}>
      <div className="mb-2 type-meta-small uppercase tracking-wider">{title}</div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b py-1.5 last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="type-meta-small text-[var(--text-muted)]">{label}</span>
      <span className="type-body text-[0.82rem] text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

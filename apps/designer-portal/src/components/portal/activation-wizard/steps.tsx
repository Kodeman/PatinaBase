'use client';

import { useMemo } from 'react';
import { useClients } from '@patina/supabase';
import {
  EmptyState,
  InfoIcon,
  SectionIntro,
  SmartDefault,
  StrataInfoIcon,
  SurfaceKeys,
} from '@patina/help-system';
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

// F1.3 — Activation Wizard migration. Surface keys flow through the typed
// registry (spec §6.3, single source of truth); copy lives in Sanity by
// surfaceKey and falls back to inline strings (spec §13.4) until the CMS
// publishes. All Patina-specific concepts (FF&E, Aesthete, visibility tiers,
// contingency, milestone triggers) use <StrataInfoIcon>; general
// "what does this mean?" questions use <InfoIcon> (spec §4.2).
const SK = SurfaceKeys.DesignerPortal.ActivationWizard;

// ── Step 01 — Basics ─────────────────────────────────────────────────────────

export function Step01Basics() {
  const { name, address, clientId, leadDesignerName, setField } =
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
    <div>
      <SectionIntro
        className="mb-6"
        surfaceKey={SK.StepIntro.Basics}
        fallback="Identify the project and the people. Auto-saves as you type."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <FieldRow
            label="Project name"
            htmlFor="aw-project-name"
            required
            helperSurfaceKey={SK.Step1Basics.ProjectName}
            hint="Often the residence name (e.g. 'Chen Residence')."
            trailing={<InfoIcon surfaceKey={SK.Step1Basics.ProjectName} />}
          >
            <TextInput
              id="aw-project-name"
              value={name}
              onChange={(v) => setField('name', v)}
              placeholder="Chen Residence"
            />
          </FieldRow>
        </div>
        <div className="md:col-span-2">
          <FieldRow
            label="Project address"
            htmlFor="aw-project-address"
            helperSurfaceKey={SK.Step1Basics.ProjectAddress}
            hint="Where the work happens. Used for shipping, taxes, and site visits."
          >
            <TextInput
              id="aw-project-address"
              value={address}
              onChange={(v) => setField('address', v)}
              placeholder="123 Maple Lane, Portland, OR"
            />
          </FieldRow>
        </div>
        <FieldRow
          label="Client"
          htmlFor="aw-client"
          helperSurfaceKey={SK.Step1Basics.Client}
          hint="Pick from your client directory."
          trailing={<InfoIcon surfaceKey={SK.Step1Basics.Client} />}
        >
          <Select
            id="aw-client"
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
        <SmartDefault<string>
          fieldName="lead_designer_name"
          defaultValue={leadDesignerName || 'You'}
          reason="Defaults to you — the designer activating this project."
          surfaceKey={SK.Step1Basics.LeadDesigner}
        >
          {({ defaultValue, onChange, hintNode }) => (
            <FieldRow
              label="Lead designer"
              htmlFor="aw-lead-designer"
              helperSurfaceKey={SK.Step1Basics.LeadDesigner}
              hint="Defaults to you. Reassign anytime from project settings."
              trailing={hintNode}
            >
              <TextInput
                id="aw-lead-designer"
                value={leadDesignerName || defaultValue}
                onChange={(v) => {
                  setField('leadDesignerName', v);
                  onChange(v);
                }}
                placeholder="You"
              />
            </FieldRow>
          )}
        </SmartDefault>
      </div>
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
      <SectionIntro
        className="mb-6"
        surfaceKey={SK.StepIntro.Scope}
        fallback="Add the rooms you're designing. FF&E categories and per-room budgets keep procurement honest."
      />
      {rooms.length === 0 ? (
        <EmptyState
          surfaceKey={SK.Step2Scope.Empty}
          size="md"
          onAction={addRoom}
        />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="type-meta-small inline-flex items-center gap-1.5 uppercase tracking-wider">
              {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'} · ${(totalBudget / 100).toLocaleString()} allocated
              <StrataInfoIcon surfaceKey={SK.Step2Scope.FfeCategories} />
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
                    <FieldRow
                      label="Room name"
                      htmlFor={`aw-room-name-${room.id}`}
                      helperSurfaceKey={SK.Step2Scope.RoomName}
                      hint="Friendly name your team uses for this space."
                    >
                      <TextInput
                        id={`aw-room-name-${room.id}`}
                        value={room.name}
                        onChange={(v) => updateRoom(room.id, { name: v })}
                        placeholder="Living Room"
                      />
                    </FieldRow>
                    <FieldRow
                      label="Room type"
                      htmlFor={`aw-room-type-${room.id}`}
                      helperSurfaceKey={SK.Step2Scope.RoomType}
                      hint="Drives default FF&E categories and templates."
                    >
                      <Select
                        id={`aw-room-type-${room.id}`}
                        value={room.roomType}
                        onChange={(v) => updateRoom(room.id, { roomType: v })}
                        options={ROOM_TYPES.map((t) => ({ value: t, label: t }))}
                        placeholder="Select…"
                      />
                    </FieldRow>
                    <FieldRow
                      label="Dimensions"
                      htmlFor={`aw-room-dim-${room.id}`}
                      helperSurfaceKey={SK.Step2Scope.RoomDimensions}
                      hint="Free-form. Used for scope sanity checks."
                      trailing={<InfoIcon surfaceKey={SK.Step2Scope.RoomDimensions} />}
                    >
                      <TextInput
                        id={`aw-room-dim-${room.id}`}
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
                <FieldRow
                  label="Budget allocation"
                  htmlFor={`aw-room-budget-${room.id}`}
                  helperSurfaceKey={SK.Step2Scope.RoomBudget}
                  hint="Slice of the total project budget reserved for this room."
                >
                  <CurrencyInput
                    id={`aw-room-budget-${room.id}`}
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
      <SectionIntro
        className="mb-6"
        surfaceKey={SK.StepIntro.Schedule}
        fallback="Set the kickoff date. The default phase set covers typical residential interiors — adjust durations and gates as needed."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <FieldRow
          label="Kickoff date"
          htmlFor="aw-kickoff-date"
          required
          helperSurfaceKey={SK.Step3Schedule.KickoffDate}
          hint="When billable work begins. Drives the phase timeline."
        >
          <TextInput
            id="aw-kickoff-date"
            type="date"
            value={kickoffDate}
            onChange={(v) => setField('kickoffDate', v)}
          />
        </FieldRow>
        <FieldRow
          label="Expected completion"
          htmlFor="aw-expected-end"
          helperSurfaceKey={SK.Step3Schedule.ExpectedEnd}
          hint={`Auto-calculated: ${totalWeeks} weeks total. Editable once activated.`}
          trailing={<InfoIcon surfaceKey={SK.Step3Schedule.ExpectedEnd} />}
        >
          <TextInput
            id="aw-expected-end"
            type="text"
            value={expectedEnd ? expectedEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
            onChange={() => {}}
          />
        </FieldRow>
      </div>

      <div className="mb-2 inline-flex items-center gap-1.5 type-meta-small uppercase tracking-wider">
        <span>Phases</span>
        <StrataInfoIcon surfaceKey={SK.Step3Schedule.Phases} />
      </div>
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
              id={`aw-phase-name-${phase.id}`}
              value={phase.name}
              onChange={(v) => updatePhase(phase.id, { name: v })}
              ariaLabel={`Phase ${idx + 1} name`}
            />
            <NumberInput
              id={`aw-phase-weeks-${phase.id}`}
              value={phase.durationWeeks}
              onChange={(v) => updatePhase(phase.id, { durationWeeks: v })}
              placeholder="weeks"
              ariaLabel={`Phase ${idx + 1} duration in weeks`}
            />
            <TextInput
              id={`aw-phase-gate-${phase.id}`}
              value={phase.gateCondition}
              onChange={(v) => updatePhase(phase.id, { gateCondition: v })}
              placeholder="Gate condition (e.g. Design package signed)"
              ariaLabel={`Phase ${idx + 1} gate condition`}
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
      <SectionIntro
        className="mb-6"
        surfaceKey={SK.StepIntro.Financials}
        fallback="Lock in the total budget, your design fee, contingency, and payment milestones. These flow into invoicing on activation."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <FieldRow
          label="Total project budget"
          htmlFor="aw-budget-total"
          required
          helperSurfaceKey={SK.Step4Financials.BudgetTotal}
          hint="All-in number the client signed off on. Includes design fee."
          trailing={<InfoIcon surfaceKey={SK.Step4Financials.BudgetTotal} />}
        >
          <CurrencyInput
            id="aw-budget-total"
            cents={budgetTotalCents}
            onChange={(c) => setField('budgetTotalCents', c)}
          />
        </FieldRow>
        <FieldRow
          label="Design fee"
          htmlFor="aw-design-fee"
          helperSurfaceKey={SK.Step4Financials.DesignFee}
          hint="Your fee for the engagement, separate from FF&E and trades."
          trailing={<StrataInfoIcon surfaceKey={SK.Step4Financials.DesignFee} />}
        >
          <CurrencyInput
            id="aw-design-fee"
            cents={designFeeCents}
            onChange={(c) => setField('designFeeCents', c)}
          />
        </FieldRow>
        <SmartDefault<number>
          fieldName="contingency_percent"
          defaultValue={10}
          reason="Industry standard 10% buffer for residential interiors."
          surfaceKey={SK.Step4Financials.Contingency}
        >
          {({ defaultValue, onChange, hintNode }) => (
            <FieldRow
              label="Contingency %"
              htmlFor="aw-contingency"
              helperSurfaceKey={SK.Step4Financials.Contingency}
              hint="Buffer for change orders and surprises. Default 10%."
              trailing={
                <>
                  <StrataInfoIcon surfaceKey={SK.Step4Financials.Contingency} />
                  {hintNode}
                </>
              }
            >
              <NumberInput
                id="aw-contingency"
                value={contingencyPercent || defaultValue}
                onChange={(v) => {
                  setField('contingencyPercent', v);
                  onChange(v);
                }}
              />
            </FieldRow>
          )}
        </SmartDefault>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="type-meta-small inline-flex items-center gap-1.5 uppercase tracking-wider">
          Payment milestones · {milestoneTotalPct}% allocated
          <StrataInfoIcon surfaceKey={SK.Step4Financials.Milestones} />
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
        {milestones.map((ms, idx) => (
          <div
            key={ms.id}
            className="grid items-center gap-3 rounded-md border p-3"
            style={{ borderColor: 'var(--border-default)', gridTemplateColumns: '2fr 80px 140px 2fr 24px' }}
          >
            <TextInput
              id={`aw-ms-label-${ms.id}`}
              value={ms.label}
              onChange={(v) => updateMs(ms.id, { label: v })}
              placeholder="e.g. Design Approval"
              ariaLabel={`Milestone ${idx + 1} label`}
            />
            <NumberInput
              id={`aw-ms-pct-${ms.id}`}
              value={ms.percentage}
              onChange={(v) => updateMs(ms.id, { percentage: v })}
              placeholder="%"
              ariaLabel={`Milestone ${idx + 1} percentage`}
            />
            <CurrencyInput
              id={`aw-ms-amount-${ms.id}`}
              cents={ms.amountCents}
              onChange={(c) => updateMs(ms.id, { amountCents: c })}
              ariaLabel={`Milestone ${idx + 1} amount`}
            />
            <TextInput
              id={`aw-ms-trigger-${ms.id}`}
              value={ms.triggerCondition}
              onChange={(v) => updateMs(ms.id, { triggerCondition: v })}
              placeholder="Trigger (e.g. Phase 2 sign-off)"
              ariaLabel={`Milestone ${idx + 1} trigger condition`}
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
          <EmptyState
            surfaceKey={SK.Step4Financials.EmptyMilestones}
            size="sm"
            onAction={addMilestone}
          />
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
      <SectionIntro
        className="mb-6"
        surfaceKey={SK.StepIntro.Team}
        fallback="Optional. Pull in support designers and pre-assign vendors. Both can be added after activation."
      />
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-1.5 type-meta-small uppercase tracking-wider">
          <span>Support designers</span>
          <InfoIcon surfaceKey={SK.Step5Team.SupportDesigners} />
        </div>
        <p className="type-body mb-3 text-[var(--text-muted)] text-[0.82rem]">
          Add additional designers from your studio who will work on this project. They&rsquo;ll
          be able to log hours, update tasks, and upload photos. Financial editing and change
          order signing remain with the lead designer.
        </p>
        <EmptyState
          surfaceKey={SK.Step5Team.EmptyTeam}
          size="sm"
        />
      </div>

      <div>
        <div className="mb-2 inline-flex items-center gap-1.5 type-meta-small uppercase tracking-wider">
          <span>Vendor pre-assignments</span>
          <StrataInfoIcon surfaceKey={SK.Step5Team.VendorAssignments} />
        </div>
        <p className="type-body mb-3 text-[var(--text-muted)] text-[0.82rem]">
          Optional. Pre-assign vendors to FF&E categories for items where you have standing
          relationships. Other items can be assigned during procurement.
        </p>
        <EmptyState
          surfaceKey={SK.Step5Team.EmptyVendors}
          size="sm"
        />
      </div>

      {/* Suppress unused warnings while these features are scaffolded */}
      <span className="hidden">{team.length}{vendorAssignments.length}{setField.toString().length}</span>
    </div>
  );
}

// ── Step 06 — Client Access ─────────────────────────────────────────────────

export function Step06Access() {
  const { visibilityTier, setField } = useActivationWizard();

  // Each visibility tier maps to a Patina-specific surface key so concept
  // copy (rendered via <StrataInfoIcon>) can be authored per-tier in Sanity.
  const TIER_KEY_MAP: Record<ClientVisibilityTier, string> = {
    full: SK.Step6Access.TierFull,
    milestone: SK.Step6Access.TierMilestone,
    curated: SK.Step6Access.TierCurated,
  };

  return (
    <SmartDefault<ClientVisibilityTier>
      fieldName="visibility_tier"
      defaultValue="milestone"
      reason="Milestone updates is the most common choice — full visibility can be enabled later."
      surfaceKey={SK.Step6Access.VisibilityTier}
    >
      {({ onChange }) => (
        <div>
          <SectionIntro
            className="mb-4"
            surfaceKey={SK.StepIntro.Access}
            fallback="Choose how much detail your client sees. You can change this later from project settings."
          />
          <div className="mb-3 inline-flex items-center gap-1.5 type-meta-small uppercase tracking-wider">
            <span>Client visibility tier</span>
            <StrataInfoIcon surfaceKey={SK.Step6Access.VisibilityTier} />
          </div>
          <div className="flex flex-col gap-3">
            {VISIBILITY_OPTIONS.map((opt) => {
              const active = opt.value === visibilityTier;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setField('visibilityTier', opt.value);
                    onChange(opt.value);
                  }}
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
                    <span className="type-label inline-flex items-center gap-1.5">
                      {opt.label}
                      <StrataInfoIcon surfaceKey={TIER_KEY_MAP[opt.value]} />
                    </span>
                  </div>
                  <p className="type-body text-[0.78rem] text-[var(--text-muted)]">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </SmartDefault>
  );
}

// ── Step 07 — Review ────────────────────────────────────────────────────────

export function Step07Review() {
  const w = useActivationWizard();

  const totalRoomsBudget = w.rooms.reduce((s, r) => s + r.budgetCents, 0);
  const totalWeeks = w.phases.reduce((s, p) => s + p.durationWeeks, 0);
  const milestonePct = w.milestones.reduce((s, m) => s + m.percentage, 0);

  return (
    <div>
      <SectionIntro
        className="mb-4"
        surfaceKey={SK.StepIntro.Review}
        fallback="One last look. Everything is editable after activation — this confirms what gets created on the live project."
      />
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

        <div
          className="md:col-span-2 rounded-md border-2 p-4"
          style={{ borderColor: 'var(--color-sage, #A8B5A0)', background: 'rgba(168, 181, 160, 0.06)' }}
        >
          <SectionIntro
            surfaceKey={SK.Step7Review.ActivationOutcome}
            fallback="Activating will create the project workspace, generate room cards and the FF&E pipeline, assign payment milestones, and notify the client. You can edit any field afterward from the Project Detail page."
          />
        </div>
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

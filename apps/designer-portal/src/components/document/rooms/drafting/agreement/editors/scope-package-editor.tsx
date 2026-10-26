"use client";

import { useId } from "react";
import type { ScopePackagePayload, ScopePartyKind, ScopeEditionState } from "@patina/types";
import { readScopePackagePayload, useScopeEditions } from "@patina/supabase";

// Approved commission names: round8/README.md, “What teams are building”.
const ARRANGEMENTS = [
  "Full service with a building team",
  "Cabinetry-focused commission",
  "Furnishings with mixed buying",
  "Design-only/client implementation",
] as const;

const SLOTS = [
  ["design", "Design"], ["purchasing", "Purchasing"], ["payer", "Payer"],
  ["fabrication_contract", "Fabrication contract"], ["installation", "Installation"],
] as const;
const PARTIES: Record<ScopePartyKind, string> = {
  studio: "Studio", client: "Client", gc: "General contractor", other: "Other", none: "None",
};

export function ScopeArrangementChoices() {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3 py-4">
      <h2 id={id} className="t-head">Service arrangements</h2>
      <p className="t-body-sm">Not yet available. Arrangements cannot be applied in this build.</p>
      <fieldset disabled aria-describedby={`${id}-meaning`} className="space-y-2">
        <legend className="t-meta">Commission choices · not yet available</legend>
        {ARRANGEMENTS.map((label) => (
          <label key={label} className="flex items-center gap-2 t-body-sm">
            <input type="radio" name={id} value={label} />{label}
          </label>
        ))}
      </fieldset>
      <p id={`${id}-meaning`} className="t-meta">
        Proposed responsibilities do not appoint anyone, grant access or authorize work.
        Signed client and native readers must be ready before activation.
      </p>
    </section>
  );
}

export function ScopePackageEditor({ payload, projectId, inheritedEditionId }: {
  payload: Record<string, unknown>;
  projectId?: string | null;
  inheritedEditionId?: string | null;
}) {
  let pkg: ScopePackagePayload;
  try { pkg = readScopePackagePayload(payload); }
  catch { return <p role="alert">This scope package cannot be read. Its recorded content has not been changed.</p>; }
  return (
    <div className="space-y-4">
      <p className="t-body-sm">Scope editing is not yet available. This recorded package is read-only.</p>
      <fieldset disabled className="space-y-3">
        <legend className="t-head">{pkg.label}</legend>
        <label className="block t-body-sm">Inclusion
          <select disabled value={pkg.inclusion} className="field-control">
            <option value="included">Included</option><option value="excluded">Excluded</option>
            <option value="conditional">Conditional</option>
          </select>
        </label>
        {pkg.conditionText && <label className="block t-body-sm">Condition
          <textarea className="field-control" value={pkg.conditionText} readOnly />
        </label>}
        {SLOTS.map(([slot, label]) => <label key={slot} className="block t-body-sm">{label}
          <select disabled value={pkg.responsibilities[slot]} className="field-control">
            {Object.entries(PARTIES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>)}
      </fieldset>
      <p className="t-meta">Package: {pkg.packageKey ?? "Key not yet allocated"}</p>
      <p className="t-meta">{pkg.overrideOf ? `Overrides ${pkg.overrideOf}` : "No package override recorded"}</p>
      <p className="t-meta">Rooms: {pkg.roomIds?.join(", ") || "No room binding recorded"}</p>
      <p className="t-body-sm">Responsibilities are separate: who purchases does not determine who pays, designs or installs. No appointment, access or fabrication authority is granted here.</p>
      <section aria-label="This draft's new service bindings" className="space-y-2">
        <h3 className="t-head">This draft’s new service bindings</h3>
        <p className="t-meta">An addendum starts without new bindings. Earlier signed bindings remain in the edition record; they are never copied into this draft.</p>
        {(["design", "installation"] as const).map((slot) => <p key={slot} className="t-body-sm">
          {slot === "design" ? "Design" : "Installation"}: {pkg.serviceBindings?.[slot]?.join(", ") || "No new binding recorded"}
        </p>)}
      </section>
      {projectId && inheritedEditionId && pkg.packageKey
        ? <InheritedScopeBindings projectId={projectId} editionId={inheritedEditionId} packageKey={pkg.packageKey} />
        : <p className="t-meta">Inherited bindings unavailable — no source scope edition is recorded for this draft.</p>}
    </div>
  );
}

function InheritedScopeBindings({ projectId, editionId, packageKey }: {
  projectId: string; editionId: string; packageKey: string;
}) {
  const query = useScopeEditions(projectId);
  return <section aria-label="Inherited service bindings" className="space-y-2">
    <h3 className="t-head">Inherited service bindings · read-only</h3>
    <InheritedBindingReading state={query.editionState} editionId={editionId} packageKey={packageKey} />
    {query.refetchError && <p role="alert">The scope refresh failed. The last recorded bindings remain below.</p>}
    {(query.editionState.status === "error" || query.refetchError) && <button type="button" className="g-act g-act--tertiary" onClick={() => void query.refetch()}>Retry scope reading</button>}
  </section>;
}

export function InheritedBindingReading({ state, editionId, packageKey }: {
  state: ScopeEditionState; editionId: string; packageKey: string;
}) {
  if (state.status === "loading") return <p role="status">Reading the source scope edition…</p>;
  if (state.status === "error") return <p role="alert">The source scope edition could not be read. Its bindings are unknown.</p>;
  if (state.status !== "recorded") return <p className="t-meta">Inherited bindings unavailable — no recorded scope edition.</p>;
  const edition = state.editions.find((entry) => entry.id === editionId);
  const bindings = edition?.phases.filter((phase) => phase.packageKey === packageKey && phase.serviceSlot != null) ?? [];
  if (!bindings.length) return <p className="t-meta">Inherited bindings unavailable — the source edition records no bindings for this package.</p>;
  return <div>
    <p className="t-meta">Scope edition {edition!.editionNumber} · {edition!.status}</p>
    <ul className="t-body-sm">{bindings.map((phase) => <li key={phase.sourceProposalPhaseId}>
      {phase.serviceSlot === "design" ? "Design" : "Installation"} · phase {phase.sourceProposalPhaseId} · bound in edition {phase.boundInEdition}
    </li>)}</ul>
  </div>;
}

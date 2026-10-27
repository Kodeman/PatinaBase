"use client";

import { useId, useState } from "react";
import {
  externalFulfilmentCapability,
  type CoordinationItem,
  type Database,
  type ExternalFulfilmentReading,
  type PlanRoomBundle,
  type ProjectRosterRow,
  useProductConfiguration,
} from "@patina/supabase";
import { DocumentAction, DocumentActionRow } from "../document-action";

type ProjectRoom = Database["public"]["Tables"]["project_rooms"]["Row"];
type FulfilmentEvent = ExternalFulfilmentReading["reading"]["events"][number];
type Manifest = ExternalFulfilmentReading["reading"]["manifests"][number];

/** Maker evidence against the current issue and the configuration's live snapshot. */
export type EvidenceState = "current" | "earlier" | "unknown" | "none";

/** One read each; `data` is undefined while pending or after a failed read. */
export interface PackageJoins {
  plans: { data?: PlanRoomBundle; isError: boolean };
  roster: { data?: ProjectRosterRow[]; isError: boolean };
  decisions: { data?: CoordinationItem[]; isError: boolean };
  rooms: { data?: ProjectRoom[]; isError: boolean };
}

export interface UnitReading {
  unit: string;
  /** Open holds naming this unit (a release names its hold). */
  holds: FulfilmentEvent[];
  /** The latest instruction (highest event_seq) that covers this unit. */
  instruction: FulfilmentEvent | null;
  /** Instructed, named by no open hold, and the package is not installed or cancelled. */
  proceeds: boolean;
  /** Maker evidence bound to this unit (see `bindingEvidence`). */
  evidence: EvidenceState;
}

export interface PackageReadingModel {
  /** Every recorded event, in event_seq order. */
  events: FulfilmentEvent[];
  issues: FulfilmentEvent[];
  currentIssue: FulfilmentEvent | null;
  openHolds: FulfilmentEvent[];
  releases: FulfilmentEvent[];
  instructions: FulfilmentEvent[];
  receipts: FulfilmentEvent[];
  installs: FulfilmentEvent[];
  contracts: FulfilmentEvent[];
  /** Installed or cancelled: nothing proceeds. */
  terminal: boolean;
  /** Per binding id; a binding is never "none". */
  bindingEvidence: Map<string, Exclude<EvidenceState, "none">>;
  units: UnitReading[];
}

const TERMINAL_STATUSES = new Set(["installed", "cancelled"]);

/**
 * Reads the package from its recorded events only. Order is event_seq (the
 * server's lock order), never a timestamp; nothing here infers a fact the
 * reading does not carry.
 *
 * `liveSnapshot` is the configuration's current snapshot hash: `null` when the
 * package has no configuration, `undefined` while it is unread or failed. Like
 * the native fabrication gate (00879), evidence covers the latest issue AND
 * that live snapshot; a binding to an older snapshot no longer covers.
 */
export function readPackage(
  row: ExternalFulfilmentReading,
  liveSnapshot: string | null | undefined,
): PackageReadingModel {
  const events = [...row.reading.events].sort((a, b) => a.event_seq - b.event_seq);
  const ofKind = (kind: string) => events.filter((event) => event.event_kind === kind);
  const releases = ofKind("release_hold");
  const released = new Set(releases.map((event) => event.releases_event_id));
  const openHolds = ofKind("hold").filter((hold) => !released.has(hold.id));
  const issues = ofKind("package_issued");
  const currentIssue = issues.at(-1) ?? null;
  const instructions = ofKind("fabrication_instruction");
  const terminal = TERMINAL_STATUSES.has(row.status);
  const expectedSnapshot = row.configuration_id ? liveSnapshot : null;
  const bindingEvidence = new Map(
    row.reading.bindings.map((binding): [string, Exclude<EvidenceState, "none">] => {
      if (currentIssue === null || binding.covers_plan_issue_id !== currentIssue.plan_issue_id) {
        return [binding.id, "earlier"];
      }
      if (expectedSnapshot === undefined) return [binding.id, "unknown"];
      return [
        binding.id,
        binding.covers_configuration_snapshot_hash === expectedSnapshot ? "current" : "earlier",
      ];
    }),
  );
  const units = row.units.map((unit): UnitReading => {
    const states = row.reading.bindings
      .filter((binding) => binding.units.includes(unit))
      .map((binding) => bindingEvidence.get(binding.id));
    const holds = openHolds.filter((hold) => hold.affected_units?.includes(unit));
    const instruction =
      instructions.filter((event) => event.affected_units?.includes(unit)).at(-1) ?? null;
    return {
      unit,
      holds,
      instruction,
      proceeds: !terminal && holds.length === 0 && instruction !== null,
      evidence: states.includes("current")
        ? "current"
        : states.includes("unknown")
          ? "unknown"
          : states.length > 0
            ? "earlier"
            : "none",
    };
  });
  return {
    events,
    issues,
    currentIssue,
    openHolds,
    releases,
    instructions,
    receipts: ofKind("received"),
    installs: ofKind("installed"),
    contracts: ofKind("contract_reported"),
    terminal,
    bindingEvidence,
    units,
  };
}

function unitEvidenceWords(unit: UnitReading, terminal: boolean): string {
  if (unit.evidence === "current") return "Maker evidence bound to the current issue";
  // The live configuration is pending or failed: no mismatch is known.
  if (unit.evidence === "unknown") {
    return unit.instruction
      ? "Instructed; the recorded instruction keeps its frozen contents. Its match to the current configuration is not confirmed"
      : "The current configuration has not been read, so evidence coverage is not confirmed";
  }
  // C5: a recorded instruction keeps its frozen contents through a re-issue.
  if (unit.instruction) {
    return "Instructed against an earlier issue or configuration; the recorded instruction keeps its frozen contents";
  }
  if (unit.evidence === "earlier") {
    return terminal
      ? "Maker evidence covers an earlier issue or configuration"
      : "Maker evidence covers an earlier issue or configuration; a new submittal is needed before instruction";
  }
  return "No maker evidence bound";
}

function siteWords(
  row: ExternalFulfilmentReading,
  pkg: PlanRoomBundle["packages"][number] | undefined,
  joins: PackageJoins,
): string {
  if (!row.reading.package_id) return "No package record for this key";
  // Never a fabricated scope while the drawing record is unread or failed.
  if (joins.plans.isError) return "Site could not be read";
  if (!joins.plans.data) return "Reading site…";
  if (!pkg) return "This package is not in the job's drawing record";
  if (!pkg.project_room_id) return "Whole job";
  const room = joins.rooms.data?.find((entry) => entry.id === pkg.project_room_id);
  if (room) return room.name;
  if (joins.rooms.isError) return `Room ${short(pkg.project_room_id)} (rooms could not be read)`;
  if (!joins.rooms.data) return "Reading room…";
  return `Room ${short(pkg.project_room_id)}`;
}

const EVENT_LABELS: Record<string, string> = {
  quote_reported: "Quote",
  contract_reported: "Contract",
  package_issued: "Package issued",
  fabrication_instruction: "Fabrication instruction",
  hold: "Hold",
  release_hold: "Hold released",
  received: "Received on site",
  installed: "Installed",
  cancelled: "Cancelled",
};

const PARTY_LABELS: Record<string, string> = {
  gc: "GC",
  client: "Client",
  studio: "Studio",
  maker: "Maker",
  supplier: "Supplier",
};

const MEMBER_LABELS: Record<string, string> = {
  plan_issue: "Issued drawing set",
  plan_issue_print: "Issued sheet",
  plan_print: "Drawing print",
  product_configuration: "Detailed configuration",
  custom_commission_revision: "Commission revision",
  review_item: "Sample or review decision",
  approval_artifact: "Approval record",
  po_spec_snapshot: "Spec snapshot",
  coordination_item_revision: "Maker submittal round",
};

function stamp(value: string | null | undefined): string {
  if (!value) return "date not recorded";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const short = (id: string | null | undefined) => (id ? id.slice(0, 8) : "none");
const party = (kind: string) => PARTY_LABELS[kind] ?? kind;
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const evidenceField = (event: FulfilmentEvent, key: string): unknown =>
  (event.evidence as Record<string, unknown>)[key];

function namer(roster: PackageJoins["roster"]) {
  // Authorship is the recorded profile, never the seat's current holder.
  return (profileId: string | null) => {
    if (!profileId) return "Not recorded";
    if (roster.isError) return "A recorded person (names could not be read)";
    if (!roster.data) return "A recorded person";
    const row = roster.data.find((entry) => entry.profile_id === profileId);
    // The roster has no implicit-owner row, so an absent name says nothing about departure.
    return row?.display_name ?? "A recorded person (name unresolved)";
  };
}

function Authorship({
  event,
  nameOf,
}: {
  event: FulfilmentEvent;
  nameOf: (id: string | null) => string;
}) {
  return (
    <span className="t-meta block" data-authorship={event.id}>
      {event.evidence_level === "verified" ? "Verified" : "Reported"} · recorded by{" "}
      <span data-recorded-by={event.recorded_by}>{nameOf(event.recorded_by)}</span>{" "}
      {stamp(event.recorded_at)}
      {event.evidence_level === "verified" && (
        <>
          {" "}· verified by{" "}
          <span data-verified-by={event.verified_by ?? ""}>{nameOf(event.verified_by)}</span>{" "}
          {stamp(event.verified_at)}
        </>
      )}
    </span>
  );
}

function ExactIssue({
  model,
  plans,
}: {
  model: PackageReadingModel;
  plans: PackageJoins["plans"];
}) {
  const event = model.currentIssue;
  if (!event) {
    return (
      <p className="t-body-sm py-3">
        No package issue is recorded. Maker evidence cannot be bound until the package is issued.
      </p>
    );
  }
  const issue = plans.data?.issues.find((row) => row.id === event.plan_issue_id);
  const prints = (plans.data?.issuePrints ?? [])
    .filter((print) => print.issue_id === event.plan_issue_id)
    .sort((a, b) => a.sheet_number.localeCompare(b.sheet_number));
  const transmittals = (plans.data?.transmittals ?? []).filter(
    (row) => row.issue_id === event.plan_issue_id,
  );
  const snapshot = evidenceField(event, "configurationSnapshotHash");
  return (
    <div data-exact-issue={event.plan_issue_id ?? ""}>
      {plans.isError ? (
        <p role="alert" className="t-body-sm py-3">
          Issue contents could not be read. The recorded issue is{" "}
          <span data-recorded-issue>{event.plan_issue_id ?? "none"}</span>.
        </p>
      ) : !plans.data ? (
        <p role="status" className="t-body-sm py-3">Reading issue contents…</p>
      ) : !issue ? (
        <p className="t-body-sm py-3">This issue is not in the job&apos;s drawing record.</p>
      ) : (
        <>
          <p className="t-body-sm font-medium">
            Issue {issue.issue_number} · {issue.name}
          </p>
          <p className="t-meta">
            Issued {stamp(issue.issued_at)} · {issue.sheet_count} sheets · set checksum{" "}
            {issue.set_checksum.slice(0, 12)}
          </p>
          <ul className="divide-y divide-[var(--border-default)]" aria-label="Issued sheets">
            {prints.map((print) => (
              <li key={print.id} className="t-body-sm py-2" data-issue-print={print.print_id}>
                {print.sheet_number} · {print.sheet_title}
                <span className="t-meta block">
                  Revision {print.rev_letter} · sha256 {print.sha256.slice(0, 12)}
                </span>
              </li>
            ))}
          </ul>
          <h5 className="t-body-sm mt-3 font-medium">Sent and received</h5>
          {transmittals.length === 0 ? (
            <p className="t-meta">This issue has not been sent to anyone.</p>
          ) : (
            <ul aria-label="Issue transmittals">
              {transmittals.map((row) => {
                const opened = (plans.data?.tokens ?? [])
                  .filter((token) => token.transmittal_id === row.id)
                  .map((token) => token.first_opened_at)
                  .filter((value): value is string => !!value)
                  .sort()[0];
                return (
                  <li key={row.id} className="t-meta" data-transmittal={row.id}>
                    Sent to {row.party_display_name}
                    {row.party_company ? ` (${row.party_company})` : ""} for {row.purpose} ·{" "}
                    {stamp(row.sent_at)} ·{" "}
                    {opened ? `opened by the recipient ${stamp(opened)}` : "not opened yet"}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {typeof snapshot === "string" && (
        <p className="t-meta mt-2">Configuration snapshot {snapshot.slice(0, 12)} frozen with this issue.</p>
      )}
      {model.issues.length > 1 && (
        <p className="t-meta mt-2" data-superseded-issues={model.issues.length - 1}>
          Re-issued {model.issues.length - 1} time{model.issues.length > 2 ? "s" : ""}. Maker
          evidence bound to an earlier issue no longer covers uninstructed units; recorded
          instructions keep their frozen contents.
        </p>
      )}
    </div>
  );
}

function ManifestContents({ manifest }: { manifest: Manifest | undefined }) {
  if (!manifest) return <p className="t-meta">Instruction contents are not in this reading.</p>;
  const members = manifest.members as unknown as Array<Record<string, unknown>>;
  return (
    <div data-manifest={manifest.id}>
      <p className="t-meta">
        Exact contents · manifest {manifest.manifest_hash.slice(0, 12)} · {members.length}{" "}
        members
      </p>
      <ul aria-label="Instruction contents">
        {members.map((member) => {
          const kind = String(member.kind);
          const version = member.version ?? member.rev;
          return (
            <li key={`${kind}:${String(member.id)}`} className="t-meta" data-member-kind={kind}>
              {MEMBER_LABELS[kind] ?? kind} {short(String(member.id))}
              {version !== undefined ? ` · v${String(version)}` : ""} · sha256{" "}
              {String(member.sha256).slice(0, 12)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function decisionWords(decisions: PackageJoins["decisions"], id: unknown) {
  if (typeof id !== "string") return "No decision named";
  if (decisions.isError) return `Decision ${short(id)} (decisions could not be read)`;
  const item = decisions.data?.find((row) => row.id === id);
  if (!item) return `Decision ${short(id)}`;
  return `${item.title} · ${item.status}${item.due_date ? ` · due ${stamp(item.due_date)}` : ""}`;
}

/**
 * CP-01 — one external cabinet package read from its native record: the exact
 * issue, maker evidence, per-unit instruction and holds, receipt and install.
 * The GC buys and contracts it; no studio PO, price or total is derived here.
 */
export function PackageReading({
  row,
  joins,
}: {
  row: ExternalFulfilmentReading;
  joins: PackageJoins;
}) {
  const [showPrice, setShowPrice] = useState(false);
  const inactiveId = useId();
  const priceId = useId();
  const configuration = useProductConfiguration(row.configuration_id);
  // A failed refetch keeps stale data; only a successful read confirms coverage.
  const model = readPackage(
    row,
    !row.configuration_id
      ? null
      : configuration.isError
        ? undefined
        : configuration.data?.snapshotHash,
  );
  const nameOf = namer(joins.roster);
  const pkg = joins.plans.data?.packages.find((entry) => entry.id === row.reading.package_id);
  const proceeding = model.units.filter((unit) => unit.proceeds).map((unit) => unit.unit);
  const awaiting = model.units
    .filter((unit) => unit.holds.length === 0 && !unit.instruction)
    .map((unit) => unit.unit);
  const headingId = `cabinet-package-${row.id}`;

  return (
    <article
      aria-labelledby={headingId}
      data-cabinet-package={row.id}
      data-package-key={row.package_key}
      className="border-t border-[var(--border-default)] py-6"
    >
      <h3 id={headingId} tabIndex={-1} className="font-heading text-2xl">
        {pkg ? `${pkg.code} · ${pkg.title}` : `Package ${row.package_key}`}
      </h3>
      <p className="t-meta mt-1">
        {row.units.length} units · {row.status} · bought by {party(row.buyer_party_kind)}, paid by{" "}
        {party(row.payer_party_kind)}, contracted by {party(row.contracting_party_kind)}
      </p>
      <p className="t-body-sm mt-2" data-no-studio-po>
        Outside the studio furnishing subtotal. No studio purchase order, purchase or invoice
        exists for this package.
      </p>

      <section aria-label="How the package is developed" className="mt-6">
        <h4 className="font-heading text-xl">Route</h4>
        {row.configuration_id ? (
          <p className="t-body-sm" data-route="detail-verification">
            Detailed design → maker verification. The studio&apos;s configuration{" "}
            {short(row.configuration_id)} is the detail; the maker verifies it through a bound
            submittal.
          </p>
        ) : (
          <p className="t-body-sm" data-route="intent-shop-drawing">
            Designer intent → maker drawing. The studio&apos;s issued set carries the intent; the
            maker develops shop drawings through a bound submittal.
          </p>
        )}
        <dl className="t-meta mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>Package</dt>
          <dd data-join="package">
            {row.reading.package_id
              ? pkg
                ? `${pkg.code} (${pkg.package_kind})`
                : `Record ${short(row.reading.package_id)}`
              : "No package record for this key"}
          </dd>
          <dt>Site</dt>
          <dd data-join="site">{siteWords(row, pkg, joins)}</dd>
          <dt>Commercial scope</dt>
          <dd data-join="commercial">
            Edition {short(row.scope_edition_id)} · {row.package_key}
          </dd>
          <dt>Maker evidence</dt>
          <dd data-join="evidence">
            {row.reading.bindings.length === 0
              ? "No submittal bound yet"
              : row.reading.bindings.map((binding) => (
                  <span key={binding.id} className="block" data-binding={binding.decision_id}>
                    {decisionWords(joins.decisions, binding.decision_id)} · units{" "}
                    {binding.units.join(", ")} · bound by {nameOf(binding.bound_by)}
                    {model.bindingEvidence.get(binding.id) === "earlier"
                      ? " · covers an earlier issue or configuration"
                      : model.bindingEvidence.get(binding.id) === "unknown"
                        ? " · configuration coverage not confirmed"
                        : ""}
                  </span>
                ))}
          </dd>
        </dl>
      </section>

      <section aria-label="Exact issue" className="mt-6">
        <h4 className="font-heading text-xl">Exact issue</h4>
        <ExactIssue model={model} plans={joins.plans} />
      </section>

      <section aria-label="Units" className="mt-6">
        <h4 className="font-heading text-xl">Units</h4>
        <ul className="divide-y divide-[var(--border-default)]">
          {model.units.map((unit) => (
            <li
              key={unit.unit}
              className="t-body-sm py-2"
              data-unit={unit.unit}
              data-unit-state={
                unit.holds.length > 0 ? "held" : unit.instruction ? "instructed" : "not-instructed"
              }
              data-unit-proceeds={unit.proceeds}
            >
              <span className="font-medium">{unit.unit}</span> ·{" "}
              {unit.holds.length > 0
                ? "Held"
                : unit.instruction
                  ? `Instructed (${unit.instruction.evidence_level}) · ${
                      unit.proceeds ? "proceeds" : `package ${row.status}`
                    }`
                  : "Not instructed"}
              <span className="t-meta block">{unitEvidenceWords(unit, model.terminal)}</span>
            </li>
          ))}
        </ul>
      </section>

      {(model.openHolds.length > 0 || model.releases.length > 0) && (
        <section aria-label="Holds" className="mt-6">
          <h4 className="font-heading text-xl">Holds</h4>
          {model.openHolds.map((hold) => {
            const affected = hold.affected_units ?? [];
            return (
              <div key={hold.id} className="py-3" data-hold={hold.id}>
                <p className="t-body-sm">
                  Held units: <span data-held-units>{affected.join(", ")}</span>
                </p>
                <p className="t-body-sm">
                  Instructed and not held, so they proceed:{" "}
                  <span data-proceeding-units>
                    {proceeding.length > 0
                      ? proceeding.join(", ")
                      : model.terminal
                        ? `none, the package is ${row.status}`
                        : "none"}
                  </span>
                </p>
                {awaiting.length > 0 && (
                  <p className="t-body-sm">
                    Not held, and not instructed yet:{" "}
                    <span data-uninstructed-units>{awaiting.join(", ")}</span>
                  </p>
                )}
                <p className="t-meta">
                  Decision: {decisionWords(joins.decisions, evidenceField(hold, "decisionId"))}
                </p>
                <p className="t-meta">
                  Price and time impact are not recorded on this hold; they belong to its decision.
                </p>
                <Authorship event={hold} nameOf={nameOf} />
              </div>
            );
          })}
          {model.releases.map((release) => (
            <div key={release.id} className="py-2" data-hold-release={release.releases_event_id ?? ""}>
              <p className="t-meta">Hold released by its approved decision.</p>
              <Authorship event={release} nameOf={nameOf} />
            </div>
          ))}
        </section>
      )}

      <section aria-label="Instruction and receipt" className="mt-6">
        <h4 className="font-heading text-xl">Instruction and receipt</h4>
        {model.instructions.length === 0 ? (
          <p className="t-body-sm py-2">No fabrication instruction is recorded.</p>
        ) : (
          model.instructions.map((event) => (
            <div key={event.id} className="py-3" data-instruction={event.id}>
              <p className="t-body-sm">
                Instructed units {(event.affected_units ?? []).join(", ")} · by{" "}
                {nameOf(event.actor_id)}
              </p>
              <Authorship event={event} nameOf={nameOf} />
              <ManifestContents
                manifest={row.reading.manifests.find((entry) => entry.id === event.manifest_id)}
              />
            </div>
          ))
        )}
        {model.receipts.map((event) => (
          <div key={event.id} className="py-2" data-receipt={event.id}>
            <p className="t-body-sm">Received on site. Receipt is not acceptance.</p>
            <Authorship event={event} nameOf={nameOf} />
          </div>
        ))}
        {model.installs.map((event) => (
          <div key={event.id} className="py-2" data-install={event.id}>
            <p className="t-body-sm">Installed. Only a verified install completes the line.</p>
            <Authorship event={event} nameOf={nameOf} />
          </div>
        ))}
      </section>

      <section aria-label="Package history" className="mt-6">
        <h4 className="font-heading text-xl">History</h4>
        <ol>
          {model.events.map((event) => (
            <li key={event.id} className="t-body-sm py-1" data-event-seq={event.event_seq}>
              {event.event_seq}. {EVENT_LABELS[event.event_kind] ?? event.event_kind}
              <Authorship event={event} nameOf={nameOf} />
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="GC price" className="mt-6">
        <button
          type="button"
          className="t-body-sm underline"
          aria-expanded={showPrice}
          aria-controls={priceId}
          onClick={() => setShowPrice((value) => !value)}
        >
          {showPrice ? "Hide the GC's reported amounts" : "Show the GC's reported amounts"}
        </button>
        <div id={priceId} hidden={!showPrice} data-gc-price>
          {showPrice && (
            <ul className="t-meta mt-2">
              <li>
                Reported price:{" "}
                {row.reported_price_cents === null
                  ? "none reported"
                  : `${money(row.reported_price_cents)} (${row.price_visibility === "client_visible" ? "client may see" : "studio only"})`}
              </li>
              {model.contracts.map((event) => {
                const amount = evidenceField(event, "contractAmountCents");
                return (
                  <li key={event.id}>
                    Contract {event.evidence_level}:{" "}
                    {typeof amount === "number" ? money(amount) : "amount not recorded"}
                  </li>
                );
              })}
              {model.instructions.map((event) => (
                <li key={event.id}>
                  Instruction amount:{" "}
                  {event.amount_cents === null ? "not recorded" : money(event.amount_cents)}
                </li>
              ))}
              <li>Informational. Never a studio price, total, purchase order or invoice.</li>
            </ul>
          )}
        </div>
      </section>

      <p id={inactiveId} className="t-meta mt-6" data-acts-inactive={externalFulfilmentCapability.reason}>
        These acts are not active yet. Nothing here records an instruction, hold, receipt or
        verification.
      </p>
      <DocumentActionRow surfaceKey="cabinetry" regionKey={`package-${row.id}`}>
        {[
          ["record-fabrication-instruction", "Record instruction"],
          ["place-cabinet-hold", "Place a hold"],
          ["record-cabinet-receipt", "Record receipt"],
          ["verify-cabinet-event", "Verify an event"],
        ].map(([key, label]) => (
          <DocumentAction
            key={key}
            actionKey={key}
            variant="secondary"
            disabled={!externalFulfilmentCapability.available}
            held
            aria-describedby={inactiveId}
          >
            {label}
          </DocumentAction>
        ))}
      </DocumentActionRow>
    </article>
  );
}

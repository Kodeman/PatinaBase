"use client";

/**
 * One editor per kind, then per schedule variant.
 *
 * The five money editors are lifted from the seven-facet room's own facets so
 * a designer who has used the Contract Room recognises them: the role rows and
 * `+ Add a role` from facet 03, the deposit chips from facet 04, the activation
 * `<Select>` from facet 05, the cadence `<Select>` from facet 06.
 *
 * Every editor hands back a whole payload object. The composer holds the list;
 * this file holds no state but the transient text of a money field being typed.
 *
 * R5 — prose never carries money. A `clause` or `list` editor cannot write a
 * cents field, and the server's projection is keyed on `part_key` anyway, so a
 * custom schedule part cannot rewrite the terms row either.
 */

import type { AgreementPart } from "@patina/types";
import { Button, Input, Select, Textarea } from "@/components/ui/controls";
import {
  CADENCE_OPTIONS,
  CREDIT_RULE_OPTIONS,
  dollars,
  partKindLabel,
  readBody,
  readCents,
  readItems,
  readRoles,
  toCents,
  toCentsOrNull,
} from "./part-kinds";
import { AuthorityChip } from "./schedules/authority-chip";
import {
  authorityStanding,
  RECORD_ONLY_HELP,
  scheduleEditorFor,
  FlatEditor,
  PerPhaseEditor,
  ProcurementEditor,
} from "./schedules";

const labelClass =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export interface PartEditorProps {
  part: AgreementPart;
  onChange: (payload: Record<string, unknown>) => void;
  readOnly: boolean;
  /** `agreement-parts && agreement-library`, resolved by the composer. Off,
   *  this file is Wave 1's editor exactly — no chip, no record-only help
   *  line, and the eight record-only variants stay in `UnsupportedPartCard`. */
  libraryOn?: boolean;
}

export function PartEditor({
  part,
  onChange,
  readOnly,
  libraryOn = false,
}: PartEditorProps) {
  const chipped = libraryOn && part.kind === "schedule";
  return (
    <section aria-label={`${part.title} editor`} className="space-y-4">
      <header>
        <p className={labelClass}>
          {partKindLabel(part.kind, part.variant)}
          {chipped && (
            <>
              {" · "}
              <AuthorityChip variant={part.variant} />
            </>
          )}
        </p>
        <h2 className="mt-1 font-heading text-[1.25rem] italic text-[var(--color-charcoal)]">
          {part.title}
        </h2>
      </header>
      <PartEditorBody
        part={part}
        onChange={onChange}
        readOnly={readOnly}
        libraryOn={libraryOn}
      />
      {chipped && authorityStanding(part.variant) === "record-only" && (
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          {RECORD_ONLY_HELP}
        </p>
      )}
    </section>
  );
}

function PartEditorBody({
  part,
  onChange,
  readOnly,
  libraryOn = false,
}: PartEditorProps) {
  const payload = part.payload ?? {};

  if (part.kind === "clause") {
    return (
      <label className={labelClass}>
        Body
        <Textarea
          className="mt-2 min-h-40 normal-case tracking-normal"
          disabled={readOnly}
          value={readBody(payload)}
          onChange={(event) =>
            onChange({ ...payload, body: event.target.value })
          }
          placeholder="The language the client reads and signs."
        />
      </label>
    );
  }

  if (part.kind === "list") {
    return (
      <ListEditor payload={payload} onChange={onChange} readOnly={readOnly} />
    );
  }

  // An Attachment is a leaf, not a paragraph: it sits below the agreement on
  // the client's page with its own rule, and — when the studio asks — an "I
  // received this" line she ticks before she can sign. The picker can add one
  // from Wave 2 on, so Wave 2 is where it gets an editor; flag off it stays in
  // Wave 1's read-only card.
  if (part.kind === "attachment" && libraryOn) {
    return (
      <AttachmentEditor
        payload={payload}
        onChange={onChange}
        readOnly={readOnly}
      />
    );
  }

  if (part.kind !== "schedule") {
    return <UnsupportedPartCard part={part} />;
  }

  switch (part.variant) {
    case "rate_card":
      return (
        <RateCardEditor
          payload={payload}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    case "ceiling":
      return (
        <CeilingEditor
          payload={payload}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    case "retainer":
      return (
        <RetainerEditor
          payload={payload}
          onChange={onChange}
          readOnly={readOnly}
          libraryOn={libraryOn}
        />
      );
    case "cadence":
      return (
        <CadenceEditor
          payload={payload}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    default:
      break;
  }

  // Everything else lives in `schedules/`. Wave 1 opened three of them —
  // flat, per-phase, the furnishings deposit — and Wave 2 opens five more,
  // but only behind the Library flag. Flag off, this file offers exactly the
  // seven variants Wave 1 shipped and every other one stays in the read-only
  // card, which is what the flag-off snapshot pins.
  const Editor = libraryOn
    ? scheduleEditorFor(part.variant)
    : (W1_SCHEDULE_EDITORS[part.variant ?? ""] ?? null);
  if (!Editor) return <UnsupportedPartCard part={part} />;
  return (
    <Editor
      payload={payload}
      onChange={onChange}
      readOnly={readOnly}
      libraryOn={libraryOn}
    />
  );
}

/** The three `schedules/` editors Wave 1 already opened. */
const W1_SCHEDULE_EDITORS: Record<string, typeof FlatEditor | undefined> = {
  flat: FlatEditor,
  per_phase: PerPhaseEditor,
  procurement: ProcurementEditor,
};

interface EditorProps {
  payload: Record<string, unknown>;
  onChange: (payload: Record<string, unknown>) => void;
  readOnly: boolean;
}

function ListEditor({ payload, onChange, readOnly }: EditorProps) {
  const items = readItems(payload);
  const write = (next: typeof items) => onChange({ ...payload, items: next });

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="space-y-2 border-t border-[var(--doc-ink-border)] pt-3"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <Input
              aria-label={`Item ${index + 1}`}
              disabled={readOnly}
              value={item.text}
              onChange={(event) =>
                write(
                  items.map((row, rowIndex) =>
                    rowIndex === index
                      ? { ...row, text: event.target.value }
                      : row,
                  ),
                )
              }
              placeholder="Concept presentation"
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={readOnly}
              onClick={() =>
                write(items.filter((_, rowIndex) => rowIndex !== index))
              }
            >
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <Input
              aria-label={`Item ${index + 1} note`}
              disabled={readOnly}
              value={item.note ?? ""}
              onChange={(event) =>
                write(
                  items.map((row, rowIndex) =>
                    rowIndex === index
                      ? { ...row, note: event.target.value || undefined }
                      : row,
                  ),
                )
              }
              placeholder="A second line, when one is needed"
            />
            <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-charcoal)]">
              <input
                type="checkbox"
                aria-label={`Item ${index + 1} is optional`}
                disabled={readOnly}
                checked={item.optional === true}
                onChange={(event) =>
                  write(
                    items.map((row, rowIndex) =>
                      rowIndex === index
                        ? {
                            ...row,
                            optional: event.target.checked || undefined,
                          }
                        : row,
                    ),
                  )
                }
              />
              Optional
            </label>
          </div>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        disabled={readOnly}
        onClick={() =>
          write([
            ...items,
            { id: `item-${Date.now()}-${items.length}`, text: "" },
          ])
        }
      >
        + Add an item
      </Button>
    </div>
  );
}

function RateCardEditor({ payload, onChange, readOnly }: EditorProps) {
  const roles = readRoles(payload);
  const write = (next: typeof roles) => onChange({ ...payload, roles: next });

  return (
    <div className="space-y-2">
      {roles.map((role, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_140px] gap-3">
          <Input
            aria-label={`Role ${index + 1}`}
            disabled={readOnly}
            value={role.roleName}
            onChange={(event) =>
              write(
                roles.map((row, rowIndex) =>
                  rowIndex === index
                    ? { ...row, roleName: event.target.value }
                    : row,
                ),
              )
            }
            placeholder="Principal designer"
          />
          <Input
            aria-label={`${role.roleName || `Role ${index + 1}`} hourly rate`}
            inputMode="decimal"
            disabled={readOnly}
            value={dollars(role.hourlyRateCents)}
            onChange={(event) =>
              write(
                roles.map((row, rowIndex) =>
                  rowIndex === index
                    ? { ...row, hourlyRateCents: toCents(event.target.value) }
                    : row,
                ),
              )
            }
            placeholder="$ / hour"
          />
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        disabled={readOnly}
        onClick={() =>
          write([
            ...roles,
            { roleName: "", hourlyRateCents: 0, sortOrder: roles.length },
          ])
        }
      >
        + Add a role
      </Button>
    </div>
  );
}

function CeilingEditor({ payload, onChange, readOnly }: EditorProps) {
  const cents = readCents(payload.cents);
  const uncapped = cents === null;

  return (
    <div className="space-y-3">
      <label className={labelClass}>
        Design authorization ceiling · dollars
        <Input
          className="mt-2 max-w-[220px]"
          inputMode="decimal"
          disabled={readOnly || uncapped}
          value={dollars(cents)}
          onChange={(event) =>
            onChange({ ...payload, cents: toCents(event.target.value) })
          }
        />
      </label>
      <label className="flex items-center gap-2 text-[12px] text-[var(--color-charcoal)]">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={uncapped}
          onChange={(event) =>
            onChange({ ...payload, cents: event.target.checked ? null : 0 })
          }
        />
        No ceiling — this agreement does not bill time
      </label>
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
        An agreement that carries role rates needs a ceiling. Without rates,
        leaving this open means professional time is billed as it is worked.
      </p>
    </div>
  );
}

function RetainerEditor({
  payload,
  onChange,
  readOnly,
  libraryOn = false,
}: EditorProps & { libraryOn?: boolean }) {
  const cents = readCents(payload.cents);
  const creditRule =
    typeof payload.creditRule === "string" ? payload.creditRule : "credited";
  const activationPolicy =
    typeof payload.activationPolicy === "string"
      ? payload.activationPolicy
      : "immediate";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>
        Retainer · dollars
        <Input
          className="mt-2"
          inputMode="decimal"
          disabled={readOnly}
          value={dollars(cents)}
          onChange={(event) =>
            onChange({ ...payload, cents: toCentsOrNull(event.target.value) })
          }
        />
      </label>
      <label className={labelClass}>
        Activation policy
        <Select
          className="mt-2"
          disabled={readOnly}
          value={activationPolicy}
          onChange={(event) =>
            onChange({ ...payload, activationPolicy: event.target.value })
          }
        >
          <option value="immediate">At countersignature</option>
          <option value="retainer_paid">When retainer is paid</option>
        </Select>
      </label>
      <div className={`${labelClass} sm:col-span-2`}>
        Credit rule
        <div className="mt-2 flex flex-wrap gap-2 normal-case tracking-normal">
          {CREDIT_RULE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={readOnly}
              aria-pressed={creditRule === option.value}
              onClick={() => onChange({ ...payload, creditRule: option.value })}
              className={`rounded-[3px] border px-3 py-1.5 text-[12px] transition-colors ${
                creditRule === option.value
                  ? "border-[var(--color-clay)] bg-[var(--color-clay)] text-white"
                  : "border-[var(--doc-ink-border)] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {/* Wave 1 stored the credit rule and nothing read it. Wave 2 projects
            it into `retainer_credit_rule` on the terms row and snapshots it
            into the authority at countersign, and the client's consent
            sentence says which rule she agreed to — so the sentence goes when
            the flag is on, because it is no longer true. */}
        {!libraryOn && (
          <p className="mt-1.5 text-[11px] normal-case tracking-normal text-[var(--text-muted)]">
            Stored now; it starts appearing on new agreements in a later
            release.
          </p>
        )}
      </div>
    </div>
  );
}

function CadenceEditor({ payload, onChange, readOnly }: EditorProps) {
  const cadence =
    typeof payload.cadence === "string" ? payload.cadence : "monthly";
  return (
    <label className={labelClass}>
      Billing cadence
      <Select
        className="mt-2 max-w-[260px]"
        disabled={readOnly}
        value={cadence}
        onChange={(event) =>
          onChange({ ...payload, cadence: event.target.value })
        }
      >
        {CADENCE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/**
 * An Attachment — the paper that travels with the agreement.
 *
 * The title is the part's own (renamed on the rail, like every other part), so
 * this asks only for the body and whether the client has to say she received
 * it. `acknowledgeRequired` is what puts an "I received this" line above her
 * signature and records the acknowledgment in the signature's metadata.
 */
function AttachmentEditor({ payload, onChange, readOnly }: EditorProps) {
  const acknowledgeRequired = payload.acknowledgeRequired === true;
  return (
    <div className="space-y-4">
      <label className={labelClass}>
        Body
        <Textarea
          className="mt-2 min-h-40 normal-case tracking-normal"
          disabled={readOnly}
          value={typeof payload.body === "string" ? payload.body : ""}
          onChange={(event) =>
            onChange({ ...payload, body: event.target.value })
          }
          placeholder="What this attachment says. It reads below the agreement, on its own leaf."
        />
      </label>
      <label className="flex items-center gap-2 text-[12px] text-[var(--color-charcoal)]">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={acknowledgeRequired}
          onChange={(event) =>
            onChange({ ...payload, acknowledgeRequired: event.target.checked })
          }
        />
        Ask the client to confirm she received this before she signs
      </label>
    </div>
  );
}

/** Every kind Wave 1 does not open. Its title, what it is, and one sentence —
 *  never raw JSON, and never a throw. */
export function UnsupportedPartCard({ part }: { part: AgreementPart }) {
  return (
    <div className="border border-[var(--doc-ink-border)] px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        {part.kind}
        {part.variant ? ` · ${part.variant}` : ""}
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
        This part opens in a later release. It stays on the agreement exactly as
        it is, and the client sees it in place.
      </p>
    </div>
  );
}

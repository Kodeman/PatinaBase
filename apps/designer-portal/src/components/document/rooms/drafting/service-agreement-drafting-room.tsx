"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RoomShell } from "../room-shell";
import { DocSheet } from "../../overlays/doc-sheet";
import { DocumentAction } from "../../document-action";
import { Button, Input, Select, Textarea } from "@/components/ui/controls";
import { ClientPicker } from "@/components/portal/client-picker";
import { useAttachDocumentClient } from "@/hooks/use-attach-client";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-clients";
import {
  useCommercialDocument,
  useSaveServiceAgreement,
} from "@/hooks/use-commercial-documents";
import {
  assessServiceAgreementReadiness,
  type CommercialDocument,
  type ServiceAgreementTerms,
  type ServiceRate,
} from "@/lib/document/commercial-documents";
import { ServiceAgreementPreview } from "../../commercial/service-agreement-preview";
import { ServiceAgreementSendSheet } from "../../commercial/service-agreement-send-sheet";
import { clearRoomOrigin, readRoomOrigin } from "@/lib/document/room-origin";

const labelClass =
  "font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

const DEFAULT_DELIVERABLES = [
  "Concept presentation",
  "Design documentation",
  "Selection schedules",
];
const DEFAULT_EXCLUSIONS = [
  "Construction labor",
  "Furnishings, freight, tax, and installation",
];

function emptyTerms(
  proposalId: string,
  proposal: { description?: unknown },
): ServiceAgreementTerms {
  const description =
    typeof proposal.description === "string" ? proposal.description.trim() : "";
  const scope =
    description && !description.startsWith("Seeded from Discovery ·")
      ? description
      : "Interior design services, including concept development, design documentation, and selections.";
  return {
    proposalId,
    scope,
    deliverables: [...DEFAULT_DELIVERABLES],
    exclusions: [...DEFAULT_EXCLUSIONS],
    billingCeilingCents: 0,
    retainerAmountCents: 0,
    retainerActivationPolicy: "immediate",
    billingCadence: "monthly",
    currency: "USD",
    terms: "",
    currentRateVersion: 1,
    updatedAt: null,
    furnishingsDepositPercent: 50,
  };
}

const DEPOSIT_CHIPS = [0, 25, 50, 100] as const;

const dollars = (cents: number) => (cents / 100).toString();
const cents = (value: string) => {
  const amount = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
};

export function ServiceAgreementDraftingRoom({ proposal }: { proposal: any }) {
  const proposalId = String(proposal.id);
  const bundle = useCommercialDocument(proposalId);

  if (bundle.isLoading) {
    return <AgreementGate message="Opening the design agreement…" />;
  }
  if (bundle.error || !bundle.data) {
    return (
      <AgreementGate
        message="The design agreement could not be loaded. Editing stays closed."
        action={
          <Button variant="secondary" onClick={() => void bundle.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <ServiceAgreementEditor
      key={`${bundle.data.terms?.updatedAt ?? "new"}-${bundle.data.rates.length}`}
      proposal={proposal}
      document={bundle.data.document}
      initialTerms={bundle.data.terms ?? emptyTerms(proposalId, proposal)}
      initiallyDirty={!bundle.data.terms}
      initialRates={bundle.data.rates.filter(
        (rate) =>
          rate.version ===
          (bundle.data.terms?.currentRateVersion ??
            Math.max(1, ...bundle.data.rates.map((item) => item.version))),
      )}
      signatures={bundle.data.signatures}
    />
  );
}

function AgreementGate({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="doc-type-body text-[var(--color-quiet-ink)]">{message}</p>
      {action}
    </div>
  );
}

function ServiceAgreementEditor({
  proposal,
  document,
  initialTerms,
  initialRates,
  initiallyDirty,
  signatures,
}: {
  proposal: any;
  document: CommercialDocument;
  initialTerms: ServiceAgreementTerms;
  initialRates: ServiceRate[];
  initiallyDirty: boolean;
  signatures: Parameters<typeof ServiceAgreementPreview>[0]["signatures"];
}) {
  const router = useRouter();
  const save = useSaveServiceAgreement(document.id);
  const attachClient = useAttachDocumentClient();
  const { user, status: authStatus } = useAuth();
  const clients = useClients();
  const ownsProposal = user?.id === proposal.designer_id;
  const ownerClients = useMemo(
    () =>
      (clients.data ?? []).filter(
        (client) => client.designer_id === proposal.designer_id,
      ),
    [clients.data, proposal.designer_id],
  );
  const [terms, setTerms] = useState(initialTerms);
  const [rates, setRates] = useState<ServiceRate[]>(
    initialRates.length > 0
      ? initialRates
      : [
          {
            id: "new-1",
            proposalId: document.id,
            version: 1,
            roleName: "Principal designer",
            hourlyRateCents: 0,
            effectiveAt: null,
          },
        ],
  );
  const [dirty, setDirty] = useState(initiallyDirty);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [clientNote, setClientNote] = useState<string | null>(null);
  const [clientError, setClientError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const recipientEmail =
    typeof proposal.client?.email === "string" ? proposal.client.email : null;
  const recipientName =
    proposal.client?.full_name ?? proposal.client_name ?? undefined;
  const readiness = useMemo(
    () =>
      assessServiceAgreementReadiness({
        document,
        terms,
        rates,
        recipientEmail,
      }),
    [document, rates, recipientEmail, terms],
  );
  const completed =
    7 -
    readiness.blockers.filter((blocker) => !blocker.startsWith("Link a client"))
      .length;

  const changeTerms = (updates: Partial<ServiceAgreementTerms>) => {
    setTerms((current) => ({ ...current, ...updates }));
    setDirty(true);
    setSaveNote(null);
  };
  const changeRate = (index: number, updates: Partial<ServiceRate>) => {
    setRates((current) =>
      current.map((rate, rateIndex) =>
        rateIndex === index ? { ...rate, ...updates } : rate,
      ),
    );
    setDirty(true);
    setSaveNote(null);
  };

  const persist = async () => {
    try {
      await save.mutateAsync({ terms, rates });
      setDirty(false);
      setSaveNote("All agreement changes saved.");
      return true;
    } catch (error) {
      setSaveNote(
        error instanceof Error
          ? error.message
          : "The agreement could not be saved.",
      );
      return false;
    }
  };
  const reviewAndSend = async () => {
    if (dirty && !(await persist())) return;
    setSendOpen(true);
  };
  const changeClient = (clientId: string | null) => {
    setClientNote(null);
    setClientError(false);
    if (!ownsProposal) {
      setClientError(true);
      setClientNote("Only the agreement owner can change the client account.");
      return;
    }
    attachClient.mutate(
      {
        engagementKind: "proposal",
        targetId: document.id,
        clientId,
      },
      {
        onSuccess: () => {
          setClientError(false);
          setClientNote(
            clientId
              ? "Client account attached to this agreement."
              : "Client account cleared.",
          );
        },
        onError: (error) => {
          setClientError(true);
          setClientNote(
            error instanceof Error
              ? error.message
              : "The client account could not be attached.",
          );
        },
      },
    );
  };

  return (
    <RoomShell
      title="The Drafting Room · Design Agreement"
      count={`${Math.max(0, completed)} of 7 facets written`}
      action={
        <DocumentAction
          actionKey="review-design-agreement"
          variant="primary"
          trailing="→"
          onClick={() => void reviewAndSend()}
        >
          Review & send
        </DocumentAction>
      }
    >
      <div className="mx-auto max-w-[1240px] px-6 py-7 sm:px-8">
        <header className="border-b border-[var(--doc-ink-border)] pb-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-clay-ink)]">
            Yes to the designer · professional services only
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-heading text-[1.65rem] text-[var(--color-charcoal)]">
                {document.title}
              </h1>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
                Write the work, rates, retainer, and authority boundary.
                Furnishings and purchasing stay outside this agreement.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
                Preview client copy
              </Button>
              <Button
                onClick={() => void persist()}
                loading={save.isPending}
                disabled={!dirty}
              >
                {dirty ? "Save agreement" : "Saved"}
              </Button>
            </div>
          </div>
          <div className="mt-4 max-w-sm">
            <p className={labelClass}>Client account</p>
            <ClientPicker
              className="mt-2"
              value={
                typeof proposal.client_id === "string"
                  ? proposal.client_id
                  : null
              }
              onChange={changeClient}
              disabled={
                attachClient.isPending ||
                authStatus === "loading" ||
                !ownsProposal
              }
              clientOptions={ownerClients}
              ariaLabel="Client account"
              requireClientLogin
              placeholder="Select or invite a client…"
            />
            {!ownsProposal && authStatus !== "loading" && !clientNote && (
              <p className="mt-2 text-[11px] text-[var(--color-mocha)]">
                Only the agreement owner can change the client account.
              </p>
            )}
            {clientNote && (
              <p
                role={clientError ? "alert" : "status"}
                className="mt-2 text-[11px] text-[var(--color-mocha)]"
              >
                {clientNote}
              </p>
            )}
          </div>
          {saveNote && (
            <p
              role="status"
              className="mt-2 text-[11px] text-[var(--color-mocha)]"
            >
              {saveNote}
            </p>
          )}
        </header>

        <div className="grid gap-9 pt-7 min-[1180px]:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            <AgreementFacet
              index="01"
              title="Services & deliverables"
              hint="Name the professional work and the concrete things the client receives."
            >
              <label className={labelClass}>
                Scope of services
                <Textarea
                  className="mt-2 min-h-28 normal-case tracking-normal"
                  value={terms.scope}
                  onChange={(event) =>
                    changeTerms({ scope: event.target.value })
                  }
                  placeholder="Creative direction, design development, sourcing, documentation…"
                />
              </label>
              <label className={labelClass}>
                Deliverables · one per line
                <Textarea
                  className="mt-2 min-h-24 normal-case tracking-normal"
                  value={terms.deliverables.join("\n")}
                  onChange={(event) =>
                    changeTerms({
                      deliverables: event.target.value.split("\n"),
                    })
                  }
                  placeholder={
                    "Concept presentation\nDesign documentation\nSelection schedules"
                  }
                />
              </label>
            </AgreementFacet>

            <AgreementFacet
              index="02"
              title="Exclusions"
              hint="Make the authority boundary plain—including purchasing and hard costs."
            >
              <label className={labelClass}>
                Not included · one per line
                <Textarea
                  className="mt-2 min-h-24 normal-case tracking-normal"
                  value={terms.exclusions.join("\n")}
                  onChange={(event) =>
                    changeTerms({ exclusions: event.target.value.split("\n") })
                  }
                  placeholder={
                    "Construction labor\nFurnishings, freight, tax, and installation"
                  }
                />
              </label>
            </AgreementFacet>

            <AgreementFacet
              index="03"
              title="Role rates"
              hint="The signed rate schedule becomes the source of truth for billable design time."
            >
              <div className="space-y-2">
                {rates.map((rate, index) => (
                  <div
                    key={rate.id}
                    className="grid grid-cols-[minmax(0,1fr)_140px] gap-3"
                  >
                    <Input
                      aria-label={`Role ${index + 1}`}
                      value={rate.roleName}
                      onChange={(event) =>
                        changeRate(index, { roleName: event.target.value })
                      }
                      placeholder="Principal designer"
                    />
                    <Input
                      aria-label={`${rate.roleName || `Role ${index + 1}`} hourly rate`}
                      inputMode="decimal"
                      value={dollars(rate.hourlyRateCents)}
                      onChange={(event) =>
                        changeRate(index, {
                          hourlyRateCents: cents(event.target.value),
                        })
                      }
                      placeholder="$ / hour"
                    />
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRates((current) => [
                    ...current,
                    {
                      id: `new-${Date.now()}`,
                      proposalId: document.id,
                      version: terms.currentRateVersion,
                      roleName: "",
                      hourlyRateCents: 0,
                      effectiveAt: null,
                    },
                  ]);
                  setDirty(true);
                }}
              >
                + Add a role
              </Button>
            </AgreementFacet>

            <AgreementFacet
              index="04"
              title="Rates & ceiling"
              hint="Actual time may accrue, but invoicing cannot cross this signed ceiling."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Design authorization ceiling · dollars
                  <Input
                    className="mt-2"
                    inputMode="decimal"
                    value={dollars(terms.billingCeilingCents)}
                    onChange={(event) =>
                      changeTerms({
                        billingCeilingCents: cents(event.target.value),
                      })
                    }
                  />
                </label>
                <div className={labelClass}>
                  Furnishings deposit · on each authorization
                  <div className="mt-2 flex flex-wrap items-center gap-2 normal-case tracking-normal">
                    {DEPOSIT_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() =>
                          changeTerms({ furnishingsDepositPercent: chip })
                        }
                        aria-pressed={terms.furnishingsDepositPercent === chip}
                        className={`rounded-[3px] border px-3 py-1.5 text-[12px] transition-colors ${
                          terms.furnishingsDepositPercent === chip
                            ? "border-[var(--color-clay)] bg-[var(--color-clay)] text-white"
                            : "border-[var(--doc-ink-border)] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]"
                        }`}
                      >
                        {chip}%
                      </button>
                    ))}
                    <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-charcoal)]">
                      <span>Other</span>
                      <Input
                        className="w-20"
                        inputMode="numeric"
                        aria-label="Other furnishings deposit percent"
                        value={
                          terms.furnishingsDepositPercent === null ||
                          DEPOSIT_CHIPS.includes(
                            terms.furnishingsDepositPercent as (typeof DEPOSIT_CHIPS)[number],
                          )
                            ? ""
                            : String(terms.furnishingsDepositPercent)
                        }
                        onChange={(event) => {
                          if (event.target.value.trim() === "") {
                            changeTerms({ furnishingsDepositPercent: null });
                            return;
                          }
                          const parsed = Number(event.target.value);
                          changeTerms({
                            furnishingsDepositPercent: Number.isFinite(parsed)
                              ? Math.min(100, Math.max(0, Math.round(parsed)))
                              : null,
                          });
                        }}
                        placeholder="Unset · defaults to 50%"
                      />
                    </label>
                  </div>
                  {terms.furnishingsDepositPercent === null && (
                    <p className="mt-1.5 text-[10.5px] normal-case tracking-normal text-[var(--text-muted)]">
                      No furnishings deposit set — authorizations will
                      default to 50%.
                    </p>
                  )}
                </div>
              </div>
            </AgreementFacet>

            <AgreementFacet
              index="05"
              title="Retainer"
              hint="Choose the amount and whether execution or payment activates work."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Retainer · dollars
                  <Input
                    className="mt-2"
                    inputMode="decimal"
                    value={dollars(terms.retainerAmountCents)}
                    onChange={(event) =>
                      changeTerms({
                        retainerAmountCents: cents(event.target.value),
                      })
                    }
                  />
                </label>
                <label className={labelClass}>
                  Activation policy
                  <Select
                    className="mt-2"
                    value={terms.retainerActivationPolicy}
                    onChange={(event) =>
                      changeTerms({
                        retainerActivationPolicy: event.target.value as
                          | "immediate"
                          | "retainer_paid",
                      })
                    }
                  >
                    <option value="immediate">At countersignature</option>
                    <option value="retainer_paid">When retainer is paid</option>
                  </Select>
                </label>
              </div>
            </AgreementFacet>

            <AgreementFacet
              index="06"
              title="Billing cadence"
              hint="Set the rhythm the client should expect."
            >
              <Select
                value={terms.billingCadence}
                onChange={(event) =>
                  changeTerms({
                    billingCadence: event.target.value as
                      | "monthly"
                      | "biweekly"
                      | "milestone",
                  })
                }
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Every two weeks</option>
                <option value="milestone">At named milestones</option>
              </Select>
            </AgreementFacet>

            <AgreementFacet
              index="07"
              title="Terms"
              hint="The agreement language the client reads and signs."
            >
              <Textarea
                className="min-h-40"
                value={terms.terms}
                onChange={(event) => changeTerms({ terms: event.target.value })}
                placeholder="Ownership, cancellation, expenses, and the terms this engagement needs."
              />
            </AgreementFacet>
          </div>

          <aside className="hidden min-[1180px]:block">
            <div className="sticky top-[82px] rounded-[8px] border border-[var(--doc-ink-border)] bg-white px-5 py-5">
              <p className="mb-4 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
                The client&apos;s copy · live
              </p>
              <ServiceAgreementPreview
                document={document}
                terms={terms}
                rates={rates}
                signatures={signatures}
                clientName={recipientName}
                compact
              />
            </div>
          </aside>
        </div>
      </div>

      <DocSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Client copy preview"
      >
        <ServiceAgreementPreview
          document={document}
          terms={terms}
          rates={rates}
          signatures={signatures}
          clientName={recipientName}
        />
      </DocSheet>

      <ServiceAgreementSendSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onSent={() => {
          const destination = readRoomOrigin();
          clearRoomOrigin();
          router.push(destination);
        }}
        document={document}
        terms={terms}
        rates={rates}
        recipientEmail={recipientEmail}
        recipientName={recipientName}
      />
    </RoomShell>
  );
}

function AgreementFacet({
  index,
  title,
  hint,
  children,
}: {
  index: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--doc-ink-border)] pt-4">
      <div className="mb-4 grid gap-2 sm:grid-cols-[40px_190px_minmax(0,1fr)]">
        <span className="font-mono text-[9px] text-[var(--color-clay-ink)]">
          {index}
        </span>
        <h2 className="font-heading text-[1.15rem] italic text-[var(--color-charcoal)]">
          {title}
        </h2>
        <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
          {hint}
        </p>
      </div>
      <div className="space-y-4 sm:pl-[230px]">{children}</div>
    </section>
  );
}

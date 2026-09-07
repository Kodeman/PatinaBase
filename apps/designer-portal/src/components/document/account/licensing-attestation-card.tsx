"use client";

/**
 * Account → Studio → Licensing (M7, P10, R10).
 *
 * The one thing that unlocks the design-build template — and the one thing
 * Patina promises not to do anything with. The studio attests; Patina stores
 * the attestation; Patina never checks it against a registry, a state board,
 * or anything else. There is no lookup, no expiry cron, and no "verified"
 * mark anywhere in this product, and the card says so where the studio can
 * read it.
 *
 * R3 — owners and admins write; every active member reads. The read-only view
 * shows what is on file with no edit affordance; RLS refuses the write
 * underneath either way, so hiding the form is a courtesy rather than the
 * wall.
 *
 * The card mirrors Billing's shell and changes nothing about it — the same
 * `border-t` block, the same LABEL/HELP/FIELD type, the same save-button
 * posture. The Agreement defaults card (Wave 1) and the Library card (Wave 2)
 * already sit above this one and are untouched.
 */

import { useEffect, useState } from "react";
import {
  licenseAttestationIsLive,
  useSaveStudioLicenseAttestation,
  useStudioLicenseAttestation,
} from "@patina/supabase";
import { DESIGN_BUILD_COPY, LICENSE_CREDENTIAL_TYPES } from "@patina/types";
import { useAuth } from "@/hooks/use-auth";
import { Select } from "@/components/ui/controls";
import { documentEvents } from "@/lib/analytics/document-events";
import { DocumentAction, DocumentActionGroup } from "../document-action";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]";
const HELP = "mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]";
const FIELD =
  "mt-1 w-full border-b border-[var(--color-pearl)] bg-transparent py-1 text-[13px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]";

export const CARD_EYEBROW =
  "Before this studio can use the design-build template";

/** The "Other" arm of the credential vocabulary — free text at the DB, so the
 *  select is a convenience over a text column, never a constraint on it. */
const OTHER = "Other";

export function LicensingAttestationCard({
  studioId,
  canManage,
}: {
  studioId: string;
  canManage: boolean;
}) {
  const { user } = useAuth();
  const attestation = useStudioLicenseAttestation(studioId);
  const save = useSaveStudioLicenseAttestation();

  const onFile = attestation.data ?? null;
  const live = licenseAttestationIsLive(onFile);

  const [credentialType, setCredentialType] = useState<string>(
    LICENSE_CREDENTIAL_TYPES[0],
  );
  const [otherType, setOtherType] = useState("");
  const [credentialNumber, setCredentialNumber] = useState("");
  const [state, setState] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [affirmed, setAffirmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Seeded from what is on file, exactly as Billing seeds itself from
  // `useStudioBillingSettings`. A credential the select does not carry is an
  // "Other" the studio typed, and it comes back as one.
  useEffect(() => {
    if (!onFile) return;
    const known = (LICENSE_CREDENTIAL_TYPES as readonly string[]).includes(
      onFile.credentialType,
    );
    setCredentialType(known ? onFile.credentialType : OTHER);
    setOtherType(known ? "" : onFile.credentialType);
    setCredentialNumber(onFile.credentialNumber);
    setState(onFile.state);
    setExpiresOn(onFile.expiresOn);
    setAffirmed(false);
  }, [onFile]);

  const resolvedType =
    credentialType === OTHER ? otherType.trim() : credentialType;
  const stateOk = /^[A-Za-z]{2}$/.test(state.trim());
  const dirty =
    resolvedType.length > 0 &&
    credentialNumber.trim().length > 0 &&
    stateOk &&
    expiresOn.length > 0 &&
    affirmed;

  const handleSave = async () => {
    if (!dirty || !user?.id) return;
    setNote(null);
    try {
      await save.mutateAsync({
        studioId,
        credentialType: resolvedType,
        credentialNumber,
        state,
        expiresOn,
        attestedBy: user.id,
      });
      documentEvents.agreementAttestationSaved({ studio_id: studioId });
      setAffirmed(false);
      setNote("Your attestation is on file.");
    } catch (error) {
      setNote(
        error instanceof Error
          ? error.message
          : "That attestation could not be saved.",
      );
    }
  };

  return (
    <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
      <h3 className={`${LABEL} mb-3`}>Licensing</h3>
      <p className={`${HELP} mb-4 mt-0`}>{CARD_EYEBROW}</p>

      {onFile && (
        <dl className="mb-4 max-w-md space-y-3">
          <div>
            <dt className={LABEL}>On file</dt>
            <dd className="text-[13px] text-[var(--color-charcoal)]">
              {onFile.credentialType} · {onFile.credentialNumber} ·{" "}
              {onFile.state}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Current through</dt>
            <dd className="text-[13px] text-[var(--color-charcoal)]">
              {onFile.expiresOn}
              {!live && (
                <span className="ml-2 text-[12px] italic text-[var(--color-mocha)]">
                  This attestation has lapsed. The design-build template is
                  locked until it is renewed.
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}

      {canManage ? (
        <div className="max-w-md">
          <div className="mb-4">
            <label htmlFor="studio-credential-type" className={LABEL}>
              Credential type
            </label>
            <Select
              id="studio-credential-type"
              className="mt-1"
              value={credentialType}
              onChange={(event) => setCredentialType(event.target.value)}
            >
              {LICENSE_CREDENTIAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
            {credentialType === OTHER && (
              <input
                aria-label="Credential type"
                className={FIELD}
                value={otherType}
                onChange={(event) => setOtherType(event.target.value)}
                placeholder="What this credential is called"
              />
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="studio-credential-number" className={LABEL}>
              Number
            </label>
            <input
              id="studio-credential-number"
              className={FIELD}
              value={credentialNumber}
              onChange={(event) => setCredentialNumber(event.target.value)}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="studio-credential-state" className={LABEL}>
              State
            </label>
            <input
              id="studio-credential-state"
              className={FIELD}
              maxLength={2}
              value={state}
              onChange={(event) => setState(event.target.value.toUpperCase())}
              placeholder="WI"
            />
            {!stateOk && state.trim().length > 0 && (
              <p role="alert" className={HELP}>
                Two letters — the state that issued it.
              </p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="studio-credential-expiry" className={LABEL}>
              Expiry
            </label>
            <input
              id="studio-credential-expiry"
              type="date"
              className={FIELD}
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
            />
          </div>

          <label className="mb-4 flex items-start gap-2 text-[12px] leading-relaxed text-[var(--color-charcoal)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={affirmed}
              onChange={(event) => setAffirmed(event.target.checked)}
            />
            {DESIGN_BUILD_COPY.attestationAffirmation}
          </label>

          <p className="mb-4 text-[12px] leading-relaxed text-[var(--color-mocha)]">
            {DESIGN_BUILD_COPY.legalDisclaimer}
          </p>

          <DocumentActionGroup
            surfaceKey="account"
            regionKey="studio-licensing"
            className="mt-4 items-center"
          >
            <DocumentAction
              actionKey="save-studio-attestation"
              variant="primary"
              onClick={() => void handleSave()}
              disabled={!dirty || save.isPending}
              loading={save.isPending}
              loadingLabel="Saving…"
            >
              Save attestation
            </DocumentAction>
          </DocumentActionGroup>

          <p className={HELP}>{DESIGN_BUILD_COPY.attestationStored}</p>

          {note && (
            <p
              role="status"
              className="mt-2 text-[12px] text-[var(--color-mocha)]"
            >
              {note}
            </p>
          )}
        </div>
      ) : (
        <p className={HELP}>
          {onFile
            ? DESIGN_BUILD_COPY.attestationStored
            : "No attestation on file. An owner or admin can add one."}
        </p>
      )}
    </div>
  );
}

'use client';

/**
 * Account · Studio (Studio Workspace Provisioning, Workstream 4) — the
 * designer portal's self-serve home for the studio a designer works in.
 * No-studio state: a name + "Create studio" (`useCreateOrganization` →
 * `create_studio_workspace` RPC, 00295 — the client can never SELECT its own
 * insert before the owner membership exists, hence the SECURITY DEFINER
 * RPC). Studio state: inline rename, the member roster (role changes +
 * removal, owner/admin only — never against yourself; ownership changes use
 * the dedicated transfer RPC),
 * "Invite teammate" (opens StudioInviteModal), and "Leave studio" for
 * non-owners. Document-shell styling mirrors account-profile-page.tsx;
 * sibling account pages don't use help-system copy wrappers, so this one
 * doesn't either.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useOrganizations,
  useOrganizationMembers,
  useCreateOrganization,
  useUpdateOrganization,
  useUpdateMemberRole,
  useRemoveMember,
  useLeaveOrganization,
  useTransferOrganizationOwnership,
  useInviteMember,
  useProjects,
  useStudioContacts,
  useStudioBillingSettings,
  useUpdateStudioBillingSettings,
  type MemberRole,
  type OrganizationMemberWithProfile,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { Select, StatusBadge, type StatusTone } from '@/components/ui/controls';
import { monogramOf } from '@/lib/document/account-identity';
import { friendlyInviteError, isInviteExpired } from '@/lib/document/invite-status';
import { StudioInviteModal } from './studio-invite-modal';
import { StudioLogoUploadField } from './studio-logo-upload-field';
import { StudioSetupChecklist } from './studio-setup-checklist';
import { MemberTitleLine } from './member-title-line';
import { studioEvents } from '@/lib/analytics/studio-events';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { RolodexSeedSheet } from '../people/directory/rolodex-seed-sheet';

/** Map studio DB error codes to friendly copy (see 00319 guard + RPCs). */
function friendlyStudioError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (msg.includes('last_owner_protected'))
    return 'Transfer ownership to another member first.';
  if (msg.includes('not_owner')) return 'Only the studio owner can do this.';
  if (msg.includes('target_not_active_member'))
    return 'That teammate must be an active studio member.';
  if (msg.includes('owner_change_requires_owner'))
    return 'Only an owner can change owner roles.';
  if (msg.includes('owner_promotion_requires_owner'))
    return 'Only an owner can promote a member to owner.';
  if (msg.includes('owner_insert_requires_owner'))
    return 'Only an owner can add another owner.';
  return msg || fallback;
}

/** Card fee (%) input ↔ card_surcharge_bps (migration 00428). 300 bps = 3%. */
const BILLING_BPS_MAX = 300;

function bpsToPercentInput(bps: number): string {
  return String(bps / 100);
}

/**
 * Clamped to the network cap (0..300 bps) — the same range the DB CHECK
 * enforces, so a stray value here can never round-trip a save into a 400.
 *
 * Returns **null** for an empty or unparseable field: "no answer" is not the
 * same as "charge nothing". Coercing it to 0 would let a cleared input save a
 * 0% card fee the studio never chose. An explicit '0' still parses to 0 —
 * absorbing the fee is a legitimate deliberate choice.
 */
function percentInputToBps(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.min(BILLING_BPS_MAX, Math.max(0, Math.round(n * 100)));
}

/** Row 4's SKIP write (organizations.rolodex_seed_skipped_at) is owner/admin-
 *  gated by RLS (00417). The checklist already hides the SKIP control from a
 *  plain member, but a role change mid-session (or a stale render) can still
 *  land the write itself on the RLS wall — this is that belt-and-suspenders
 *  translation, matching rolodex-seed-sheet.tsx's friendlyRolodexError idiom. */
function friendlySkipSeedError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/row-level security|permission denied|PGRST116|42501/i.test(msg)) {
    return 'Ask an owner or admin to skip this.';
  }
  return msg || 'Could not skip this just now.';
}

const FIELD =
  'w-full max-w-md border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[14px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]';
const LABEL =
  'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const HELP = 'mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]';

const STATUS_TONE: Record<string, StatusTone> = {
  active: 'success',
  invited: 'warning',
};

export function AccountStudioPage() {
  const { user } = useAuth();
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  // Call Sheet Wave 2 — row 4 ("Seed the rolodex") goes live only behind the
  // flag; flag-off keeps the checklist in its exact Wave-1 shape (SKIP
  // disabled, "coming with the rolodex" — studio-setup-checklist.tsx's
  // default when onSkipSeed/onOpenSeedReview are omitted).
  const { value: callSheetOn } = useFeatureFlag('call-sheet');
  const [seedReviewOpen, setSeedReviewOpen] = useState(false);
  const [skipSeedError, setSkipSeedError] = useState<string | null>(null);

  // Prefer a design_studio membership; fall back to the first org of any
  // type (mirrors account-identity.ts's activeStudio resolution, but keeps
  // the full org row this page needs for management).
  const studio = useMemo(
    () => orgs?.find((o) => o.type === 'design_studio') ?? orgs?.[0] ?? null,
    [orgs],
  );

  const { data: members } = useOrganizationMembers(studio?.id ?? '');
  const { data: projects } = useProjects();
  const { data: contacts } = useStudioContacts(callSheetOn ? (studio?.id ?? null) : null);
  const { data: billingSettings } = useStudioBillingSettings(studio?.id);

  const createOrg = useCreateOrganization();
  const updateOrg = useUpdateOrganization();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveOrg = useLeaveOrganization();
  const transferOwner = useTransferOrganizationOwnership();
  const updateBilling = useUpdateStudioBillingSettings();
  const resendInvite = useInviteMember();

  const [newStudioName, setNewStudioName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  // Per-row "Resend invite" feedback — keyed by member id since resendInvite
  // is one shared mutation instance for the whole roster.
  const [resendingMemberId, setResendingMemberId] = useState<string | null>(
    null,
  );
  const [resendFeedback, setResendFeedback] = useState<{
    memberId: string;
    ok: boolean;
    message: string;
  } | null>(null);

  // Branding form (contact + address). Seeded from the studio row; re-synced
  // when the active studio changes (keyed on id so a background refetch doesn't
  // clobber in-progress edits).
  const [branding, setBranding] = useState({
    website: '',
    email: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    zip: '',
  });

  useEffect(() => {
    if (!studio) return;
    const a = (studio.address ?? {}) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === 'string' ? v : '');
    setBranding({
      website: studio.website ?? '',
      email: studio.email ?? '',
      phone: studio.phone ?? '',
      line1: s(a.line1),
      line2: s(a.line2),
      city: s(a.city),
      state: s(a.state),
      zip: s(a.zip),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio?.id]);

  // Billing form (card fee % + check remit-to). Seeded from
  // useStudioBillingSettings, which resolves to platform defaults
  // ({card_surcharge_bps: 300, check_remit_to: null}) even before a studio
  // has ever saved a row — so this never has to special-case "unconfigured".
  // Re-synced keyed on the settings row's own studio_id (not just studio?.id)
  // because this query loads asynchronously after the studio row itself; the
  // effect fires once the first time it resolves for the active studio,
  // matching the branding effect's "don't clobber an in-progress edit on a
  // background refetch" invariant.
  const [billing, setBilling] = useState({ cardFeePercent: '', checkRemitTo: '' });

  useEffect(() => {
    if (!billingSettings) return;
    setBilling({
      cardFeePercent: bpsToPercentInput(billingSettings.card_surcharge_bps),
      checkRemitTo: billingSettings.check_remit_to ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingSettings?.studio_id]);

  const myRole = studio?.membership.role ?? null;
  const canManage = myRole === 'owner' || myRole === 'admin';
  // Day-1 checklist inputs (U3) — own title + crew count read off the same
  // members list the roster below renders. contactsCount/seedSkipped (Call
  // Sheet Wave 2) only read real data behind the flag — flag-off leaves them
  // at the derivation's un-seeded defaults, same as before this wave.
  const myJobTitle =
    members?.find((m) => m.user_id === user?.id)?.job_title ?? null;
  const memberCountBeyondSelf = (members ?? []).filter(
    (m) => m.user_id !== user?.id,
  ).length;
  const contactsCount = callSheetOn ? (contacts?.length ?? 0) : 0;
  const seedSkipped = callSheetOn ? !!studio?.rolodex_seed_skipped_at : false;

  const handleSkipSeed = () => {
    if (!studio || updateOrg.isPending) return;
    setSkipSeedError(null);
    updateOrg.mutate(
      { id: studio.id, rolodex_seed_skipped_at: new Date().toISOString() },
      { onError: (err) => setSkipSeedError(friendlySkipSeedError(err)) },
    );
  };

  const handleCreateStudio = () => {
    const name = newStudioName.trim();
    if (!name || createOrg.isPending) return;
    createOrg.mutate(
      { name },
      {
        onSuccess: () => {
          studioEvents.created();
          setNewStudioName('');
        },
      },
    );
  };

  const startRename = () => {
    if (!studio) return;
    setRenameValue(studio.name);
    setIsRenaming(true);
  };

  const handleSaveRename = () => {
    if (!studio) return;
    const name = renameValue.trim();
    if (!name || name === studio.name) {
      setIsRenaming(false);
      return;
    }
    updateOrg.mutate(
      { id: studio.id, name },
      { onSuccess: () => setIsRenaming(false) },
    );
  };

  const handleRoleChange = (
    memberId: string,
    currentRole: MemberRole,
    role: MemberRole,
  ) => {
    // Ownership is a transfer, never a direct membership-row update. Keep this
    // runtime guard even though the roster omits Owner from its select so a
    // stale or scripted change event cannot bypass the transfer RPC.
    if (currentRole === 'owner' || role === 'owner') return;
    updateRole.mutate({ memberId, role });
  };

  const handleRemove = (memberId: string, label: string) => {
    if (!confirm(`Remove ${label} from the studio?`)) return;
    removeMember.mutate(memberId);
  };

  const handleLeave = () => {
    if (!studio) return;
    if (
      !confirm(
        `Leave ${studio.name}? You'll lose access to its projects and clients.`,
      )
    )
      return;
    leaveOrg.mutate(studio.id);
  };

  const handleSaveBranding = () => {
    if (!studio || updateOrg.isPending) return;
    const address = {
      line1: branding.line1.trim() || null,
      line2: branding.line2.trim() || null,
      city: branding.city.trim() || null,
      state: branding.state.trim() || null,
      zip: branding.zip.trim() || null,
    };
    const hasAddress = Object.values(address).some((v) => v !== null);
    updateOrg.mutate({
      id: studio.id,
      website: branding.website.trim() || null,
      email: branding.email.trim() || null,
      phone: branding.phone.trim() || null,
      address: hasAddress ? address : null,
    });
  };

  const handleSaveBilling = () => {
    if (!studio || updateBilling.isPending) return;
    const cardSurchargeBps = percentInputToBps(billing.cardFeePercent);
    if (cardSurchargeBps === null) return; // Save is disabled here; belt-and-braces.
    const checkRemitTo = billing.checkRemitTo.trim() || null;
    updateBilling.mutate(
      { studioId: studio.id, cardSurchargeBps, checkRemitTo },
      {
        onSuccess: () => {
          // Re-seed from what was actually PERSISTED — the clamped bps and the
          // trimmed remit-to. Without this the field can keep showing a value
          // that was never saved ('10' after it clamped to 3%, '2.567' after it
          // rounded), and a trailing newline leaves the form permanently dirty.
          // The seeding effect can't do it: it is keyed on the settings row's
          // studio_id, which doesn't change when the row is refetched.
          setBilling({
            cardFeePercent: bpsToPercentInput(cardSurchargeBps),
            checkRemitTo: checkRemitTo ?? '',
          });
        },
      },
    );
  };

  const handleTransfer = (newOwnerUserId: string, label: string) => {
    if (!studio) return;
    if (
      !confirm(
        `Make ${label} the studio owner? You'll become an admin. This can't be undone without their help.`,
      )
    )
      return;
    transferOwner.mutate({ organizationId: studio.id, newOwnerUserId });
  };

  // Resends the invite email for an invited/expired member — reuses the same
  // workspace-member-invite call the modal makes, keyed off the existing
  // membership row's own email/role/title. teammateType is intentionally
  // omitted: it isn't stored on the membership row, and the edge function's
  // designer grant is additive/idempotent, so a resend can't ever revoke it.
  const handleResendInvite = (member: OrganizationMemberWithProfile) => {
    if (!studio || !member.profiles?.email) return;
    setResendingMemberId(member.id);
    setResendFeedback(null);
    resendInvite.mutate(
      {
        organizationId: studio.id,
        email: member.profiles.email,
        role: member.role,
        jobTitle: member.job_title ?? undefined,
        staffRole: member.staff_role ?? undefined,
      },
      {
        onSuccess: (result) => {
          setResendingMemberId(null);
          setResendFeedback(
            result.email_status === 'sent'
              ? { memberId: member.id, ok: true, message: 'Invite email sent again.' }
              : {
                  memberId: member.id,
                  ok: false,
                  message:
                    result.email_error ?? 'Could not resend the invite email.',
                },
          );
        },
        onError: (err) => {
          setResendingMemberId(null);
          setResendFeedback({
            memberId: member.id,
            ok: false,
            message: friendlyInviteError(err),
          });
        },
      },
    );
  };

  // ── No-studio state ───────────────────────────────────────────────────
  if (!orgsLoading && !studio) {
    return (
      <div className="pt-1">
        <p className={HELP}>
          Create a studio to invite designers and collaborators, assign roles,
          and share projects across your team.
        </p>
        <div className="mt-4">
          <label htmlFor="studio-new-name" className={LABEL}>
            Studio name
          </label>
          <input
            id="studio-new-name"
            type="text"
            value={newStudioName}
            onChange={(e) => setNewStudioName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateStudio();
            }}
            placeholder="Your studio's name"
            className={FIELD}
          />
        </div>
        <DocumentAction
          actionKey="create-studio"
          surfaceKey="account"
          regionKey="studio-creation"
          variant="primary"
          onClick={handleCreateStudio}
          disabled={!newStudioName.trim() || createOrg.isPending}
          loading={createOrg.isPending}
          loadingLabel="Creating…"
          className="mt-3"
        >
          Create studio
        </DocumentAction>
        {createOrg.isError && (
          <p
            role="alert"
            className="mt-3 border-l-2 border-[var(--color-terracotta)] pl-3 text-[12px] text-[var(--color-terracotta-ink)]"
          >
            {createOrg.error instanceof Error
              ? createOrg.error.message
              : 'Failed to create your studio.'}
          </p>
        )}
      </div>
    );
  }

  if (orgsLoading || !studio) {
    return (
      <p className="py-3 text-[12px] italic text-[var(--color-aged-oak)]">
        Reading your studio…
      </p>
    );
  }

  // ── Studio state ──────────────────────────────────────────────────────
  const currentAddress = (studio.address ?? {}) as Record<string, unknown>;
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '');
  const brandingDirty =
    branding.website !== (studio.website ?? '') ||
    branding.email !== (studio.email ?? '') ||
    branding.phone !== (studio.phone ?? '') ||
    branding.line1 !== asStr(currentAddress.line1) ||
    branding.line2 !== asStr(currentAddress.line2) ||
    branding.city !== asStr(currentAddress.city) ||
    branding.state !== asStr(currentAddress.state) ||
    branding.zip !== asStr(currentAddress.zip);
  // null = the card-fee field is empty/unparseable — nothing to save, and the
  // Save button stays disabled rather than persisting a coerced 0%.
  const billingBps = percentInputToBps(billing.cardFeePercent);
  const billingDirty =
    !!billingSettings &&
    (billingBps !== billingSettings.card_surcharge_bps ||
      billing.checkRemitTo !== (billingSettings.check_remit_to ?? ''));
  const addressLines = [
    asStr(currentAddress.line1),
    asStr(currentAddress.line2),
    [
      asStr(currentAddress.city),
      asStr(currentAddress.state),
      asStr(currentAddress.zip),
    ]
      .filter(Boolean)
      .join(', '),
  ].filter((l) => l.trim().length > 0);

  return (
    <div className="pt-1">
      {/* Day-1 checklist (U3) — everything the studio is still missing, read
          straight off state rather than ticked by hand. */}
      <StudioSetupChecklist
        orgCreatedAt={studio.created_at}
        myJobTitle={myJobTitle}
        memberCountBeyondSelf={memberCountBeyondSelf}
        projectsCount={projects?.length ?? 0}
        contactsCount={contactsCount}
        seedSkipped={seedSkipped}
        onInvite={() => setInviteOpen(true)}
        onSkipSeed={callSheetOn && canManage ? handleSkipSeed : undefined}
        skipSeedPending={updateOrg.isPending}
        onOpenSeedReview={callSheetOn ? () => setSeedReviewOpen(true) : undefined}
        skipSeedError={skipSeedError}
        className="mb-6 border-b border-[var(--color-pearl)] pb-5"
      />

      {/* Call Sheet Wave 2 — row 4's rolodex review. */}
      {callSheetOn && (
        <RolodexSeedSheet
          open={seedReviewOpen}
          onClose={() => setSeedReviewOpen(false)}
          organizationId={studio.id}
        />
      )}

      {/* Identity */}
      <div className="mb-6">
        {isRenaming ? (
          <div className="max-w-md">
            <label htmlFor="studio-rename" className={LABEL}>
              Studio name
            </label>
            <input
              id="studio-rename"
              type="text"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              className={FIELD}
            />
            <DocumentActionGroup
              surfaceKey="account"
              regionKey="studio-rename"
              className="mt-2"
            >
              <DocumentAction
                actionKey="save-studio-name"
                variant="primary"
                onClick={handleSaveRename}
                disabled={updateOrg.isPending}
                loading={updateOrg.isPending}
                loadingLabel="Saving…"
              >
                Save
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-studio-rename"
                variant="tertiary"
                onClick={() => setIsRenaming(false)}
              >
                Cancel
              </DocumentAction>
            </DocumentActionGroup>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate font-heading text-xl text-[var(--color-charcoal)]">
                {studio.name}
              </h2>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                {studio.slug}
              </p>
            </div>
            {canManage && (
              <DocumentAction
                actionKey="rename-studio"
                surfaceKey="account"
                regionKey="studio-name"
                variant="tertiary"
                onClick={startRename}
                className="shrink-0"
              >
                Rename
              </DocumentAction>
            )}
          </div>
        )}
        {isRenaming && updateOrg.isError && (
          <p
            role="alert"
            className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]"
          >
            {updateOrg.error instanceof Error
              ? updateOrg.error.message
              : 'Failed to save.'}
          </p>
        )}
      </div>

      {/* Branding */}
      <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
        <h3 className={`${LABEL} mb-3`}>Branding</h3>
        <p className={`${HELP} mb-4 mt-0`}>
          Your studio&rsquo;s logo and contact details appear on invoices,
          client-facing emails, and the client app.
        </p>

        {/* Logo */}
        <div className="mb-5">
          <span className={LABEL}>Logo</span>
          {canManage ? (
            <div className="mt-1.5">
              <StudioLogoUploadField
                studioId={studio.id}
                currentUrl={studio.logo_url}
                name={studio.name}
              />
            </div>
          ) : studio.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={studio.logo_url}
              alt={`${studio.name} logo`}
              className="mt-1.5 h-16 w-16 rounded-[6px] border border-[var(--color-pearl)] object-contain"
            />
          ) : (
            <p className={HELP}>No logo set.</p>
          )}
        </div>

        {canManage ? (
          <div className="max-w-md">
            <div className="mb-4">
              <label htmlFor="studio-website" className={LABEL}>
                Website
              </label>
              <input
                id="studio-website"
                type="url"
                value={branding.website}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, website: e.target.value }))
                }
                placeholder="https://your-studio.com"
                className={FIELD}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="studio-email" className={LABEL}>
                Contact email
              </label>
              <input
                id="studio-email"
                type="email"
                value={branding.email}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, email: e.target.value }))
                }
                placeholder="hello@your-studio.com"
                className={FIELD}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="studio-phone" className={LABEL}>
                Phone
              </label>
              <input
                id="studio-phone"
                type="tel"
                value={branding.phone}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, phone: e.target.value }))
                }
                placeholder="(555) 555-5555"
                className={FIELD}
              />
            </div>

            <span className={`${LABEL} mt-2`}>Address</span>
            <div className="mt-1.5 space-y-3">
              <input
                aria-label="Address line 1"
                type="text"
                value={branding.line1}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, line1: e.target.value }))
                }
                placeholder="Street address"
                className={FIELD}
              />
              <input
                aria-label="Address line 2"
                type="text"
                value={branding.line2}
                onChange={(e) =>
                  setBranding((b) => ({ ...b, line2: e.target.value }))
                }
                placeholder="Suite, unit, etc. (optional)"
                className={FIELD}
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <input
                  aria-label="City"
                  type="text"
                  value={branding.city}
                  onChange={(e) =>
                    setBranding((b) => ({ ...b, city: e.target.value }))
                  }
                  placeholder="City"
                  className={`${FIELD} col-span-2`}
                />
                <input
                  aria-label="State"
                  type="text"
                  value={branding.state}
                  onChange={(e) =>
                    setBranding((b) => ({ ...b, state: e.target.value }))
                  }
                  placeholder="State"
                  className={FIELD}
                />
                <input
                  aria-label="ZIP"
                  type="text"
                  value={branding.zip}
                  onChange={(e) =>
                    setBranding((b) => ({ ...b, zip: e.target.value }))
                  }
                  placeholder="ZIP"
                  className={FIELD}
                />
              </div>
            </div>

            <DocumentActionGroup
              surfaceKey="account"
              regionKey="studio-branding"
              className="mt-4 items-center"
            >
              <DocumentAction
                actionKey="save-studio-branding"
                variant="primary"
                onClick={handleSaveBranding}
                disabled={!brandingDirty || updateOrg.isPending}
                loading={updateOrg.isPending}
                loadingLabel="Saving…"
              >
                Save branding
              </DocumentAction>
              {!brandingDirty && !updateOrg.isPending && (
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                  Saved
                </span>
              )}
            </DocumentActionGroup>
            {!isRenaming && updateOrg.isError && (
              <p
                role="alert"
                className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]"
              >
                {friendlyStudioError(
                  updateOrg.error,
                  'Failed to save branding.',
                )}
              </p>
            )}
          </div>
        ) : (
          <dl className="max-w-md space-y-3">
            <div>
              <dt className={LABEL}>Website</dt>
              <dd className="text-[13px] text-[var(--color-charcoal)]">
                {studio.website || (
                  <span className="text-[var(--color-aged-oak)]">Not set</span>
                )}
              </dd>
            </div>
            <div>
              <dt className={LABEL}>Contact email</dt>
              <dd className="text-[13px] text-[var(--color-charcoal)]">
                {studio.email || (
                  <span className="text-[var(--color-aged-oak)]">Not set</span>
                )}
              </dd>
            </div>
            <div>
              <dt className={LABEL}>Phone</dt>
              <dd className="text-[13px] text-[var(--color-charcoal)]">
                {studio.phone || (
                  <span className="text-[var(--color-aged-oak)]">Not set</span>
                )}
              </dd>
            </div>
            <div>
              <dt className={LABEL}>Address</dt>
              <dd className="text-[13px] text-[var(--color-charcoal)]">
                {addressLines.length > 0 ? (
                  addressLines.map((line, i) => <div key={i}>{line}</div>)
                ) : (
                  <span className="text-[var(--color-aged-oak)]">Not set</span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Billing */}
      <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
        <h3 className={`${LABEL} mb-3`}>Billing</h3>
        <p className={`${HELP} mb-4 mt-0`}>
          The card fee and check remit-to instructions a client sees when
          paying an invoice from the client portal.
        </p>

        {canManage ? (
          <div className="max-w-md">
            <div className="mb-4">
              <label htmlFor="studio-card-fee" className={LABEL}>
                Card fee (%)
              </label>
              <input
                id="studio-card-fee"
                type="number"
                inputMode="decimal"
                min={0}
                max={3}
                step={0.05}
                value={billing.cardFeePercent}
                onChange={(e) =>
                  setBilling((b) => ({ ...b, cardFeePercent: e.target.value }))
                }
                className={FIELD}
              />
              {billingBps === null ? (
                <p
                  role="alert"
                  className="mt-1 text-[12px] text-[var(--color-terracotta-ink)]"
                >
                  Enter a card fee between 0 and 3 percent. Enter 0 if your
                  studio absorbs card processing.
                </p>
              ) : (
                <p className={HELP}>
                  Default 3% — added to card payments to cover processing.
                  Bank transfer (ACH) carries its own lower, fixed fee and
                  isn&rsquo;t affected by this setting.
                </p>
              )}
            </div>
            <div className="mb-4">
              <label htmlFor="studio-check-remit" className={LABEL}>
                Remit checks to
              </label>
              <textarea
                id="studio-check-remit"
                rows={3}
                value={billing.checkRemitTo}
                onChange={(e) =>
                  setBilling((b) => ({ ...b, checkRemitTo: e.target.value }))
                }
                placeholder={'Studio Name\n123 Main St\nCity, ST 00000'}
                className={`${FIELD} resize-none`}
              />
              <p className={HELP}>
                Shown to clients who choose to mail a check instead of
                paying online.
              </p>
            </div>

            <DocumentActionGroup
              surfaceKey="account"
              regionKey="studio-billing"
              className="mt-4 items-center"
            >
              <DocumentAction
                actionKey="save-studio-billing"
                variant="primary"
                onClick={handleSaveBilling}
                disabled={!billingDirty || billingBps === null || updateBilling.isPending}
                loading={updateBilling.isPending}
                loadingLabel="Saving…"
              >
                Save billing
              </DocumentAction>
              {!billingDirty && !updateBilling.isPending && (
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                  Saved
                </span>
              )}
            </DocumentActionGroup>
            {updateBilling.isError && (
              <p
                role="alert"
                className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]"
              >
                {friendlyStudioError(
                  updateBilling.error,
                  'Failed to save billing.',
                )}
              </p>
            )}
          </div>
        ) : (
          <dl className="max-w-md space-y-3">
            <div>
              <dt className={LABEL}>Card fee</dt>
              <dd className="text-[13px] text-[var(--color-charcoal)]">
                {billingSettings ? `${billingSettings.card_surcharge_bps / 100}%` : '—'}
              </dd>
            </div>
            <div>
              <dt className={LABEL}>Remit checks to</dt>
              <dd className="whitespace-pre-line text-[13px] text-[var(--color-charcoal)]">
                {billingSettings?.check_remit_to || (
                  <span className="text-[var(--color-aged-oak)]">Not set</span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Members */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className={LABEL}>Members</h3>
        {canManage && (
          <DocumentAction
            actionKey="invite-studio-teammate"
            surfaceKey="account"
            regionKey="studio-members"
            variant="primary"
            onClick={() => setInviteOpen(true)}
          >
            Invite teammate
          </DocumentAction>
        )}
      </div>

      {members === undefined ? (
        <p className="py-3 text-[12px] italic text-[var(--color-aged-oak)]">
          Reading members…
        </p>
      ) : (
        <ul>
          {members.map((m) => {
            const label =
              m.profiles?.display_name ||
              m.profiles?.email ||
              'Invited teammate';
            const isSelf = m.user_id === user?.id;
            const canEditMembership =
              canManage && !isSelf && m.role !== 'owner';
            const canTransferOwnership =
              myRole === 'owner' && !isSelf && m.status === 'active';
            const expired = isInviteExpired(m);
            const canResend = canManage && m.status === 'invited';
            const isResending = resendingMemberId === m.id;
            const feedback =
              resendFeedback?.memberId === m.id ? resendFeedback : null;

            return (
              <li
                key={m.id}
                className="flex flex-col gap-1.5 border-b border-[var(--color-pearl)] py-3"
              >
                <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-pearl)] font-mono text-[11px] uppercase tracking-wider text-[var(--color-mocha)]">
                    {monogramOf(
                      m.profiles?.display_name,
                      m.profiles?.email ?? '',
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-[var(--color-charcoal)]">
                      {label}
                      {isSelf && (
                        <span className="text-[var(--color-aged-oak)]">
                          {' '}
                          (you)
                        </span>
                      )}
                    </p>
                    {m.profiles?.display_name && m.profiles?.email && (
                      <p className="truncate text-[11px] text-[var(--color-aged-oak)]">
                        {m.profiles.email}
                      </p>
                    )}
                    <MemberTitleLine
                      organizationId={studio.id}
                      memberId={m.id}
                      jobTitle={m.job_title}
                      isSelf={isSelf}
                      viewerIsOwnerOrAdmin={canManage}
                      className="mt-0.5"
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <StatusBadge
                    tone={expired ? 'error' : STATUS_TONE[m.status] ?? 'neutral'}
                    dot
                  >
                    {expired ? 'Invite expired' : m.status}
                  </StatusBadge>
                  {canResend && (
                    <DocumentAction
                      actionKey="resend-studio-invite"
                      surfaceKey="account"
                      regionKey="studio-member-row"
                      variant="secondary"
                      onClick={() => handleResendInvite(m)}
                      disabled={resendInvite.isPending}
                      loading={isResending}
                      loadingLabel="Sending…"
                    >
                      Resend invite
                    </DocumentAction>
                  )}
                  {canEditMembership ? (
                    <Select
                      aria-label={`Role for ${label}`}
                      value={m.role}
                      onChange={(e) =>
                        handleRoleChange(
                          m.id,
                          m.role,
                          e.target.value as MemberRole,
                        )
                      }
                      disabled={updateRole.isPending}
                      wrapperClassName="w-28"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </Select>
                  ) : (
                    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                      {m.role}
                    </span>
                  )}
                  {canTransferOwnership && (
                    <DocumentAction
                      actionKey={
                        m.role === 'owner'
                          ? 'transfer-studio-ownership'
                          : 'make-studio-owner'
                      }
                      surfaceKey="account"
                      regionKey="studio-member-row"
                      variant="secondary"
                      onClick={() => handleTransfer(m.user_id, label)}
                      disabled={transferOwner.isPending}
                    >
                      {m.role === 'owner' ? 'Transfer ownership' : 'Make owner'}
                    </DocumentAction>
                  )}
                  {canEditMembership && (
                    <DocumentAction
                      actionKey="remove-studio-member"
                      surfaceKey="account"
                      regionKey="studio-member-row"
                      variant="tertiary"
                      onClick={() => handleRemove(m.id, label)}
                      disabled={removeMember.isPending}
                      className="text-[var(--color-terracotta-ink)]"
                    >
                      Remove
                    </DocumentAction>
                  )}
                </div>
                </div>
                {feedback && (
                  <p
                    role={feedback.ok ? 'status' : 'alert'}
                    className={`pl-11 text-[11px] ${
                      feedback.ok
                        ? 'text-[var(--color-aged-oak)]'
                        : 'text-[var(--color-terracotta-ink)]'
                    }`}
                  >
                    {feedback.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {transferOwner.isError && (
        <p
          role="alert"
          className="mt-3 text-[12px] text-[var(--color-terracotta-ink)]"
        >
          {friendlyStudioError(
            transferOwner.error,
            'Failed to transfer ownership.',
          )}
        </p>
      )}

      {/* Ownership transitions only go through transfer_studio_ownership. */}
      <div className="mt-6 border-t border-[var(--color-pearl)] pt-4">
        {myRole === 'owner' ? (
          <p className={HELP}>
            Transfer ownership to an active teammate before leaving the studio.
          </p>
        ) : (
          <DocumentAction
            actionKey="leave-studio"
            surfaceKey="account"
            regionKey="studio-membership"
            variant="tertiary"
            onClick={handleLeave}
            disabled={leaveOrg.isPending}
            loading={leaveOrg.isPending}
            loadingLabel="Leaving…"
            className="text-[var(--color-terracotta-ink)]"
          >
            Leave studio
          </DocumentAction>
        )}
        {myRole !== 'owner' && leaveOrg.isError && (
          <p
            role="alert"
            className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]"
          >
            {friendlyStudioError(leaveOrg.error, 'Failed to leave the studio.')}
          </p>
        )}
      </div>

      <StudioInviteModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={studio.id}
      />
    </div>
  );
}

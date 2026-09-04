"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  useProfile,
  useUpdateProfile,
  useSignOutAllDevices,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useMyThreadOverrides,
  useUpdateThreadNotificationPref,
  useMuteThread,
  type NotificationPref,
} from "@patina/supabase";
import type { NotificationPreferences } from "@patina/shared/types";

import { ScoredAction } from "@/components/making/scored-action";
import { AvatarUploadField } from "@/components/account/AvatarUploadField";

import { useScrollLock } from "./use-scroll-lock";

/* ── Your details ──────────────────────────────────────────────────────────
   The one place on the Threshold that is about her, not the house: the
   name and number the studio has on file, what she hears from Patina and
   how, and the one hard exit — every session, everywhere, ended at once.

   Absorbs /account, /preferences and /settings/notifications (the inventory
   calls the latter two a duplicate pair; this is their merge) as an in-place
   sheet, never a route change. Data export/erase are NOT built here: the
   inventory (§8, gap 11) found no caller wired to either API route, and
   "absence is silence" — an act with nothing behind it is worse than no act.

   Paper on paper with a hairline, no shadow: the sheet is `--bg-surface` on
   the page's `--bg-primary`, told apart only by a border and a scrim behind
   it. It is dismissed by the same control that opened it (the mat's "Your
   details" toggles), by Escape, or by the scrim — and hands focus back to
   whichever of those closed it. ──────────────────────────────────────────── */

export interface DetailsSheetProps {
  open: boolean;
  onClose: () => void;
}

const SECTION_HEAD_CLASS =
  "font-mono text-[11px] font-normal uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]";
const FIELD_LABEL_CLASS =
  "block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)] mb-1.5";
const TEXT_INPUT_CLASS =
  "w-full max-w-[36ch] border-0 border-b border-current bg-transparent px-0.5 py-1.5 text-[15px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--threshold-accent,#8A5F19)]";
const ROW_CLASS =
  "flex items-start justify-between gap-4 border-t border-[var(--border-subtle)] py-2.5";

/* Every client-relevant preference key from both retired pages, deduped and
   grouped as the merge — /preferences' "Marketing & inspiration" plus
   /settings/notifications' four categories. Designer-only keys
   (type_new_lead, type_lead_expiring, type_lead_response,
   type_commission_earned, type_teaching_reminder) never appeared on a client
   page and are left out on purpose. */
const PREF_GROUPS: Array<{
  title: string;
  description: string;
  rows: Array<{
    key: keyof NotificationPreferences;
    label: string;
    help?: string;
  }>;
}> = [
  {
    title: "Projects",
    description: "Updates on your projects and messages from the studio.",
    rows: [
      {
        key: "type_project_milestone",
        label: "Project milestones",
        help: "Design reveals, approvals, delivery dates",
      },
      {
        key: "type_client_message",
        label: "Messages",
        help: "New messages from your designer or team",
      },
    ],
  },
  {
    title: "Orders",
    description: "Receipts and shipping updates.",
    rows: [
      { key: "type_order_confirmation", label: "Order confirmations" },
      { key: "type_payment_receipt", label: "Payment receipts" },
    ],
  },
  {
    title: "Product alerts",
    description: "Updates on pieces you've saved or asked about.",
    rows: [
      { key: "type_price_drop", label: "Price drops" },
      { key: "type_back_in_stock", label: "Back in stock" },
      { key: "type_wishlist_update", label: "Wishlist updates" },
    ],
  },
  {
    title: "Inspiration & marketing",
    description:
      "Curated content, launches, and seasonal features. Easy to mute.",
    rows: [
      { key: "type_weekly_inspiration", label: "Weekly inspiration" },
      { key: "type_new_products", label: "New products" },
      { key: "type_product_launch", label: "Product launches" },
      { key: "type_seasonal_campaign", label: "Seasonal campaigns" },
      { key: "type_founding_circle", label: "Founding Circle updates" },
      { key: "type_reengagement", label: "Re-engagement" },
    ],
  },
];

const DIGEST_OPTIONS: Array<{
  value: NotificationPreferences["digest_frequency"];
  label: string;
}> = [
  { value: "never", label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "monthly", label: "Monthly" },
];

const REMINDER_OPTIONS: Array<{
  value: NotificationPreferences["reminder_cadence"];
  label: string;
}> = [
  { value: "immediate", label: "Right away" },
  { value: "daily_digest", label: "Daily summary" },
];

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Phoenix",
  "Pacific/Honolulu",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
  "UTC",
];

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DetailsSheet({ open, onClose }: DetailsSheetProps) {
  const headingId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // ── open/close: remember who had focus, hand it back on close ───────────
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const first =
      containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // ── Esc closes; Tab is trapped inside the sheet ──────────────────────────
  // Guarded on the event's own target being inside THIS sheet's container:
  // L5's papers-sheet mounts in the same threshold.tsx wrapper with the same
  // Esc contract, and without the guard one Escape would close both overlays.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      // Focus falls to <body> whenever a click lands on non-focusable prose or
      // the focused act disables itself mid-write. `<body>` is not inside the
      // dialog, so an unqualified `contains` guard would kill Escape and the
      // Tab trap exactly then — with the scrim still covering the page.
      const target = event.target as Node | null;
      const loose =
        !target || target === document.body || target === document.documentElement;
      if (!loose && !containerRef.current?.contains(target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable =
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusable || focusable.length === 0) return;
      const list = Array.from(focusable);
      const first = list[0];
      const last = list[list.length - 1];
      if (loose) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // ── Lock the page behind the sheet from scrolling under the scrim ───────
  useScrollLock(open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        aria-label="Close your details"
        onClick={onClose}
        className="fixed inset-0 z-0 cursor-default bg-[var(--text-primary)] opacity-[0.28]"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-testid="details-sheet"
        className="relative z-10 my-[clamp(20px,6vh,80px)] w-full max-w-[560px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-[clamp(20px,4vw,36px)]"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2
            id={headingId}
            className="font-heading text-[1.4rem] text-[var(--text-primary)]"
          >
            Your details
          </h2>
          <ScoredAction
            actionKey="details_close"
            regionKey="details"
            surfaceKey="the_threshold"
            variant="tertiary"
            onClick={onClose}
          >
            Shut
          </ScoredAction>
        </div>

        <ProfileSection />
        <NotificationsSection />
        <ConversationsSection />
        <SessionsSection />
      </div>
    </div>
  );
}

function ProfileSection() {
  const { data: profile, isLoading, isError } = useProfile();
  const updateProfile = useUpdateProfile();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // Adjusted during render, not in an effect (react-hooks/set-state-in-effect):
  // the moment the profile query resolves, the fields take its values once —
  // `hydratedId` is the witness that this has already happened for THIS row,
  // so a later save (which invalidates and re-fetches the same profile) never
  // stomps what she is still typing.
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const hydrated = !!profile && hydratedId === profile.id;
  if (profile && hydratedId !== profile.id) {
    setHydratedId(profile.id);
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
  }

  const dirty =
    hydrated &&
    !!profile &&
    ((fullName.trim() || null) !== (profile.full_name ?? null) ||
      (phone.trim() || null) !== (profile.phone ?? null));

  function onSave() {
    updateProfile.mutate(
      { full_name: fullName.trim() || null, phone: phone.trim() || null },
      { onSuccess: () => setSavedAt(new Date()) },
    );
  }

  return (
    <section
      className="mt-6 border-t border-[var(--border-default)] pt-5"
      data-testid="details-profile"
    >
      <p className={SECTION_HEAD_CLASS}>Name and number</p>

      {isError ? (
        <p className="mt-3 text-[15px] text-[var(--text-muted)]">
          The file could not be read.
        </p>
      ) : isLoading || !hydrated ? (
        <p className="mt-3 text-[15px] text-[var(--text-muted)]">
          Reading the file…
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {profile && (
            <AvatarUploadField
              userId={profile.id}
              currentUrl={profile.avatar_url}
              displayName={profile.full_name ?? undefined}
            />
          )}

          <label htmlFor="details-full-name">
            <span className={FIELD_LABEL_CLASS}>Full name</span>
            <input
              id="details-full-name"
              data-testid="details-full-name"
              type="text"
              value={fullName}
              autoComplete="name"
              onChange={(event) => setFullName(event.target.value)}
              className={TEXT_INPUT_CLASS}
            />
          </label>

          <div>
            <span className={FIELD_LABEL_CLASS}>Email</span>
            <p className="text-[15px] text-[var(--text-muted)]">
              {profile?.email}
            </p>
          </div>

          <label htmlFor="details-phone">
            <span className={FIELD_LABEL_CLASS}>Phone</span>
            <input
              id="details-phone"
              data-testid="details-phone"
              type="tel"
              value={phone}
              autoComplete="tel"
              onChange={(event) => setPhone(event.target.value)}
              className={TEXT_INPUT_CLASS}
            />
          </label>

          <div className="flex items-center gap-4">
            <ScoredAction
              actionKey="details_save_profile"
              regionKey="details"
              surfaceKey="the_threshold"
              variant="secondary"
              disabled={!dirty}
              loading={updateProfile.isPending}
              loadingLabel="Saving"
              onClick={onSave}
              data-testid="details-save"
            >
              Save
            </ScoredAction>
            {!updateProfile.isPending && savedAt && (
              <p
                role="status"
                data-testid="details-profile-saved"
                aria-label="Profile saved"
                className="text-[13px] text-[var(--text-muted)]"
              >
                Saved{" "}
                {savedAt.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
            {updateProfile.isError && (
              <p
                role="alert"
                className="text-[13px] text-[var(--color-error,#C77B6E)]"
              >
                {updateProfile.error instanceof Error
                  ? updateProfile.error.message
                  : "Could not save."}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function NotificationsSection() {
  const { data: prefs, isLoading, isError } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
  const browserTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const timezones = useMemo(() => {
    return Array.from(
      new Set(
        [browserTz, prefs?.timezone, ...COMMON_TIMEZONES].filter(Boolean),
      ),
    ) as string[];
  }, [browserTz, prefs?.timezone]);

  function update(updates: Partial<NotificationPreferences>) {
    updatePrefs.mutate(updates);
  }

  return (
    <section
      className="mt-6 border-t border-[var(--border-default)] pt-5"
      data-testid="details-notifications"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className={SECTION_HEAD_CLASS}>What reaches you</p>
        {updatePrefs.isPending && (
          <p
            role="status"
            data-testid="details-prefs-saving"
            aria-label="Saving what reaches you"
            className="text-[13px] text-[var(--text-muted)]"
          >
            Saving…
          </p>
        )}
        {updatePrefs.isError && (
          <p
            role="alert"
            className="text-[13px] text-[var(--color-error,#C77B6E)]"
          >
            {updatePrefs.error instanceof Error
              ? updatePrefs.error.message
              : "Could not save."}
          </p>
        )}
      </div>

      {isError ? (
        <p className="mt-3 text-[15px] text-[var(--text-muted)]">
          The file could not be read.
        </p>
      ) : isLoading || !prefs ? (
        <p className="mt-3 text-[15px] text-[var(--text-muted)]">
          Reading the file…
        </p>
      ) : (
        <div className="mt-3">
          <PrefToggle
            label="Email notifications"
            help="Turn off to stop all email from Patina, including order receipts and account alerts."
            checked={prefs.channels_email}
            onChange={(v) => update({ channels_email: v })}
          />
          <PrefToggle
            label="Push"
            help="Requires the Patina mobile app"
            checked={prefs.channels_push}
            onChange={(v) => update({ channels_push: v })}
          />
          <PrefToggle
            label="In-app"
            checked={prefs.channels_in_app}
            onChange={(v) => update({ channels_in_app: v })}
          />

          {PREF_GROUPS.map((group) => (
            <div key={group.title} className="mt-5">
              <p className="text-[15px] font-medium text-[var(--text-primary)]">
                {group.title}
              </p>
              <p className="text-[13px] text-[var(--text-muted)]">
                {group.description}
              </p>
              {group.rows.map((row) => (
                <PrefToggle
                  key={String(row.key)}
                  label={row.label}
                  help={row.help}
                  checked={!!prefs[row.key]}
                  onChange={(v) =>
                    update({ [row.key]: v } as Partial<NotificationPreferences>)
                  }
                />
              ))}
            </div>
          ))}

          <div className="mt-5">
            <p className="text-[15px] font-medium text-[var(--text-primary)]">
              Quiet hours
            </p>
            <p className="text-[13px] text-[var(--text-muted)]">
              Pause non-urgent notifications during set hours.
            </p>
            <PrefToggle
              label="Enable quiet hours"
              checked={prefs.quiet_hours_enabled}
              onChange={(v) => update({ quiet_hours_enabled: v })}
            />
            {prefs.quiet_hours_enabled && (
              <div className="mt-2 flex flex-wrap items-end gap-4">
                <label htmlFor="details-quiet-start">
                  <span className={FIELD_LABEL_CLASS}>Start</span>
                  <input
                    id="details-quiet-start"
                    type="time"
                    value={prefs.quiet_hours_start ?? "22:00"}
                    onChange={(event) =>
                      update({ quiet_hours_start: event.target.value })
                    }
                    className={TEXT_INPUT_CLASS}
                  />
                </label>
                <label htmlFor="details-quiet-end">
                  <span className={FIELD_LABEL_CLASS}>End</span>
                  <input
                    id="details-quiet-end"
                    type="time"
                    value={prefs.quiet_hours_end ?? "08:00"}
                    onChange={(event) =>
                      update({ quiet_hours_end: event.target.value })
                    }
                    className={TEXT_INPUT_CLASS}
                  />
                </label>
                <label htmlFor="details-quiet-tz" className="min-w-[16ch]">
                  <span className={FIELD_LABEL_CLASS}>Timezone</span>
                  <select
                    id="details-quiet-tz"
                    value={prefs.timezone || browserTz}
                    onChange={(event) =>
                      update({ timezone: event.target.value })
                    }
                    className={TEXT_INPUT_CLASS}
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                        {tz === browserTz ? " (your timezone)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="mt-5">
            <p className="text-[15px] font-medium text-[var(--text-primary)]">
              Digest frequency
            </p>
            <p className="text-[13px] text-[var(--text-muted)]">
              Bundle routine updates into a single email.
            </p>
            <fieldset className="mt-2 flex flex-col gap-1.5">
              <legend className="sr-only">Digest frequency</legend>
              {DIGEST_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 text-[15px] text-[var(--text-body)]"
                >
                  <input
                    type="radio"
                    name="details-digest-frequency"
                    value={opt.value}
                    checked={prefs.digest_frequency === opt.value}
                    onChange={() => update({ digest_frequency: opt.value })}
                    className="h-4 w-4 border border-current"
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
          </div>

          <div className="mt-5">
            <p className="text-[15px] font-medium text-[var(--text-primary)]">
              Reminders
            </p>
            <p className="text-[13px] text-[var(--text-muted)]">
              How gentle nudges — proposal reminders and decision requests —
              reach you. A new proposal and invoice reminders are time-sensitive
              and always arrive right away, regardless of this setting.
            </p>
            <fieldset className="mt-2 flex flex-col gap-1.5">
              <legend className="sr-only">Reminder cadence</legend>
              {REMINDER_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 text-[15px] text-[var(--text-body)]"
                >
                  <input
                    type="radio"
                    name="details-reminder-cadence"
                    value={opt.value}
                    checked={
                      (prefs.reminder_cadence ?? "immediate") === opt.value
                    }
                    onChange={() => update({ reminder_cadence: opt.value })}
                    className="h-4 w-4 border border-current"
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
          </div>
        </div>
      )}
    </section>
  );
}

function PrefToggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`${ROW_CLASS} cursor-pointer first:border-t-0`}>
      <span className="flex-1">
        <span className="block text-[15px] text-[var(--text-body)]">
          {label}
        </span>
        {help && (
          <span className="block text-[13px] text-[var(--text-muted)]">
            {help}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 border border-current"
      />
    </label>
  );
}

const THREAD_KIND_LABEL: Record<string, string> = {
  project: "Project",
  vendor_brief: "Vendor brief",
};

function ConversationsSection() {
  const { data: overrides = [], isLoading, isError } = useMyThreadOverrides();
  const updatePref = useUpdateThreadNotificationPref();
  const muteThread = useMuteThread();

  const muted = overrides.filter((o) => o.muted_at);
  const customPref = overrides.filter(
    (o) => !o.muted_at && o.notification_pref !== "all",
  );

  if (!isLoading && !isError && muted.length + customPref.length === 0)
    return null;

  return (
    <section
      className="mt-6 border-t border-[var(--border-default)] pt-5"
      data-testid="details-threads"
    >
      <p className={SECTION_HEAD_CLASS}>Conversations, muted or set apart</p>

      {isError ? (
        <p className="mt-3 text-[15px] text-[var(--text-muted)]">
          The file could not be read.
        </p>
      ) : isLoading ? (
        <p className="mt-3 text-[15px] text-[var(--text-muted)]">
          Reading the file…
        </p>
      ) : (
        <div className="mt-3">
          {[...muted, ...customPref].map((override) => {
            const label =
              override.thread_title ??
              (override.counterpart_names.join(", ") || "A conversation");
            const kindLabel =
              THREAD_KIND_LABEL[override.thread_kind] ?? "Direct";
            return (
              <div key={override.thread_id} className={ROW_CLASS}>
                <span className="flex-1 text-[15px] text-[var(--text-body)]">
                  {label}
                  <span className="block font-mono text-[11px] tracking-[0.04em] text-[var(--text-muted)]">
                    {kindLabel}
                  </span>
                </span>
                {override.muted_at ? (
                  <ScoredAction
                    actionKey="details_thread_unmute"
                    regionKey="details"
                    surfaceKey="the_threshold"
                    variant="tertiary"
                    onClick={() =>
                      muteThread.mutate({
                        threadId: override.thread_id,
                        muted: false,
                      })
                    }
                  >
                    Unmute
                  </ScoredAction>
                ) : (
                  <select
                    aria-label={`Notification preference for ${label}`}
                    value={override.notification_pref}
                    onChange={(event) =>
                      updatePref.mutate({
                        threadId: override.thread_id,
                        pref: event.target.value as NotificationPref,
                      })
                    }
                    className="border-0 border-b border-[var(--border-default)] bg-transparent text-[13px] text-[var(--text-body)]"
                  >
                    <option value="all">All messages</option>
                    <option value="mentions">Mentions only</option>
                    <option value="none">No notifications</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SessionsSection() {
  const router = useRouter();
  const signOutAll = useSignOutAllDevices();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    try {
      await signOutAll.mutateAsync();
      router.push("/auth/signin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed");
      setConfirming(false);
    }
  }

  return (
    <section
      className="mt-6 border-t border-[var(--border-default)] pt-5 pb-1"
      data-testid="details-sessions"
    >
      <p className={SECTION_HEAD_CLASS}>Every session, everywhere</p>
      <p className="mt-2 max-w-[48ch] text-[15px] text-[var(--text-body)]">
        End every active session on every device. You&rsquo;ll need to sign in
        again afterwards.
      </p>

      {!confirming ? (
        <ScoredAction
          actionKey="details_signout_all"
          regionKey="details"
          surfaceKey="the_threshold"
          variant="secondary"
          className="mt-3"
          onClick={() => setConfirming(true)}
          data-testid="details-signout-all"
        >
          Sign out everywhere
        </ScoredAction>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <p className="max-w-[48ch] text-[15px] text-[var(--text-body)]">
            This ends every active session on every device, including this one.
            You&rsquo;ll be redirected to sign in.
          </p>
          <ScoredAction
            actionKey="details_signout_all_confirm"
            regionKey="details"
            surfaceKey="the_threshold"
            variant="secondary"
            loading={signOutAll.isPending}
            loadingLabel="Signing out"
            onClick={onConfirm}
            data-testid="details-signout-all-confirm"
          >
            Yes, sign out everywhere
          </ScoredAction>
          <ScoredAction
            actionKey="details_signout_all_cancel"
            regionKey="details"
            surfaceKey="the_threshold"
            variant="tertiary"
            disabled={signOutAll.isPending}
            onClick={() => setConfirming(false)}
          >
            Never mind
          </ScoredAction>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 text-[13px] text-[var(--color-error,#C77B6E)]"
        >
          {error}
        </p>
      )}
    </section>
  );
}

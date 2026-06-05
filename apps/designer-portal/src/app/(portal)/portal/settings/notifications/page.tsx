'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { NotificationPreferences } from '@patina/shared/types';
import {
  createBrowserClient,
  useMyThreadOverrides,
  useUpdateThreadNotificationPref,
  useMuteThread,
  type ThreadOverride,
  type NotificationPref,
} from '@patina/supabase';
import { Button } from '@/components/ui/controls';

const CATEGORIES: Array<{
  title: string;
  description: string;
  rows: Array<{ key: keyof NotificationPreferences; label: string; help?: string }>;
}> = [
  {
    title: 'Lead & client activity',
    description: 'Updates on new leads, messages, and client milestones.',
    rows: [
      { key: 'type_new_lead', label: 'New leads', help: 'A client has requested you' },
      { key: 'type_lead_expiring', label: 'Lead expiring soon', help: '24-hour warning before reassignment' },
      { key: 'type_lead_response', label: 'Lead responses', help: 'Clients replying to your outreach' },
      { key: 'type_client_message', label: 'Client messages' },
      { key: 'type_project_milestone', label: 'Project milestones' },
      { key: 'type_commission_earned', label: 'Commission earned' },
    ],
  },
  {
    title: 'Account',
    description: "Receipts and security. Can't be fully disabled.",
    rows: [
      { key: 'type_account_security', label: 'Account & security' },
      { key: 'type_order_confirmation', label: 'Order confirmations' },
      { key: 'type_payment_receipt', label: 'Payment receipts' },
    ],
  },
  {
    title: 'Products & catalog',
    description: 'Updates on products you curate or monitor.',
    rows: [
      { key: 'type_new_products', label: 'New products' },
      { key: 'type_teaching_reminder', label: 'Teaching reminders' },
      { key: 'type_price_drop', label: 'Price drops' },
      { key: 'type_back_in_stock', label: 'Back in stock' },
    ],
  },
  {
    title: 'Marketing',
    description: 'Inspiration and occasional announcements.',
    rows: [
      { key: 'type_weekly_inspiration', label: 'Weekly inspiration' },
      { key: 'type_founding_circle', label: 'Founding Circle updates' },
      { key: 'type_product_launch', label: 'Product launches' },
      { key: 'type_seasonal_campaign', label: 'Seasonal campaigns' },
    ],
  },
];

async function fetchPrefs(): Promise<NotificationPreferences> {
  const res = await fetch('/api/user/preferences');
  if (!res.ok) throw new Error('Failed to load preferences');
  return res.json();
}

async function patchPrefs(updates: Partial<NotificationPreferences>) {
  const res = await fetch('/api/user/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to save preferences');
  return res.json();
}

// ─── SMS (SET-08) ──────────────────────────────────────────────────────────
// Phone + consent live on profiles. Read/write directly via Supabase since the
// preferences API only covers notification_preferences.

interface SmsProfile {
  phone: string;
  sms_opt_in: boolean;
}

async function fetchSmsProfile(): Promise<SmsProfile> {
  const supabase = createBrowserClient() as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { phone: '', sms_opt_in: false };

  const { data } = await supabase
    .from('profiles')
    .select('phone, sms_opt_in')
    .eq('id', user.id)
    .single();

  return {
    phone: data?.phone ?? '',
    sms_opt_in: data?.sms_opt_in ?? false,
  };
}

async function updateSmsProfile(updates: Partial<SmsProfile>) {
  const supabase = createBrowserClient() as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id);

  if (error) throw new Error(error.message || 'Failed to save SMS settings');
}

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // SET-08: SMS opt-in lives on profiles (phone, sms_opt_in); the channel
  // toggle mirrors into notification_preferences.channels_sms.
  const [profile, setProfile] = useState<SmsProfile | null>(null);

  useEffect(() => {
    fetchPrefs()
      .then(setPrefs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    fetchSmsProfile()
      .then(setProfile)
      .catch(() => setProfile({ phone: '', sms_opt_in: false }));
  }, []);

  async function update(key: keyof NotificationPreferences, value: unknown) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value } as NotificationPreferences;
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const saved = await patchPrefs({
        [key]: value,
      } as Partial<NotificationPreferences>);
      setPrefs(saved);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Persist the phone number to profiles.phone.
  async function saveSmsPhone(phone: string) {
    setSaving(true);
    setError(null);
    try {
      await updateSmsProfile({ phone });
      setProfile((p) => ({ phone, sms_opt_in: p?.sms_opt_in ?? false }));
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Toggle SMS: writes profiles.sms_opt_in AND
  // notification_preferences.channels_sms so dispatch honours both gates.
  async function toggleSms(enabled: boolean) {
    if (!profile?.phone) return; // gated on a saved phone
    setProfile((p) => ({ phone: p?.phone ?? '', sms_opt_in: enabled }));
    if (prefs) setPrefs({ ...prefs, channels_sms: enabled });
    setSaving(true);
    setError(null);
    try {
      await updateSmsProfile({ sms_opt_in: enabled });
      const saved = await patchPrefs({
        channels_sms: enabled,
      } as Partial<NotificationPreferences>);
      setPrefs(saved);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-[var(--text-faint)]">Loading preferences…</div>
    );
  }

  if (!prefs) {
    return (
      <div className="py-16 text-center text-[#C45B4A]">
        Sign in to manage preferences.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-semibold text-[var(--color-charcoal)] mb-2">
          Notifications
        </h1>
        <p className="text-[var(--color-bark)] text-[15px]">
          Choose what you want to hear from us — and how.
        </p>
      </header>

      <SaveStatus saving={saving} savedAt={savedAt} error={error} />

      <Section title="Delivery channels" description="Where you receive notifications.">
        <Toggle
          label="Email"
          checked={prefs.channels_email}
          onChange={(v) => update('channels_email', v)}
        />
        <Toggle
          label="In-app"
          checked={prefs.channels_in_app}
          onChange={(v) => update('channels_in_app', v)}
        />
        <Toggle
          label="Push (mobile)"
          checked={prefs.channels_push}
          onChange={(v) => update('channels_push', v)}
          help="Requires the Patina mobile app"
        />
        <SmsChannel
          profile={profile}
          channelEnabled={prefs.channels_sms}
          onSavePhone={saveSmsPhone}
          onToggle={toggleSms}
        />
      </Section>

      {CATEGORIES.map((cat) => (
        <Section key={cat.title} title={cat.title} description={cat.description}>
          {cat.rows.map((row) => (
            <Toggle
              key={String(row.key)}
              label={row.label}
              help={row.help}
              checked={!!prefs[row.key]}
              onChange={(v) => update(row.key, v)}
            />
          ))}
        </Section>
      ))}

      <Section title="Digest" description="Batch routine updates into a single email.">
        <label className="block">
          <span className="block text-sm font-medium text-[var(--color-charcoal)] mb-2">
            Frequency
          </span>
          <select
            value={prefs.digest_frequency ?? 'never'}
            onChange={(e) =>
              update(
                'digest_frequency',
                e.target.value as NotificationPreferences['digest_frequency'],
              )
            }
            className="w-full max-w-xs px-3 py-2 border border-[var(--border-warm)] rounded-md bg-white text-[var(--color-charcoal)]"
          >
            <option value="never">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every two weeks</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </Section>

      <MessagesSection />

      <Section
        title="Quiet hours"
        description="Pause non-urgent notifications during set hours."
      >
        <Toggle
          label="Enable quiet hours"
          checked={prefs.quiet_hours_enabled}
          onChange={(v) => update('quiet_hours_enabled', v)}
        />
        {prefs.quiet_hours_enabled && (
          <div className="flex gap-4 mt-3">
            <TimeField
              label="Start"
              value={prefs.quiet_hours_start ?? '22:00'}
              onChange={(v) => update('quiet_hours_start', v)}
            />
            <TimeField
              label="End"
              value={prefs.quiet_hours_end ?? '08:00'}
              onChange={(v) => update('quiet_hours_end', v)}
            />
          </div>
        )}
      </Section>
    </div>
  );
}

function MessagesSection() {
  const { data: overrides = [], isLoading } = useMyThreadOverrides();
  const updatePref = useUpdateThreadNotificationPref();
  const muteThread = useMuteThread();

  const muted = overrides.filter((o) => o.muted_at);
  const customPref = overrides.filter(
    (o) => !o.muted_at && o.notification_pref !== 'all'
  );

  return (
    <Section
      title="Messages"
      description="Per-thread notification overrides. New threads default to all messages."
    >
      {isLoading ? (
        <p className="text-sm text-[var(--text-faint)]">Loading overrides…</p>
      ) : overrides.length === 0 ? (
        <p className="text-sm text-[var(--text-faint)]">
          No threads currently muted or customized. Use the bell or menu icons
          inside any conversation to set an override.
        </p>
      ) : (
        <>
          {muted.length > 0 && (
            <div className="mb-5">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-2">
                Muted ({muted.length})
              </h3>
              <ul className="divide-y divide-[var(--bg-warm)] rounded border border-[var(--bg-warm)]">
                {muted.map((o) => (
                  <ThreadOverrideRow
                    key={o.thread_id}
                    override={o}
                    onUnmute={() =>
                      muteThread.mutate({
                        threadId: o.thread_id,
                        muted: false,
                      })
                    }
                  />
                ))}
              </ul>
            </div>
          )}
          {customPref.length > 0 && (
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-2">
                Custom preference ({customPref.length})
              </h3>
              <ul className="divide-y divide-[var(--bg-warm)] rounded border border-[var(--bg-warm)]">
                {customPref.map((o) => (
                  <ThreadOverrideRow
                    key={o.thread_id}
                    override={o}
                    onChangePref={(pref) =>
                      updatePref.mutate({ threadId: o.thread_id, pref })
                    }
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function ThreadOverrideRow({
  override,
  onUnmute,
  onChangePref,
}: {
  override: ThreadOverride;
  onUnmute?: () => void;
  onChangePref?: (pref: NotificationPref) => void;
}) {
  const label =
    override.thread_title ??
    override.counterpart_names.join(', ') ??
    'Conversation';
  const kindLabel =
    override.thread_kind === 'project'
      ? 'Project'
      : override.thread_kind === 'vendor_brief'
        ? 'Vendor brief'
        : 'Direct';

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/portal/messages/${override.thread_id}`}
          className="block truncate text-[14px] font-medium text-[var(--color-charcoal)] hover:underline"
        >
          {label}
        </Link>
        <p className="text-xs text-[var(--text-faint)]">{kindLabel}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onUnmute && (
          <Button variant="secondary" size="sm" onClick={onUnmute}>
            Unmute
          </Button>
        )}
        {onChangePref && (
          <select
            value={override.notification_pref}
            onChange={(e) => onChangePref(e.target.value as NotificationPref)}
            className="rounded border border-[var(--border-warm)] bg-white px-2 py-1 text-xs text-[var(--color-charcoal)]"
          >
            <option value="all">All messages</option>
            <option value="mentions">Mentions only</option>
            <option value="none">No notifications</option>
          </select>
        )}
      </div>
    </li>
  );
}

function SmsChannel({
  profile,
  channelEnabled,
  onSavePhone,
  onToggle,
}: {
  profile: SmsProfile | null;
  channelEnabled: boolean;
  onSavePhone: (phone: string) => void;
  onToggle: (enabled: boolean) => void;
}) {
  const [draftPhone, setDraftPhone] = useState('');

  // Sync the draft once the profile loads / changes.
  useEffect(() => {
    setDraftPhone(profile?.phone ?? '');
  }, [profile?.phone]);

  const savedPhone = profile?.phone ?? '';
  const hasPhone = savedPhone.trim().length > 0;
  const dirty = draftPhone.trim() !== savedPhone.trim();
  const enabled = channelEnabled && (profile?.sms_opt_in ?? false);

  return (
    <div className="border-t border-[var(--bg-warm)] pt-3 mt-1">
      <div className="flex items-start justify-between gap-4">
        <span className="flex-1">
          <span className="block text-[15px] text-[var(--color-charcoal)] font-medium">SMS</span>
          <span className="block text-xs text-[var(--text-faint)] mt-0.5">
            Time-sensitive alerts via text. SMS requires admin Twilio setup —
            standard message and data rates may apply.
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!hasPhone}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label="Enable SMS notifications"
          title={hasPhone ? undefined : 'Save a phone number to enable SMS'}
          className={`mt-1 h-5 w-5 rounded border-[var(--border-warm)] text-[var(--color-taupe)] focus:ring-[var(--color-taupe)] ${
            hasPhone ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
          }`}
        />
      </div>

      <div className="mt-3 flex items-end gap-2">
        <label className="flex-1">
          <span className="block text-sm font-medium text-[var(--color-charcoal)] mb-1">
            Mobile number
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 (555) 123-4567"
            value={draftPhone}
            onChange={(e) => setDraftPhone(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--border-warm)] rounded-md bg-white text-[var(--color-charcoal)]"
          />
        </label>
        <Button
          variant="secondary"
          className="shrink-0"
          disabled={!dirty || draftPhone.trim().length === 0}
          onClick={() => onSavePhone(draftPhone.trim())}
        >
          Save
        </Button>
      </div>
      {!hasPhone && (
        <p className="mt-2 text-xs text-[var(--text-faint)]">
          Save a verified mobile number to enable the SMS channel.
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-lg shadow-sm p-6 mb-6 border border-[var(--bg-warm)]">
      <h2 className="font-serif text-lg font-semibold text-[var(--color-charcoal)] mb-1">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-[var(--text-faint)] mb-4">{description}</p>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className="flex-1">
        <span className="block text-[15px] text-[var(--color-charcoal)] font-medium">
          {label}
        </span>
        {help && <span className="block text-xs text-[var(--text-faint)] mt-0.5">{help}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className="mt-1 h-5 w-5 rounded border-[var(--border-warm)] text-[var(--color-taupe)] focus:ring-[var(--color-taupe)]"
      />
    </label>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex-1">
      <span className="block text-sm font-medium text-[var(--color-charcoal)] mb-1">
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-[var(--border-warm)] rounded-md bg-white text-[var(--color-charcoal)]"
      />
    </label>
  );
}

function SaveStatus({
  saving,
  savedAt,
  error,
}: {
  saving: boolean;
  savedAt: Date | null;
  error: string | null;
}) {
  const status = useMemo(() => {
    if (error) return { text: error, color: 'text-[#C45B4A]' };
    if (saving) return { text: 'Saving…', color: 'text-[var(--text-faint)]' };
    if (savedAt)
      return {
        text: `Saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
        color: 'text-[var(--text-faint)]',
      };
    return null;
  }, [error, saving, savedAt]);

  if (!status) return null;
  return (
    <div className={`mb-4 text-sm ${status.color}`} role="status" aria-live="polite">
      {status.text}
    </div>
  );
}

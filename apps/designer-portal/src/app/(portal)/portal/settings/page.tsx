'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useProfile, useUpdateProfile, useUpdatePassword, useOrganizations, useMfaFactors } from '@patina/supabase';
import { StrataMark } from '@/components/portal/strata-mark';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { Button } from '@/components/ui/controls';
import { LoadingStrata } from '@/components/portal/loading-strata';
// F1.7 — Settings migrated to ambient help-system layer per spec §12.4.
// Every form-section header gets a SectionIntro to explain *why* this
// preference exists. FieldLabel + FieldHelper replace plain <label> +
// helper-text patterns so authors can swap copy without touching code.
// FieldHelper renders its `fallback` inline until Sanity ships per-field
// copy; on CMS hit it switches to the canonical authored body.
import {
  FieldHelper,
  FieldLabel,
  SectionIntro,
  SurfaceKeys,
} from '@patina/help-system';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: profile } = useProfile() as { data: Any };
  const updateProfile = useUpdateProfile();
  const updatePassword = useUpdatePassword();
  // SET-09 — read/write notification toggles through /api/user/preferences,
  // the same canonical endpoint used by settings/notifications and (via the
  // shared notification_preferences table) the preferences page, so all three
  // UIs stay consistent.
  const [notifPrefs, setNotifPrefs] = useState<Any>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/user/preferences')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && !data.error) setNotifPrefs(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const { data: rawOrgs } = useOrganizations() as { data: Any };
  const orgs = Array.isArray(rawOrgs) ? rawOrgs : [];
  const { factors: mfaFactors, hasMfaEnabled } = useMfaFactors();
  const verifiedFactorCount = mfaFactors.filter((f) => f.status === 'verified').length;

  const [editingSection, setEditingSection] = useState<string | null>(null);

  // Profile form
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');

  // Account form
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || user?.name || '');
      setBio(profile.bio || '');
    }
  }, [profile, user?.name]);

  if (authLoading) return <LoadingStrata />;

  const handleSaveProfile = () => {
    updateProfile.mutate(
      { full_name: displayName, bio },
      { onSuccess: () => setEditingSection(null) }
    );
  };

  const handleUpdatePassword = () => {
    if (!newPassword.trim()) return;
    updatePassword.mutate(
      { password: newPassword },
      { onSuccess: () => { setNewPassword(''); setEditingSection(null); } }
    );
  };

  const handleToggleNotif = (key: string, value: boolean) => {
    // Optimistic local update, then PATCH the canonical preferences endpoint.
    setNotifPrefs((prev: Any) => ({ ...(prev || {}), [key]: value }));
    fetch('/api/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.error) setNotifPrefs(data);
      })
      .catch(() => {});
  };

  const notifSettings = notifPrefs || {};

  // ─── Per-preference notification helpers ───────────────────────────────────
  // Map of preference key → surfaceKey lets us reuse the toggle row markup
  // while routing each preference to its own CMS surface so authors can
  // explain what each notification covers.
  const notificationPreferences: { key: string; label: string; surfaceKey: string }[] = [
    {
      key: 'type_new_lead',
      label: 'New leads',
      surfaceKey: SurfaceKeys.DesignerPortal.Settings.Notifications.NewLeads,
    },
    {
      key: 'type_project_milestone',
      label: 'Project updates',
      surfaceKey: SurfaceKeys.DesignerPortal.Settings.Notifications.ProjectUpdates,
    },
    {
      key: 'type_client_message',
      label: 'Client messages',
      surfaceKey: SurfaceKeys.DesignerPortal.Settings.Notifications.ClientMessages,
    },
    {
      key: 'type_commission_earned',
      label: 'Earnings',
      surfaceKey: SurfaceKeys.DesignerPortal.Settings.Notifications.Earnings,
    },
  ];

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-2">Settings</h1>
      <SectionIntro
        surfaceKey={SurfaceKeys.DesignerPortal.Settings.Intro}
        fallback="Manage your profile, security, notifications, and studio memberships in one place."
        className="mb-6"
      />

      {/* Profile */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="type-meta">Profile</h2>
          <Button variant="ghost" size="sm" onClick={() => setEditingSection(editingSection === 'profile' ? null : 'profile')}>
            {editingSection === 'profile' ? 'Cancel' : 'Edit'}
          </Button>
        </div>
        <SectionIntro
          surfaceKey={SurfaceKeys.DesignerPortal.Settings.Profile.Section}
          fallback="Your display name and bio appear on every proposal you send. Updates take effect immediately."
          className="mb-4"
        />
        {editingSection === 'profile' ? (
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="settings-display-name">Display name</FieldLabel>
              <input
                id="settings-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="type-body w-full max-w-md border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none focus:border-[var(--accent-primary)]"
              />
              <FieldHelper
                surfaceKey={SurfaceKeys.DesignerPortal.Settings.Profile.DisplayName}
                fallback="The name clients see on proposals, project pages, and emails."
              />
            </div>
            <div>
              <FieldLabel htmlFor="settings-bio">Bio</FieldLabel>
              <textarea
                id="settings-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="type-body w-full max-w-md resize-none border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none focus:border-[var(--accent-primary)]"
                rows={3}
              />
              <FieldHelper
                surfaceKey={SurfaceKeys.DesignerPortal.Settings.Profile.Bio}
                fallback="A short intro shown to homeowners reviewing your work. Keep it under 200 characters."
              />
            </div>
            <Button variant="primary" onClick={handleSaveProfile} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        ) : (
          <div>
            <DetailRow label="Name" value={profile?.display_name || profile?.full_name || user?.name || 'Not set'} />
            <DetailRow label="Email" value={user?.email || 'Not set'} />
            {profile?.bio && <DetailRow label="Bio" value={profile.bio} />}
          </div>
        )}
      </section>

      <StrataMark variant="mini" />

      {/* Account */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="type-meta">Account</h2>
          <Button variant="ghost" size="sm" onClick={() => setEditingSection(editingSection === 'account' ? null : 'account')}>
            {editingSection === 'account' ? 'Cancel' : 'Change Password'}
          </Button>
        </div>
        <SectionIntro
          surfaceKey={SurfaceKeys.DesignerPortal.Settings.Account.Section}
          fallback="Your sign-in credentials. Password changes log you out of other devices."
          className="mb-4"
        />
        {editingSection === 'account' ? (
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="settings-new-password">New password</FieldLabel>
              <input
                id="settings-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="type-body w-full max-w-md border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]"
              />
              <FieldHelper
                surfaceKey={SurfaceKeys.DesignerPortal.Settings.Account.NewPassword}
                fallback="At least 12 characters. We recommend a passphrase you've never used before."
              />
            </div>
            <Button variant="primary" onClick={handleUpdatePassword} disabled={updatePassword.isPending || !newPassword.trim()}>
              {updatePassword.isPending ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        ) : (
          <div>
            <DetailRow label="Email" value={user?.email || '—'} />
            <DetailRow label="Password" value="••••••••" />
          </div>
        )}
      </section>

      <StrataMark variant="mini" />

      {/* Security */}
      <section>
        <h2 className="type-meta mb-2">Security</h2>
        <SectionIntro
          surfaceKey={SurfaceKeys.DesignerPortal.Settings.Security.Section}
          fallback="Two-factor authentication and assigned roles."
          className="mb-4"
        />
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-3">
          <div>
            <span className="type-label-secondary">2FA</span>
            <div className="type-label mt-0.5">
              {hasMfaEnabled
                ? `Enabled${verifiedFactorCount > 1 ? ` (${verifiedFactorCount} authenticators)` : ''}`
                : 'Not enabled'}
            </div>
          </div>
          <Link
            href="/portal/settings/security"
            className="type-btn-text text-[var(--accent-primary)] no-underline"
          >
            {hasMfaEnabled ? 'Manage' : 'Enable'}
          </Link>
        </div>
        <DetailRow label="Roles" value={user?.roles?.join(', ') || 'designer'} />
      </section>

      <StrataMark variant="mini" />

      {/* Notifications */}
      <section>
        <h2 className="type-meta mb-2">Notifications</h2>
        <SectionIntro
          surfaceKey={SurfaceKeys.DesignerPortal.Settings.Notifications.Section}
          fallback="Choose which Patina events ping your inbox. You can mute any channel without affecting others."
          className="mb-4"
        />
        <div className="space-y-3">
          {notificationPreferences.map((pref) => {
            const toggleId = `notif-${pref.key}`;
            return (
              <div key={pref.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor={toggleId} className="type-body-small normal-case tracking-normal">
                    {pref.label}
                  </FieldLabel>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      id={toggleId}
                      type="checkbox"
                      checked={notifSettings[pref.key] !== false}
                      onChange={(e) => handleToggleNotif(pref.key, e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="h-5 w-9 rounded-full bg-patina-pearl after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-patina-clay peer-checked:after:translate-x-full" />
                  </label>
                </div>
                <FieldHelper
                  surfaceKey={pref.surfaceKey}
                  className="text-[0.75rem] text-[var(--text-muted)]"
                />
              </div>
            );
          })}
        </div>
      </section>

      <StrataMark variant="mini" />

      {/* Organization */}
      <section>
        <h2 className="type-meta mb-2">Organization</h2>
        <SectionIntro
          surfaceKey={SurfaceKeys.DesignerPortal.Settings.Organization.Section}
          fallback="Your studio memberships and the role assigned to you in each."
          className="mb-4"
        />
        {orgs.length > 0 ? (
          orgs.map((org: Any) => (
            <div key={org.id} className="border-b border-[var(--border-subtle)] py-3">
              <span className="type-label">{org.name}</span>
              <div className="type-label-secondary mt-1">{org.role || 'Member'}</div>
            </div>
          ))
        ) : (
          <p className="type-body-small text-[var(--text-muted)]">No organization membership.</p>
        )}
      </section>
    </div>
  );
}

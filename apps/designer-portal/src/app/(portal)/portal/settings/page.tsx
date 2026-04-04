'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useProfile, useUpdateProfile, useUpdatePassword, useNotificationPreferences, useUpdateNotificationPreferences, useOrganizations, useOrganizationMembers } from '@patina/supabase';
import { StrataMark } from '@/components/portal/strata-mark';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: profile } = useProfile() as { data: Any };
  const updateProfile = useUpdateProfile();
  const updatePassword = useUpdatePassword();
  const { data: notifPrefs } = useNotificationPreferences() as { data: Any };
  const updateNotifPrefs = useUpdateNotificationPreferences();
  const { data: rawOrgs } = useOrganizations() as { data: Any };
  const orgs = Array.isArray(rawOrgs) ? rawOrgs : [];

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
      { display_name: displayName, bio },
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
    updateNotifPrefs.mutate({ [key]: value });
  };

  const notifSettings = notifPrefs || {};

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-6">Settings</h1>

      {/* Profile */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="type-meta">Profile</h2>
          <button className="type-btn-text cursor-pointer border-0 bg-transparent text-[var(--accent-primary)]" onClick={() => setEditingSection(editingSection === 'profile' ? null : 'profile')}>
            {editingSection === 'profile' ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editingSection === 'profile' ? (
          <div className="space-y-4">
            <div>
              <label className="type-meta mb-1 block">Display Name</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="type-body w-full max-w-md border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none focus:border-[var(--accent-primary)]" />
            </div>
            <div>
              <label className="type-meta mb-1 block">Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="type-body w-full max-w-md resize-none border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none focus:border-[var(--accent-primary)]" rows={3} />
            </div>
            <PortalButton variant="primary" onClick={handleSaveProfile} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
            </PortalButton>
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
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="type-meta">Account</h2>
          <button className="type-btn-text cursor-pointer border-0 bg-transparent text-[var(--accent-primary)]" onClick={() => setEditingSection(editingSection === 'account' ? null : 'account')}>
            {editingSection === 'account' ? 'Cancel' : 'Change Password'}
          </button>
        </div>
        {editingSection === 'account' ? (
          <div className="space-y-4">
            <div>
              <label className="type-meta mb-1 block">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" className="type-body w-full max-w-md border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" />
            </div>
            <PortalButton variant="primary" onClick={handleUpdatePassword} disabled={updatePassword.isPending || !newPassword.trim()}>
              {updatePassword.isPending ? 'Updating...' : 'Update Password'}
            </PortalButton>
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
        <h2 className="type-meta mb-4">Security</h2>
        <DetailRow label="2FA" value="Not enabled" />
        <DetailRow label="Roles" value={user?.roles?.join(', ') || 'designer'} />
      </section>

      <StrataMark variant="mini" />

      {/* Notifications */}
      <section>
        <h2 className="type-meta mb-4">Notifications</h2>
        <div className="space-y-3">
          {[
            { key: 'new_leads', label: 'New leads' },
            { key: 'project_updates', label: 'Project updates' },
            { key: 'client_messages', label: 'Client messages' },
            { key: 'earnings', label: 'Earnings' },
          ].map((pref) => (
            <div key={pref.key} className="flex items-center justify-between">
              <span className="type-body-small">{pref.label}</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={notifSettings[pref.key] !== false}
                  onChange={(e) => handleToggleNotif(pref.key, e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full bg-patina-pearl after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-patina-clay peer-checked:after:translate-x-full" />
              </label>
            </div>
          ))}
        </div>
      </section>

      <StrataMark variant="mini" />

      {/* Organization */}
      <section>
        <h2 className="type-meta mb-4">Organization</h2>
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

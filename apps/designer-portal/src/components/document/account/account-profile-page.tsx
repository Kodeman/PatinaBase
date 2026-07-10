'use client';

/**
 * Account · Profile (R5 settings re-skinned into the document language).
 * The same data layer as the old /portal/settings Profile + Account sections
 * (useProfile / useUpdateProfile / useUploadAvatar / useUpdatePassword) — only
 * the presentation moves to charcoal/paper. Display name and bio appear on
 * every proposal; the password is the sign-in credential.
 */

import { useEffect, useRef, useState } from 'react';
import {
  useProfile,
  useUpdateProfile,
  useUploadAvatar,
  useUpdatePassword,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { StrataMark } from '../strata-mark';
import { monogramOf } from '@/lib/document/account-identity';

const FIELD =
  'w-full max-w-md border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[14px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]';
const LABEL =
  'mb-1 block font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const HELP = 'mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]';
const PRIMARY =
  'rounded-[5px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-charcoal)] transition-colors hover:bg-[var(--color-aged-oak)] hover:border-[var(--color-aged-oak)] disabled:opacity-50';

export function AccountProfilePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const updatePassword = useUpdatePassword();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwDone, setPwDone] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || user?.name || '');
      setBio(profile.bio || '');
    }
  }, [profile, user?.name]);

  const handleSaveProfile = () => {
    // `full_name` is the column the old settings form writes; display name reads
    // it back via the useAuth merge, so we keep the same write to avoid drift.
    updateProfile.mutate({ full_name: displayName, bio });
  };

  const handleUpdatePassword = () => {
    if (!newPassword.trim()) return;
    setPwDone(false);
    updatePassword.mutate(
      { password: newPassword },
      {
        onSuccess: () => {
          setNewPassword('');
          setPwDone(true);
        },
      },
    );
  };

  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <div className="pt-1">
      {/* Avatar */}
      <div className="mb-6 flex items-center gap-4">
        <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-pearl)] font-mono text-[15px] uppercase tracking-wider text-[var(--color-mocha)]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            monogramOf(displayName, user?.email ?? '')
          )}
        </span>
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadAvatar.isPending}
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-clay)] hover:text-[var(--color-charcoal)] disabled:opacity-50"
          >
            {uploadAvatar.isPending ? 'Uploading…' : 'Change photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadAvatar.mutate(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor="account-display-name" className={LABEL}>
            Display name
          </label>
          <input
            id="account-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={FIELD}
          />
          <p className={HELP}>The name clients see on proposals, project pages, and emails.</p>
        </div>

        <div>
          <label htmlFor="account-bio" className={LABEL}>
            Bio
          </label>
          <textarea
            id="account-bio"
            value={bio}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            className={`${FIELD} resize-none`}
          />
          <p className={HELP}>A short intro shown to homeowners reviewing your work.</p>
        </div>

        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={updateProfile.isPending}
          className={PRIMARY}
        >
          {updateProfile.isPending ? 'Saving…' : 'Save profile'}
        </button>
      </div>

      <div className="my-6">
        <StrataMark size="sm" />
      </div>

      {/* Password */}
      <div>
        <h3 className="mb-1 font-heading text-[15px] text-[var(--color-charcoal)]">Password</h3>
        <p className="mb-3 text-[11.5px] text-[var(--color-aged-oak)]">
          Your sign-in credential. Changing it signs you out of other devices.
        </p>
        <label htmlFor="account-new-password" className={LABEL}>
          New password
        </label>
        <input
          id="account-new-password"
          type="password"
          value={newPassword}
          placeholder="Enter a new password"
          onChange={(e) => {
            setNewPassword(e.target.value);
            setPwDone(false);
          }}
          className={FIELD}
        />
        <p className={HELP}>At least 12 characters — a passphrase you&apos;ve never used works well.</p>
        <button
          type="button"
          onClick={handleUpdatePassword}
          disabled={updatePassword.isPending || !newPassword.trim()}
          className={`${PRIMARY} mt-3`}
        >
          {updatePassword.isPending ? 'Updating…' : 'Update password'}
        </button>
        {pwDone && (
          <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-sage)]">
            ✓ Saved
          </span>
        )}
      </div>
    </div>
  );
}

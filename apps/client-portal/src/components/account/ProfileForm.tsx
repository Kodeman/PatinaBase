'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useUpdateProfile, useSignOutAllDevices } from '@patina/supabase';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';

import type { ClientProfile } from '@/lib/data/profile';

type Props = {
  initialProfile: ClientProfile;
};

export function ProfileForm({ initialProfile }: Props) {
  const router = useRouter();
  const updateProfile = useUpdateProfile();
  const signOutAll = useSignOutAllDevices();

  const [fullName, setFullName] = useState(initialProfile.full_name ?? '');
  const [phone, setPhone] = useState(initialProfile.phone ?? '');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dirty =
    (fullName.trim() || null) !== (initialProfile.full_name ?? null) ||
    (phone.trim() || null) !== (initialProfile.phone ?? null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateProfile.mutateAsync({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      });
      setSavedAt(new Date());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    }
  }

  async function onConfirmSignOutAll() {
    setError(null);
    try {
      await signOutAll.mutateAsync();
      router.push('/auth/signin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed');
      setConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-lg shadow-sm p-6 border border-[#EEE6DB] space-y-5"
      >
        <Field label="Full name" htmlFor="full_name">
          <input
            id="full_name"
            data-testid="account-full-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2 border border-[#DDD4C8] rounded-md bg-white text-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#A3927C]"
            autoComplete="name"
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            value={initialProfile.email}
            disabled
            aria-readonly="true"
            className="w-full px-3 py-2 border border-[#DDD4C8] rounded-md bg-[#F5F1ED] text-[#7A736C] cursor-not-allowed"
          />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <input
            id="phone"
            data-testid="account-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-5555"
            className="w-full px-3 py-2 border border-[#DDD4C8] rounded-md bg-white text-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#A3927C]"
            autoComplete="tel"
          />
        </Field>

        <SaveStatus saving={updateProfile.isPending} savedAt={savedAt} error={error} />

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={!dirty || updateProfile.isPending}
            data-testid="account-save"
          >
            {updateProfile.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <section className="bg-white rounded-lg shadow-sm p-6 border border-[#EEE6DB]">
        <h2 className="font-serif text-lg font-semibold text-[#2C2926] mb-1">Sessions</h2>
        <p className="text-sm text-[#7A736C] mb-4">
          End every active session on every device. You&rsquo;ll need to sign in again afterwards.
        </p>
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          data-testid="account-signout-everywhere"
        >
          Sign out everywhere
        </Button>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out everywhere?</DialogTitle>
            <DialogDescription>
              This ends every active session on every device, including this one. You&rsquo;ll be
              redirected to sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={signOutAll.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmSignOutAll}
              disabled={signOutAll.isPending}
              data-testid="account-signout-confirm"
            >
              {signOutAll.isPending ? 'Signing out…' : 'Yes, sign out everywhere'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="block text-sm font-medium text-[#2C2926] mb-2">{label}</span>
      {children}
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
    if (saving) return { text: 'Saving…', color: 'text-[#7A736C]' };
    if (savedAt) {
      return {
        text: `Saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
        color: 'text-[#7A736C]',
      };
    }
    return null;
  }, [error, saving, savedAt]);

  if (!status) return null;
  return (
    <div className={`text-sm ${status.color}`} role="status" aria-live="polite">
      {status.text}
    </div>
  );
}

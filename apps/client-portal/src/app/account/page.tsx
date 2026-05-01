import { redirect } from 'next/navigation';

import { fetchClientProfile } from '@/lib/data/profile';
import { ProfileForm } from '@/components/account/ProfileForm';

export const metadata = {
  title: 'Account · Patina',
};

export default async function AccountPage() {
  const profile = await fetchClientProfile();
  if (!profile) {
    redirect('/auth/signin?callbackUrl=/account');
  }

  return (
    <main className="min-h-screen bg-[#F5F1ED] py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-semibold text-[#2C2926] mb-2">Account</h1>
          <p className="text-[#4A453F] text-[15px]">Manage your profile and active sessions.</p>
        </header>
        <ProfileForm initialProfile={profile} />
      </div>
    </main>
  );
}

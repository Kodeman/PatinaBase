'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFindOrCreateVendor } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { PortalButton } from '@/components/portal/button';

export default function NewVendorPage() {
  const router = useRouter();
  const findOrCreate = useFindOrCreateVendor();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    findOrCreate.mutate(
      { name: name.trim(), website: '', category: category.trim(), email: email.trim() },
      { onSuccess: () => router.push('/portal/vendors') }
    );
  };

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/vendors" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Vendors</Link>
        <span className="mx-2">&rarr;</span><span>Add Vendor</span>
      </div>
      <h1 className="type-page-title mb-8">Add Custom Vendor</h1>
      <div className="max-w-2xl space-y-8">
        <FieldGroup label="Trade Name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor trade name" className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" />
        </FieldGroup>
        <FieldGroup label="Category">
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g., Upholstery, Lighting" className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" />
        </FieldGroup>
        <FieldGroup label="Contact Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendor@example.com" className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]" />
        </FieldGroup>
        <div className="flex gap-4 pt-4">
          <PortalButton variant="primary" onClick={handleSubmit} disabled={findOrCreate.isPending || !name.trim()}>
            {findOrCreate.isPending ? 'Adding...' : 'Add Vendor'}
          </PortalButton>
          <PortalButton variant="ghost" onClick={() => router.push('/portal/vendors')}>Cancel</PortalButton>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFindOrCreateVendor } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { Button } from '@/components/ui/controls';

export default function NewVendorPage() {
  const router = useRouter();
  const findOrCreate = useFindOrCreateVendor();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    findOrCreate.mutate(
      { name: name.trim(), website: '', primaryCategory: category.trim() },
      { onSuccess: () => router.push('/portal/vendors') }
    );
  };

  return (
    <div className="pt-8">
      {/* Breadcrumb ("Products › Vendors › New") is rendered globally by SubNav. */}
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
          <Button variant="primary" onClick={handleSubmit} disabled={findOrCreate.isPending || !name.trim()}>
            {findOrCreate.isPending ? 'Adding...' : 'Add Vendor'}
          </Button>
          <Button variant="ghost" onClick={() => router.push('/portal/vendors')}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

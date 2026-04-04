'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateCollection } from '@/hooks/use-collections';
import { FieldGroup } from '@/components/portal/field-group';
import { PortalButton } from '@/components/portal/button';

export default function NewCollectionPage() {
  const router = useRouter();
  const createCollection = useCreateCollection();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [collectionType, setCollectionType] = useState<'manual' | 'rule'>('manual');

  const handleCreate = () => {
    if (!name.trim()) return;
    createCollection.mutate(
      { name: name.trim(), description: description.trim(), type: collectionType, status: 'draft' },
      { onSuccess: () => router.push('/portal/catalog/collections') }
    );
  };

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/catalog/collections" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Collections</Link>
        <span className="mx-2">&rarr;</span><span>New Collection</span>
      </div>
      <h1 className="type-page-title mb-8">Create Collection</h1>
      <div className="max-w-2xl space-y-8">
        <FieldGroup label="Collection Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter collection name"
            className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]"
          />
        </FieldGroup>
        <FieldGroup label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe this collection"
            rows={3}
            className="type-body w-full resize-none border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-primary)]"
          />
        </FieldGroup>
        <FieldGroup label="Collection Type">
          <select
            value={collectionType}
            onChange={(e) => setCollectionType(e.target.value as 'manual' | 'rule')}
            className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none focus:border-[var(--accent-primary)]"
          >
            <option value="manual">Manual</option>
            <option value="rule">Rule-based</option>
          </select>
        </FieldGroup>
        <div className="flex gap-4 pt-4">
          <PortalButton variant="primary" onClick={handleCreate} disabled={createCollection.isPending || !name.trim()}>
            {createCollection.isPending ? 'Creating...' : 'Create Collection'}
          </PortalButton>
          <PortalButton variant="ghost" onClick={() => router.push('/portal/catalog/collections')}>
            Cancel
          </PortalButton>
        </div>
      </div>
    </div>
  );
}

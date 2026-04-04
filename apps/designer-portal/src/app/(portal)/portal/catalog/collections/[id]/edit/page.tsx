'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCollection, useUpdateCollection } from '@/hooks/use-collections';
import { FieldGroup } from '@/components/portal/field-group';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

export default function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: rawCollection, isLoading } = useCollection(id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collection = (rawCollection as any)?.data ?? rawCollection;
  const updateCollection = useUpdateCollection();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (collection) {
      setName(collection.name || collection.title || '');
      setDescription(collection.description || '');
    }
  }, [collection]);

  if (isLoading) return <LoadingStrata />;
  if (!collection) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Collection not found.</p>;

  const handleSave = () => {
    if (!name.trim()) return;
    updateCollection.mutate(
      { id, data: { name: name.trim(), description: description.trim() } },
      { onSuccess: () => router.push(`/portal/catalog/collections/${id}`) }
    );
  };

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/catalog/collections" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Collections</Link>
        <span className="mx-2">&rarr;</span>
        <Link href={`/portal/catalog/collections/${id}`} className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">{collection.name || 'Collection'}</Link>
        <span className="mx-2">&rarr;</span><span>Edit</span>
      </div>
      <h1 className="type-page-title mb-8">Edit Collection</h1>
      <div className="max-w-2xl space-y-8">
        <FieldGroup label="Collection Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="type-body w-full border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none focus:border-[var(--accent-primary)]"
          />
        </FieldGroup>
        <FieldGroup label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="type-body w-full resize-none border-0 border-b border-[var(--border-default)] bg-transparent py-2 outline-none focus:border-[var(--accent-primary)]"
          />
        </FieldGroup>
        <div className="flex gap-4 pt-4">
          <PortalButton variant="primary" onClick={handleSave} disabled={updateCollection.isPending || !name.trim()}>
            {updateCollection.isPending ? 'Saving...' : 'Save Changes'}
          </PortalButton>
          <PortalButton variant="ghost" onClick={() => router.push(`/portal/catalog/collections/${id}`)}>
            Cancel
          </PortalButton>
        </div>
      </div>
    </div>
  );
}

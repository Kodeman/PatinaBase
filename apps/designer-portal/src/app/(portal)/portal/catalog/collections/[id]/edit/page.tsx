'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCollection, useUpdateCollection } from '@/hooks/use-collections';
import { FieldGroup } from '@/components/portal/field-group';
import { Button } from '@/components/ui/controls';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';

export default function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
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

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
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
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/portal/catalog/collections/${id}`}>← {collection.name || 'Collection'}</Link>
        </Button>
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
          <Button variant="primary" onClick={handleSave} disabled={updateCollection.isPending || !name.trim()}>
            {updateCollection.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/portal/catalog/collections/${id}`)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@patina/design-system';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
}

interface CategoryFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  categories?: Category[];
  onSave: (data: Partial<Category>) => void;
}

export function CategoryFormModal({
  open,
  onOpenChange,
  category,
  categories = [],
  onSave,
}: CategoryFormModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');

  const isEdit = !!category;

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description || '');
      setParentId(category.parentId || '');
    } else {
      setName('');
      setDescription('');
      setParentId('');
    }
  }, [category, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...(category && { id: category.id }),
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      description: description || undefined,
      parentId: parentId || undefined,
    });
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">
          {isEdit ? 'Edit Category' : 'New Category'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              rows={3}
            />
          </div>
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Parent Category</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              >
                <option value="">None (top-level)</option>
                {categories
                  .filter((c) => c.id !== category?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {isEdit ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FolderTree, ChevronRight, Edit, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { createBrowserClient } from '@patina/supabase';
import { CategoryFormModal } from '@/components/categories/category-form-modal';

// Admin view category type with product count
interface CategoryView {
  id: string;
  name: string;
  slug: string;
  description?: string;
  productCount: number;
  parentId?: string;
  children?: CategoryView[];
}


interface CategoryItemProps {
  category: CategoryView;
  level?: number;
  onEdit: (category: CategoryView) => void;
  onDelete: (category: CategoryView) => void;
}

function CategoryItem({ category, level = 0, onEdit, onDelete }: CategoryItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = category.children && category.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent transition-colors"
        style={{ marginLeft: `${level * 24}px` }}
      >
        {hasChildren && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 hover:bg-muted rounded p-1"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          </button>
        )}
        {!hasChildren && <div className="w-6" />}

        <FolderTree className="h-5 w-5 text-muted-foreground flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{category.name}</span>
            <Badge variant="secondary" className="text-xs">
              {category.productCount}
            </Badge>
          </div>
          {category.description && (
            <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
          )}
        </div>

        <div className="flex gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            title="Edit category"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(category);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete category"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(category);
            }}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2">
          {category.children?.map((child) => (
            <CategoryItem
              key={child.id}
              category={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryView | undefined>();
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryView | null>(null);

  const queryClient = useQueryClient();

  // Fetch categories directly from Supabase
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      // Map snake_case DB rows to CategoryView and build tree
      const flat: CategoryView[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        name: (row.name as string) || '',
        slug: (row.slug as string) || '',
        description: (row.description as string) || undefined,
        productCount: (row.product_count as number) || 0,
        parentId: (row.parent_id as string) || undefined,
        imageUrl: (row.image_url as string) || undefined,
        sortOrder: (row.sort_order as number) || 0,
        isActive: row.is_active !== false,
        children: [],
      }));

      // Build tree: attach children to parents
      const map = new Map(flat.map((c) => [c.id, c]));
      const tree: CategoryView[] = [];
      for (const cat of flat) {
        if (cat.parentId && map.has(cat.parentId)) {
          map.get(cat.parentId)!.children!.push(cat);
        } else {
          tree.push(cat);
        }
      }
      return tree;
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<CategoryView> & { id?: string }) => {
      const supabase = createBrowserClient();
      const row = {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.parentId !== undefined && { parent_id: data.parentId || null }),
        ...((data as any).order !== undefined && { sort_order: (data as any).order }),
        ...((data as any).isActive !== undefined && { is_active: (data as any).isActive }),
        ...((data as any).image !== undefined && { image_url: (data as any).image }),
      };

      if (data.id) {
        const { error } = await supabase
          .from('categories')
          .update(row)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({ name: data.name!, slug: data.slug!, ...row });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: selectedCategory ? 'Category updated' : 'Category created',
        description: `The category has been successfully ${selectedCategory ? 'updated' : 'created'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsFormOpen(false);
      setSelectedCategory(undefined);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save the category. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const supabase = createBrowserClient();
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Category deleted',
        description: 'The category has been successfully deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setCategoryToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete the category. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleAddCategory = () => {
    setSelectedCategory(undefined);
    setIsFormOpen(true);
  };

  const handleEditCategory = (category: CategoryView) => {
    setSelectedCategory(category);
    setIsFormOpen(true);
  };

  const handleDeleteCategory = (category: CategoryView) => {
    setCategoryToDelete(category);
  };

  const handleSaveCategory = async (data: Partial<CategoryView>) => {
    await saveMutation.mutateAsync(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
          <p className="text-muted-foreground">
            Manage product categories and taxonomy
          </p>
        </div>
        <Button onClick={handleAddCategory}>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>

      {/* Category Tree */}
      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading categories...
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <FolderTree className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No categories found</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first category
              </p>
              <Button onClick={handleAddCategory}>
                <Plus className="mr-2 h-4 w-4" />
                Add Category
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => (
                <CategoryItem
                  key={category.id}
                  category={category as CategoryView}
                  onEdit={handleEditCategory}
                  onDelete={handleDeleteCategory}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Card */}
      <Card>
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Total Categories</p>
              <p className="text-2xl font-bold">{categories.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Products</p>
              <p className="text-2xl font-bold">
                {categories.reduce((acc, cat) => acc + (cat.productCount || 0), 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Nested Categories</p>
              <p className="text-2xl font-bold">
                {categories.reduce((acc, cat) => acc + (cat.children?.length || 0), 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Form Modal */}
      <CategoryFormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        category={selectedCategory as any}
        categories={categories as any}
        onSave={handleSaveCategory as any}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{categoryToDelete?.name}"?
              {categoryToDelete?.children && categoryToDelete.children.length > 0 && (
                <span className="block mt-2 font-semibold text-destructive">
                  Warning: This category has {categoryToDelete.children.length} subcategories.
                </span>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => categoryToDelete && deleteMutation.mutate(categoryToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

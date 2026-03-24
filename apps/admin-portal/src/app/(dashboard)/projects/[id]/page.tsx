'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useProjectProducts,
  useAddProductToProject,
  useRemoveProductFromProject,
  useUpdateProjectProductNotes,
  createBrowserClient,
} from '@patina/supabase';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Package,
  Settings,
  Trash2,
  Plus,
  Search,
  X,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  FileEdit,
  Flag,
  Activity,
  FolderOpen,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Project {
  id: string;
  name: string;
  notes?: string | null;
  status: string;
  budget_min?: number | null;
  budget_max?: number | null;
  timeline_start?: string | null;
  timeline_end?: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  client_profile_id?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  archived: { label: 'Archived', variant: 'outline' },
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT HEADER
// ═══════════════════════════════════════════════════════════════════════════

function ProjectHeader({
  project,
  onEdit,
  onDelete,
}: {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const status = statusConfig[project.status] || statusConfig.active;

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/projects')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Projects
      </Button>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight truncate">
              {project.name}
            </h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          {project.notes && (
            <p className="text-muted-foreground">{project.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Settings className="mr-2 h-4 w-4" />
            Edit Project
          </Button>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(project.budget_min || project.budget_max) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Budget</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {project.budget_min && project.budget_max
                  ? `${formatCurrency(project.budget_min)} – ${formatCurrency(project.budget_max)}`
                  : project.budget_min
                    ? formatCurrency(project.budget_min)
                    : formatCurrency(project.budget_max!)}
              </div>
              <p className="text-xs text-muted-foreground">
                {project.budget_min && project.budget_max ? 'Budget range' : 'Estimated budget'}
              </p>
            </CardContent>
          </Card>
        )}

        {(project.timeline_start || project.timeline_end) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-bold">
                {project.timeline_start ? formatDate(project.timeline_start) : 'TBD'}
              </div>
              <p className="text-xs text-muted-foreground">
                {project.timeline_end ? `Due ${formatDate(project.timeline_end)}` : 'No end date'}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">{formatDate(project.created_at)}</div>
            <p className="text-xs text-muted-foreground">
              Last updated {formatDate(project.updated_at)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS TAB
// ═══════════════════════════════════════════════════════════════════════════

function ProductsTab({ projectId }: { projectId: string }) {
  const { data: projectProducts, isLoading } = useProjectProducts(projectId);
  const removeProduct = useRemoveProductFromProject();
  const [showPicker, setShowPicker] = useState(false);
  const [editingNotes, setEditingNotes] = useState<{ id: string; notes: string } | null>(null);
  const updateNotes = useUpdateProjectProductNotes();

  const handleRemove = (productId: string) => {
    removeProduct.mutate(
      { projectId, productId },
      {
        onSuccess: () => toast.success('Product removed from project'),
        onError: () => toast.error('Failed to remove product'),
      }
    );
  };

  const handleSaveNotes = () => {
    if (!editingNotes) return;
    updateNotes.mutate(
      { projectProductId: editingNotes.id, notes: editingNotes.notes || null },
      {
        onSuccess: () => {
          toast.success('Notes updated');
          setEditingNotes(null);
        },
        onError: () => toast.error('Failed to update notes'),
      }
    );
  };

  const totalRetail = (projectProducts as any[])?.reduce((sum: number, pp: any) => {
    return sum + (pp.product?.price_retail || 0);
  }, 0) || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Project Products</h3>
          <p className="text-sm text-muted-foreground">
            {(projectProducts as any[])?.length || 0} products
            {totalRetail > 0 && ` · ${formatCurrency(totalRetail)} total retail`}
          </p>
        </div>
        <Button onClick={() => setShowPicker(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Product
        </Button>
      </div>

      {projectProducts && (projectProducts as any[]).length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(projectProducts as any[]).map((pp: any) => {
            const product = pp.product;
            if (!product) return null;
            const image = product.images?.[0];

            return (
              <Card key={pp.id} className="overflow-hidden">
                {image && (
                  <div className="aspect-video bg-muted relative">
                    <img
                      src={image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h4 className="font-semibold truncate">{product.name}</h4>
                    {product.vendor && (
                      <p className="text-sm text-muted-foreground">{product.vendor.name}</p>
                    )}
                  </div>

                  <div className="flex gap-4 text-sm">
                    {product.price_retail != null && (
                      <div>
                        <span className="text-muted-foreground">Retail: </span>
                        <span className="font-medium">{formatCurrency(product.price_retail)}</span>
                      </div>
                    )}
                    {product.price_trade != null && (
                      <div>
                        <span className="text-muted-foreground">Trade: </span>
                        <span className="font-medium">{formatCurrency(product.price_trade)}</span>
                      </div>
                    )}
                  </div>

                  {pp.notes && (
                    <p className="text-sm text-muted-foreground border-t pt-2">{pp.notes}</p>
                  )}

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingNotes({ id: pp.id, notes: pp.notes || '' })}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Notes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemove(product.id)}
                      disabled={removeProduct.isPending}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No products yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add products to this project to track furnishings
            </p>
            <Button onClick={() => setShowPicker(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </CardContent>
        </Card>
      )}

      <ProductPickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        projectId={projectId}
        existingProductIds={(projectProducts as any[])?.map((pp: any) => pp.product?.id).filter(Boolean) || []}
      />

      {/* Edit Notes Dialog */}
      <Dialog open={!!editingNotes} onOpenChange={(open) => !open && setEditingNotes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product Notes</DialogTitle>
            <DialogDescription>Add notes about this product in the project context.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={editingNotes?.notes || ''}
            onChange={(e) => setEditingNotes(prev => prev ? { ...prev, notes: e.target.value } : null)}
            placeholder="Add notes about this product..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNotes(null)}>Cancel</Button>
            <Button onClick={handleSaveNotes} disabled={updateNotes.isPending}>
              Save Notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT PICKER DIALOG
// ═══════════════════════════════════════════════════════════════════════════

function ProductPickerDialog({
  open,
  onOpenChange,
  projectId,
  existingProductIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  existingProductIds: string[];
}) {
  const [search, setSearch] = useState('');
  const addProduct = useAddProductToProject();

  const { data: products, isLoading } = useQuery({
    queryKey: ['product-picker', search],
    queryFn: async () => {
      const supabase = createBrowserClient();
      let query = supabase
        .from('products')
        .select('id, name, images, price_retail, vendor:vendors!products_vendor_id_fkey(id, name)')
        .eq('status', 'published')
        .order('name')
        .limit(20);

      if (search) {
        query = query.ilike('name', `%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const handleAdd = (productId: string) => {
    addProduct.mutate(
      { projectId, productId },
      {
        onSuccess: () => toast.success('Product added to project'),
        onError: () => toast.error('Failed to add product'),
      }
    );
  };

  const availableProducts = products?.filter(
    (p: any) => !existingProductIds.includes(p.id)
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Product to Project</DialogTitle>
          <DialogDescription>Search and add products from the catalog.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : availableProducts.length > 0 ? (
            availableProducts.map((product: any) => {
              const image = product.images?.[0];
              return (
                <div
                  key={product.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50"
                >
                  {image ? (
                    <img src={image} alt="" className="w-12 h-12 object-cover rounded" />
                  ) : (
                    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    {product.vendor && (
                      <p className="text-xs text-muted-foreground">{product.vendor.name}</p>
                    )}
                    {product.price_retail != null && (
                      <p className="text-xs text-muted-foreground">{formatCurrency(product.price_retail)}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAdd(product.id)}
                    disabled={addProduct.isPending}
                  >
                    Add
                  </Button>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? 'No matching products found' : 'No products available'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE PLACEHOLDER TAB
// ═══════════════════════════════════════════════════════════════════════════

function ServicePlaceholderTab({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Icon className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT PROJECT DIALOG
// ═══════════════════════════════════════════════════════════════════════════

function EditProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}) {
  const updateProject = useUpdateProject();
  const [form, setForm] = useState({
    name: project.name,
    notes: project.notes || '',
    status: project.status,
    budget_min: project.budget_min ? String(project.budget_min / 100) : '',
    budget_max: project.budget_max ? String(project.budget_max / 100) : '',
    timeline_start: project.timeline_start || '',
    timeline_end: project.timeline_end || '',
  });

  const handleSave = () => {
    updateProject.mutate(
      {
        projectId: project.id,
        data: {
          name: form.name,
          notes: form.notes || null,
          status: form.status,
          budget_min: form.budget_min ? Math.round(Number(form.budget_min) * 100) : null,
          budget_max: form.budget_max ? Math.round(Number(form.budget_max) * 100) : null,
          timeline_start: form.timeline_start || null,
          timeline_end: form.timeline_end || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Project updated');
          onOpenChange(false);
        },
        onError: () => toast.error('Failed to update project'),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update project details and settings.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm(prev => ({ ...prev, status: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="budget_min">Budget Min ($)</Label>
              <Input
                id="budget_min"
                type="number"
                value={form.budget_min}
                onChange={(e) => setForm(prev => ({ ...prev, budget_min: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget_max">Budget Max ($)</Label>
              <Input
                id="budget_max"
                type="number"
                value={form.budget_max}
                onChange={(e) => setForm(prev => ({ ...prev, budget_max: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeline_start">Start Date</Label>
              <Input
                id="timeline_start"
                type="date"
                value={form.timeline_start}
                onChange={(e) => setForm(prev => ({ ...prev, timeline_start: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeline_end">End Date</Label>
              <Input
                id="timeline_end"
                type="date"
                value={form.timeline_end}
                onChange={(e) => setForm(prev => ({ ...prev, timeline_end: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateProject.isPending || !form.name.trim()}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE CONFIRMATION DIALOG
// ═══════════════════════════════════════════════════════════════════════════

function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}) {
  const router = useRouter();
  const deleteProject = useDeleteProject();

  const handleDelete = () => {
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        toast.success('Project deleted');
        router.push('/projects');
      },
      onError: () => toast.error('Failed to delete project'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Project</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{project.name}&quot;? This action cannot be undone.
            All associated products will be unlinked.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteProject.isPending}>
            Delete Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const { data: project, isLoading } = useProject(projectId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!project) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Project not found</h3>
          <p className="text-sm text-muted-foreground">
            The project you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
        </CardContent>
      </Card>
    );
  }

  const typedProject = project as unknown as Project;

  return (
    <div className="space-y-6">
      <ProjectHeader
        project={typedProject}
        onEdit={() => setShowEdit(true)}
        onDelete={() => setShowDelete(true)}
      />

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="rfis">RFIs</TabsTrigger>
          <TabsTrigger value="change-orders">Change Orders</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductsTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="tasks">
          <ServicePlaceholderTab
            icon={CheckCircle2}
            title="Task Management"
            description="Task management requires the Projects service to be connected. Tasks can be created and managed once the service is running."
          />
        </TabsContent>

        <TabsContent value="rfis">
          <ServicePlaceholderTab
            icon={MessageSquare}
            title="Requests for Information"
            description="RFI tracking requires the Projects service to be connected. Create and respond to clarification requests once the service is running."
          />
        </TabsContent>

        <TabsContent value="change-orders">
          <ServicePlaceholderTab
            icon={FileEdit}
            title="Change Orders"
            description="Change order management requires the Projects service to be connected. Track scope and budget changes once the service is running."
          />
        </TabsContent>

        <TabsContent value="milestones">
          <ServicePlaceholderTab
            icon={Flag}
            title="Milestones"
            description="Milestone tracking requires the Projects service to be connected. Set and monitor project deliverables once the service is running."
          />
        </TabsContent>

        <TabsContent value="activity">
          <ServicePlaceholderTab
            icon={Activity}
            title="Activity Feed"
            description="Activity tracking requires the Projects service to be connected. View project history and updates once the service is running."
          />
        </TabsContent>

        <TabsContent value="messages">
          <ServicePlaceholderTab
            icon={MessageSquare}
            title="Project Messages"
            description="Messaging requires the Communications service to be connected. Collaborate with clients and designers once the service is running."
          />
        </TabsContent>
      </Tabs>

      {showEdit && (
        <EditProjectDialog
          open={showEdit}
          onOpenChange={setShowEdit}
          project={typedProject}
        />
      )}

      {showDelete && (
        <DeleteProjectDialog
          open={showDelete}
          onOpenChange={setShowDelete}
          project={typedProject}
        />
      )}
    </div>
  );
}

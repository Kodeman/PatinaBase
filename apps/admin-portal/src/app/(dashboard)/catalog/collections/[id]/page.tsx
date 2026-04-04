'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Trash2, Eye, Zap, Plus, X, GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useAdminCollection,
  useUpdateAdminCollection,
  useDeleteAdminCollection,
  usePublishAdminCollection,
  useEvaluateAdminCollection,
} from '@/hooks/use-admin-collections';
import Link from 'next/link';

const RULE_FIELDS = [
  { value: 'category', label: 'Category' },
  { value: 'brand', label: 'Brand' },
  { value: 'price', label: 'Price' },
  { value: 'material', label: 'Material' },
  { value: 'color', label: 'Color' },
  { value: 'tags', label: 'Tags' },
  { value: 'status', label: 'Status' },
  { value: 'finish', label: 'Finish' },
];

const RULE_OPERATORS: Record<string, { value: string; label: string }[]> = {
  category: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'in', label: 'In' },
    { value: 'contains', label: 'Contains' },
  ],
  brand: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'in', label: 'In' },
    { value: 'contains', label: 'Contains' },
  ],
  price: [
    { value: 'equals', label: 'Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'between', label: 'Between' },
  ],
  material: [
    { value: 'equals', label: 'Contains' },
    { value: 'in', label: 'Any Of' },
  ],
  color: [
    { value: 'equals', label: 'Contains' },
    { value: 'in', label: 'Any Of' },
  ],
  tags: [
    { value: 'contains', label: 'Contains' },
    { value: 'in', label: 'Any Of' },
  ],
  status: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'in', label: 'In' },
  ],
  finish: [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
  ],
};

interface RuleCondition {
  field: string;
  operator: string;
  value: any;
}

export default function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { collection, isLoading, error } = useAdminCollection(id);
  const updateMutation = useUpdateAdminCollection();
  const deleteMutation = useDeleteAdminCollection();
  const publishMutation = usePublishAdminCollection();
  const evaluateMutation = useEvaluateAdminCollection();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'manual' | 'rule' | 'smart'>('manual');
  const [status, setStatus] = useState<'draft' | 'published' | 'scheduled'>('draft');
  const [featured, setFeatured] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [tags, setTags] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [ruleOperator, setRuleOperator] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<RuleCondition[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize form from collection data
  if (collection && !initialized) {
    setName(collection.name || '');
    setSlug(collection.slug || '');
    setDescription(collection.description || '');
    setType((collection.type as any) || 'manual');
    setStatus((collection.status as any) || 'draft');
    setFeatured(collection.featured || false);
    setIsPublic(collection.isPublic || false);
    setTags((collection.tags || []).join(', '));
    setSeoTitle(collection.seoTitle || '');
    setSeoDescription(collection.seoDescription || '');
    setCoverImage(collection.coverImage || '');
    if (collection.rule) {
      const rule = collection.rule as any;
      setRuleOperator(rule.operator || 'AND');
      setConditions(rule.conditions || []);
    }
    setInitialized(true);
  }

  const handleSave = async () => {
    const data: Record<string, unknown> = {
      name,
      slug,
      description,
      type,
      status,
      featured,
      isPublic,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      seoTitle,
      seoDescription,
      coverImage,
    };

    if (type === 'rule') {
      data.rule = {
        operator: ruleOperator,
        conditions,
      };
    }

    await updateMutation.mutateAsync({ id, data: data as any });
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(id);
    router.push('/catalog/collections');
  };

  const addCondition = () => {
    setConditions([...conditions, { field: 'category', operator: 'equals', value: '' }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
    setConditions(conditions.map((c, i) => i === index ? { ...c, ...updates } : c));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-48 animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <h3 className="text-lg font-semibold">Collection not found</h3>
          <Button asChild className="mt-4">
            <Link href="/catalog/collections">Back to Collections</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/catalog/collections">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{collection.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={collection.status === 'published' ? 'default' : 'secondary'}>
                {collection.status}
              </Badge>
              <Badge variant="outline">{collection.type}</Badge>
              {collection.featured && <Badge>Featured</Badge>}
              <span className="text-sm text-muted-foreground">
                {collection.productCount} products
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {type === 'rule' && (
            <Button
              variant="outline"
              onClick={() => evaluateMutation.mutate(id)}
              disabled={evaluateMutation.isPending}
            >
              <Zap className="mr-2 h-4 w-4" />
              {evaluateMutation.isPending ? 'Evaluating...' : 'Evaluate Rules'}
            </Button>
          )}
          {status === 'draft' && (
            <Button
              variant="outline"
              onClick={() => publishMutation.mutate(id)}
              disabled={publishMutation.isPending}
            >
              <Eye className="mr-2 h-4 w-4" />
              Publish
            </Button>
          )}
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          {type === 'manual' && <TabsTrigger value="products">Products</TabsTrigger>}
          {type === 'rule' && <TabsTrigger value="rules">Rules</TabsTrigger>}
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => {
                    setName(e.target.value);
                    if (!slug || slug === collection.slug) {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                    }
                  }} />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Curated</SelectItem>
                      <SelectItem value="rule">Dynamic</SelectItem>
                      <SelectItem value="smart">AI-Powered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cover Image URL</Label>
                  <Input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="modern, living-room, featured" />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={featured} onCheckedChange={setFeatured} id="featured" />
                  <Label htmlFor="featured">Featured</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} id="public" />
                  <Label htmlFor="public">Public</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>SEO Title</Label>
                <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
                <p className="text-xs text-muted-foreground">{seoTitle.length}/60 characters</p>
              </div>
              <div className="space-y-2">
                <Label>SEO Description</Label>
                <Textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} />
                <p className="text-xs text-muted-foreground">{seoDescription.length}/160 characters</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab (manual collections) */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Collection Products ({collection.productCount})</CardTitle>
            </CardHeader>
            <CardContent>
              {collection.items && collection.items.length > 0 ? (
                <div className="space-y-2">
                  {collection.items.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded border">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      {item.product?.images?.[0] && (
                        <img src={item.product.images[0]} alt="" className="h-10 w-10 rounded object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.product?.name || 'Unknown Product'}</p>
                        <p className="text-xs text-muted-foreground">{item.product?.brand}</p>
                      </div>
                      {item.product?.price_retail && (
                        <span className="text-sm text-muted-foreground">
                          ${(item.product.price_retail / 100).toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No products in this collection yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules Tab (rule-based collections) */}
        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Collection Rules</CardTitle>
                <div className="flex items-center gap-2">
                  <Label>Match</Label>
                  <Select value={ruleOperator} onValueChange={(v) => setRuleOperator(v as 'AND' | 'OR')}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">All (AND)</SelectItem>
                      <SelectItem value="OR">Any (OR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    value={condition.field}
                    onValueChange={(v) => updateCondition(index, {
                      field: v,
                      operator: RULE_OPERATORS[v]?.[0]?.value || 'equals',
                      value: '',
                    })}
                  >
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RULE_FIELDS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={condition.operator}
                    onValueChange={(v) => updateCondition(index, { operator: v })}
                  >
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(RULE_OPERATORS[condition.field] || []).map(op => (
                        <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    className="flex-1"
                    value={condition.value}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    placeholder={condition.field === 'price' ? 'Amount in cents' : 'Value'}
                  />

                  <Button variant="ghost" size="sm" onClick={() => removeCondition(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <Button variant="outline" onClick={addCondition}>
                <Plus className="mr-2 h-4 w-4" />
                Add Condition
              </Button>

              {conditions.length > 0 && (
                <div className="mt-4 p-3 bg-muted rounded text-sm">
                  <p className="font-medium mb-1">Rule Preview:</p>
                  <p className="text-muted-foreground">
                    Match products where{' '}
                    {conditions.map((c, i) => (
                      <span key={i}>
                        {i > 0 && <span className="font-medium"> {ruleOperator} </span>}
                        <span className="font-medium">{c.field}</span> {c.operator.replace('_', ' ')} &quot;{c.value}&quot;
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{collection.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

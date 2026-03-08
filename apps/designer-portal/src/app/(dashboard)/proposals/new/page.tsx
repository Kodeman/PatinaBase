'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreateProposal, useCreateSection, useAddProposalItem } from '@/hooks/use-proposals';
import { Card } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Input } from '@patina/design-system';
import { Textarea } from '@patina/design-system';
import { Label } from '@patina/design-system';
import { Select } from '@patina/design-system';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@patina/design-system';
import {
  ArrowLeft,
  Save,
  Plus,
  X,
  GripVertical,
  Image,
  DollarSign,
  Package,
  Grid3x3,
  LayoutGrid,
} from 'lucide-react';
import Link from 'next/link';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn, formatCurrency } from '@/lib/utils';

interface ProposalSection {
  id: string;
  name: string;
  description?: string;
  items: ProposalItem[];
}

interface ProposalItem {
  id: string;
  productId: string;
  productName: string;
  productImage?: string;
  variantId?: string;
  quantity: number;
  price: number;
  notes?: string;
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="group relative">
        <div
          {...listeners}
          className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-5 w-5 text-gray-400" />
        </div>
        {children}
      </div>
    </div>
  );
}

function NewProposalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId');

  const createProposal = useCreateProposal();
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

  const [formData, setFormData] = useState({
    title: '',
    clientId: clientId || '',
    description: '',
  });

  const [sections, setSections] = useState<ProposalSection[]>([
    {
      id: 'section-1',
      name: 'Living Room',
      description: 'Main living space furnishings',
      items: [],
    },
  ]);

  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showSectionDialog, setShowSectionDialog] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      // Find which section the items belong to
      for (const section of sections) {
        const itemIds = section.items.map((item) => item.id);
        const activeIndex = itemIds.indexOf(active.id);
        const overIndex = itemIds.indexOf(over.id);

        if (activeIndex !== -1 && overIndex !== -1) {
          const newItems = arrayMove(section.items, activeIndex, overIndex);
          setSections(
            sections.map((s) =>
              s.id === section.id ? { ...s, items: newItems } : s
            )
          );
          break;
        }
      }
    }
  };

  const addSection = (name: string, description?: string) => {
    const newSection: ProposalSection = {
      id: `section-${Date.now()}`,
      name,
      description,
      items: [],
    };
    setSections([...sections, newSection]);
    setShowSectionDialog(false);
  };

  const removeSection = (sectionId: string) => {
    setSections(sections.filter((s) => s.id !== sectionId));
  };

  const addProduct = (sectionId: string) => {
    setCurrentSectionId(sectionId);
    setShowProductDialog(true);
  };

  const addItemToSection = (item: ProposalItem) => {
    if (!currentSectionId) return;

    setSections(
      sections.map((section) =>
        section.id === currentSectionId
          ? { ...section, items: [...section.items, item] }
          : section
      )
    );
    setShowProductDialog(false);
    setCurrentSectionId(null);
  };

  const removeItem = (sectionId: string, itemId: string) => {
    setSections(
      sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
          : section
      )
    );
  };

  const updateItemQuantity = (sectionId: string, itemId: string, quantity: number) => {
    setSections(
      sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, quantity } : item
              ),
            }
          : section
      )
    );
  };

  const calculateTotal = () => {
    return sections.reduce(
      (total, section) =>
        total +
        section.items.reduce((sectionTotal, item) => sectionTotal + item.price * item.quantity, 0),
      0
    );
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.clientId) newErrors.clientId = 'Client is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      // Create proposal with sections and items
      // This would need to be implemented in the API
      console.log('Creating proposal:', { formData, sections });
      router.push('/proposals');
    } catch (error) {
      console.error('Failed to create proposal:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/proposals">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  New Proposal
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Create a beautiful proposal for your client
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'board' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('board')}
                >
                  <Grid3x3 className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={() => setShowSectionDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Section
              </Button>
              <Button onClick={handleSubmit} disabled={createProposal.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save Proposal
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Proposal Details Sidebar */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-6">
              <h2 className="font-semibold mb-4">Proposal Details</h2>
              <div className="space-y-4">
                <div>
                  <Label required>Title</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Modern Living Room Refresh"
                  />
                  {errors.title && <p className="text-sm text-red-600 mt-1">{errors.title}</p>}
                </div>
                <div>
                  <Label required>Client</Label>
                  <Select
                    value={formData.clientId}
                    onValueChange={(value: string) => setFormData({ ...formData, clientId: value })}
                    placeholder="Select a client"
                    options={[
                      { value: 'client-1', label: 'Sarah Johnson' },
                      { value: 'client-2', label: 'Michael Chen' },
                    ]}
                  />
                  {errors.clientId && (
                    <p className="text-sm text-red-500 mt-1">{errors.clientId}</p>
                  )}
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this proposal..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Total */}
              <div className="mt-6 pt-6 border-t">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Subtotal</span>
                  <span className="font-medium">{formatCurrency(calculateTotal())}</span>
                </div>
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total</span>
                  <span className="text-purple-600">{formatCurrency(calculateTotal())}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Proposal Canvas */}
          <div className="lg:col-span-3">
            {viewMode === 'list' ? (
              <div className="space-y-6">
                {sections.map((section) => (
                  <Card key={section.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold">{section.name}</h3>
                        {section.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {section.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addProduct(section.id)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Item
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSection(section.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Items */}
                    {section.items.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                        <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-gray-500 mb-3">No items in this section</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addProduct(section.id)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add First Item
                        </Button>
                      </div>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={section.items.map((item) => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-3">
                            {section.items.map((item) => (
                              <SortableItem key={item.id} id={item.id}>
                                <div className="pl-8 pr-3 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                  <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
                                      {item.productImage ? (
                                        <img
                                          src={item.productImage}
                                          alt={item.productName}
                                          className="w-full h-full object-cover rounded-lg"
                                        />
                                      ) : (
                                        <Image className="h-6 w-6 text-gray-400" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-medium truncate">
                                        {item.productName}
                                      </h4>
                                      <p className="text-sm text-gray-600 dark:text-gray-400">
                                        {formatCurrency(item.price)} each
                                      </p>
                                      {item.notes && (
                                        <p className="text-xs text-gray-500 mt-1">
                                          {item.notes}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() =>
                                            updateItemQuantity(
                                              section.id,
                                              item.id,
                                              Math.max(1, item.quantity - 1)
                                            )
                                          }
                                          className="w-8 h-8 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                          -
                                        </button>
                                        <span className="w-12 text-center font-medium">
                                          {item.quantity}
                                        </span>
                                        <button
                                          onClick={() =>
                                            updateItemQuantity(
                                              section.id,
                                              item.id,
                                              item.quantity + 1
                                            )
                                          }
                                          className="w-8 h-8 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                          +
                                        </button>
                                      </div>
                                      <div className="text-right min-w-[100px]">
                                        <p className="font-bold">
                                          {formatCurrency(item.price * item.quantity)}
                                        </p>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeItem(section.id, item.id)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </SortableItem>
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}

                    {/* Section Total */}
                    {section.items.length > 0 && (
                      <div className="mt-4 pt-4 border-t flex justify-between items-center">
                        <span className="font-medium">Section Total</span>
                        <span className="text-lg font-bold">
                          {formatCurrency(
                            section.items.reduce(
                              (total, item) => total + item.price * item.quantity,
                              0
                            )
                          )}
                        </span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {sections.map((section) => (
                  <Card key={section.id} className="p-4">
                    <h3 className="font-semibold mb-3">{section.name}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {section.items.map((item) => (
                        <div
                          key={item.id}
                          className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center text-xs text-center p-2"
                        >
                          {item.productName}
                        </div>
                      ))}
                      <button
                        onClick={() => addProduct(section.id)}
                        className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                      >
                        <Plus className="h-6 w-6 text-gray-400" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Search and select a product from the catalog
            </p>
            {/* Product browser would go here */}
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">Product browser integration pending</p>
              <Button
                className="mt-4"
                onClick={() => {
                  // Mock adding a product
                  addItemToSection({
                    id: `item-${Date.now()}`,
                    productId: 'prod-1',
                    productName: 'Mid-Century Modern Sofa',
                    price: 1299000,
                    quantity: 1,
                  });
                }}
              >
                Add Sample Product
              </Button>
            </div>
          
        </DialogContent>
      </Dialog>

      {/* Add Section Dialog */}
      <Dialog open={showSectionDialog} onOpenChange={setShowSectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
          </DialogHeader>
          
            <div className="space-y-4">
              <div>
                <Label required>Section Name</Label>
                <Input id="section-name" placeholder="e.g., Living Room, Bedroom" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  id="section-description"
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>
            </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSectionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const nameInput = document.getElementById('section-name') as HTMLInputElement;
                const descInput = document.getElementById(
                  'section-description'
                ) as HTMLTextAreaElement;
                addSection(nameInput.value, descInput.value);
              }}
            >
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewProposalLoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Proposal</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Loading...</p>
        </div>
      </div>
    </div>
  );
}

export default function NewProposalPage() {
  return (
    <Suspense fallback={<NewProposalLoadingFallback />}>
      <NewProposalContent />
    </Suspense>
  );
}

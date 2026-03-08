'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  Input,
  Label,
  ScrollArea,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@patina/design-system';
import {
  Activity,
  ArrowRight,
  Filter,
  Layers3,
  ListChecks,
  PenSquare,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AvailabilityStatus, ProductCategory, ProductStatus } from '@patina/types';

type CatalogStage = 'Sourcing' | 'Evaluation' | 'Launch Prep' | 'Live';

interface DemoCatalogItem {
  id: string;
  name: string;
  collection: string;
  pillar: string;
  stage: CatalogStage;
  status: string;
  owner: string;
  readiness: number;
  margin: string;
  channel: string;
  nextAction: string;
  launchWindow: string;
  priceFloor: number;
  priceCeiling: number;
  inventory: string;
  risk: 'Low' | 'Medium' | 'High';
  badges: string[];
  allocation: 'Stocked' | 'Made-to-order';
  leadTime: string;
  detail: DemoProductDetail;
}

interface DemoProductDetail {
  brand: string;
  shortDescription: string;
  longDescription: string;
  storyline: string;
  tags: string[];
  styleTags: string[];
  category: ProductCategory;
  materials: string[];
  colors: string[];
  availability: AvailabilityStatus;
  productLifecycleStatus: ProductStatus;
  requiresApproval: boolean;
  has3d: boolean;
  arSupported: boolean;
  customizable: boolean;
  fragile: boolean;
  complianceNotes: string;
  careInstructions: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  msrp: number;
  currency: string;
  weight: {
    value: number;
    unit: 'kg' | 'lb';
  };
  dimensions: {
    width: number;
    height: number;
    depth: number;
    unit: 'cm' | 'inch';
  };
}

type DemoProductDraft = Omit<DemoCatalogItem, 'margin' | 'detail' | 'id'> & {
  margin: number;
  id?: string;
} & DemoProductDetail;

const stageOrder: CatalogStage[] = ['Sourcing', 'Evaluation', 'Launch Prep', 'Live'];
const stageOptions = stageOrder.map((stage) => ({ value: stage, label: stage }));
const channelOptions = [
  { value: 'Studio Library', label: 'Studio Library' },
  { value: 'Signature Drops', label: 'Signature Drops' },
  { value: 'Outdoor Capsule', label: 'Outdoor Capsule' },
  { value: 'Trade Exclusive', label: 'Trade Exclusive' },
];
const categoryOptions: { value: ProductCategory; label: string }[] = [
  { value: 'sofa', label: 'Sofa' },
  { value: 'chair', label: 'Chair' },
  { value: 'table', label: 'Table' },
  { value: 'bed', label: 'Bed' },
  { value: 'storage', label: 'Storage' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'decor', label: 'Decor' },
  { value: 'outdoor', label: 'Outdoor' },
];
const lifecycleOptions: { value: ProductStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'published', label: 'Published' },
  { value: 'deprecated', label: 'Deprecated' },
];
const availabilityOptions: { value: AvailabilityStatus; label: string }[] = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'preorder', label: 'Preorder' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'backorder', label: 'Backorder' },
];
const allocationOptions = [
  { value: 'Stocked', label: 'Stocked' },
  { value: 'Made-to-order', label: 'Made-to-order' },
];
const riskOptions = [
  { value: 'Low', label: 'Low risk' },
  { value: 'Medium', label: 'Medium risk' },
  { value: 'High', label: 'High risk' },
];
const currencyOptions = [
  { value: 'USD', label: 'USD' },
  { value: 'CAD', label: 'CAD' },
  { value: 'EUR', label: 'EUR' },
];
const weightUnitOptions = [
  { value: 'lb', label: 'Pounds (lb)' },
  { value: 'kg', label: 'Kilograms (kg)' },
];
const dimensionUnitOptions = [
  { value: 'inch', label: 'Inches' },
  { value: 'cm', label: 'Centimeters' },
];
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const initialCatalogItems: DemoCatalogItem[] = [
  {
    id: 'SKU-1048',
    name: 'Arcadia Channel Sofa',
    collection: 'Arcadia Salon',
    pillar: 'Lounge',
    stage: 'Sourcing',
    status: 'Awaiting sample',
    owner: 'Nora Patel',
    readiness: 62,
    margin: '52%',
    channel: 'Trade Exclusive',
    nextAction: 'Confirm COM strike-off',
    launchWindow: 'Apr 3–14',
    priceFloor: 4200,
    priceCeiling: 5400,
    inventory: '12 units planned',
    risk: 'Medium',
    badges: ['Performance linen', 'Modular'],
    allocation: 'Made-to-order',
    leadTime: '8 weeks',
    detail: {
      brand: 'Arcadia Atelier',
      shortDescription: 'Channel-tufted modular sofa with two depth packages and COM-ready panels.',
      longDescription:
        'Arcadia Channel brings the tailored comfort of salon seating into a flexible modular build. Solid maple rails support extra-deep seats and double-cushioned lumbar support. Panels unzip to reveal COM-ready inserts.',
      storyline: 'Elevate lounge programs with sculpted channels and modular back panels.',
      tags: ['channel-tufted', 'salon'],
      styleTags: ['Deco', 'Luxe', 'Tailored'],
      category: 'sofa',
      materials: ['Performance linen', 'Maple frame', 'Feather-blend fill'],
      colors: ['Fog', 'Loden', 'Walnut'],
      availability: 'preorder',
      productLifecycleStatus: 'draft',
      requiresApproval: true,
      has3d: true,
      arSupported: false,
      customizable: true,
      fragile: false,
      complianceNotes: 'Requires CAL 117 docs before production sign-off.',
      careInstructions: 'Dry clean slipcovers; vacuum channels weekly.',
      seoTitle: 'Arcadia Channel Modular Sofa',
      seoDescription: 'Modular channel sofa with COM-ready panels and partner-exclusive finishes.',
      seoKeywords: ['arcadia sofa', 'channel tufted', 'modular sofa'],
      msrp: 6200,
      currency: 'USD',
      weight: { value: 220, unit: 'lb' },
      dimensions: { width: 108, depth: 40, height: 30, unit: 'inch' },
    },
  },
  {
    id: 'SKU-2042',
    name: 'Helios Brass Console',
    collection: 'Helios Metals',
    pillar: 'Storage',
    stage: 'Evaluation',
    status: 'Spec review',
    owner: 'Alex Romero',
    readiness: 74,
    margin: '47%',
    channel: 'Gallery + Trade',
    nextAction: 'Validate ADA clearance',
    launchWindow: 'May 18–Jun 2',
    priceFloor: 3100,
    priceCeiling: 3800,
    inventory: '40 units reserved',
    risk: 'Low',
    badges: ['Brushed brass', 'Stone top'],
    allocation: 'Stocked',
    leadTime: '6 weeks',
    detail: {
      brand: 'Helios Metals',
      shortDescription: 'Artisanal brass console with integrated stone shelf and ADA-friendly clearance.',
      longDescription:
        'Helios combines hand-brushed brass with a honed Calacatta Viola shelf. A recessed power chase keeps cables hidden while meeting ADA depth guidance.',
      storyline: 'A console that pairs gallery-grade metals with practical power routing.',
      tags: ['console', 'brass'],
      styleTags: ['Sculptural', 'Minimal', 'Gallery'],
      category: 'storage',
      materials: ['Brass', 'Calacatta Viola stone'],
      colors: ['Brass', 'Stone'],
      availability: 'in_stock',
      productLifecycleStatus: 'in_review',
      requiresApproval: false,
      has3d: true,
      arSupported: true,
      customizable: false,
      fragile: true,
      complianceNotes: 'Edge radii meet hospitality specs; include ADA clearance note.',
      careInstructions: 'Polish brass monthly; avoid acidic cleaners on stone.',
      seoTitle: 'Helios Brass Console Table',
      seoDescription: 'Sculptural brass console with recessed power chase and stone shelf.',
      seoKeywords: ['brass console', 'luxury entry console'],
      msrp: 4200,
      currency: 'USD',
      weight: { value: 180, unit: 'lb' },
      dimensions: { width: 72, depth: 16, height: 32, unit: 'inch' },
    },
  },
  {
    id: 'SKU-3120',
    name: 'Nova Dining Chair',
    collection: 'Nova Atelier',
    pillar: 'Seating',
    stage: 'Launch Prep',
    status: 'Imagery drop',
    owner: 'Sam Ellis',
    readiness: 81,
    margin: '58%',
    channel: 'Studio Library',
    nextAction: 'Load final imagery',
    launchWindow: 'Mar 21–30',
    priceFloor: 980,
    priceCeiling: 1280,
    inventory: '150 units inbound',
    risk: 'Low',
    badges: ['Stackable', 'Performance boucle'],
    allocation: 'Stocked',
    leadTime: '4 weeks',
    detail: {
      brand: 'Nova Atelier',
      shortDescription: 'Stackable dining chair with curved back and removable performance boucle slip.',
      longDescription:
        "Nova's sculpted back floats above powder-coated steel legs, while a removable boucle slipcover snaps tight for contract maintenance.",
      storyline: 'A hospitality workhorse with couture textile swaps.',
      tags: ['dining', 'stackable'],
      styleTags: ['Contemporary', 'Soft modern'],
      category: 'chair',
      materials: ['Steel', 'Performance boucle', 'Foam core'],
      colors: ['Oat', 'Coal', 'Mist'],
      availability: 'in_stock',
      productLifecycleStatus: 'in_review',
      requiresApproval: false,
      has3d: true,
      arSupported: true,
      customizable: true,
      fragile: false,
      complianceNotes: 'BIFMA cert pending but load-tested to 350 lbs.',
      careInstructions: 'Cold wash slipcovers; line dry.',
      seoTitle: 'Nova Stackable Dining Chair',
      seoDescription: 'Stackable contract-grade dining chair with removable performance slipcover.',
      seoKeywords: ['stackable dining chair', 'boucle dining chair'],
      msrp: 1180,
      currency: 'USD',
      weight: { value: 24, unit: 'lb' },
      dimensions: { width: 22, depth: 23, height: 33, unit: 'inch' },
    },
  },
  {
    id: 'SKU-4211',
    name: 'Lumen Pendant Cluster',
    collection: 'Lumen Atelier',
    pillar: 'Lighting',
    stage: 'Evaluation',
    status: 'Field testing',
    owner: 'Rafa Morgan',
    readiness: 69,
    margin: '44%',
    channel: 'Signature Drops',
    nextAction: 'QA dimming kit',
    launchWindow: 'May 1–12',
    priceFloor: 1800,
    priceCeiling: 2600,
    inventory: '60 kits reserved',
    risk: 'Medium',
    badges: ['Custom canopy', 'LED'],
    allocation: 'Stocked',
    leadTime: '5 weeks',
    detail: {
      brand: 'Lumen Atelier',
      shortDescription: 'Customizable pendant cluster with magnetic diffusers and dimmable driver.',
      longDescription:
        'Lumen Cluster suspends four lean pendants from a configurable canopy. Magnetic acrylic diffusers snap on for site-friendly swaps.',
      storyline: 'Dialable glow with gallery-ready brass accents.',
      tags: ['lighting', 'pendant'],
      styleTags: ['Modern', 'Sculptural'],
      category: 'lighting',
      materials: ['Brass', 'Opal acrylic', 'LED'],
      colors: ['Brass', 'Matte black'],
      availability: 'preorder',
      productLifecycleStatus: 'draft',
      requiresApproval: true,
      has3d: false,
      arSupported: false,
      customizable: true,
      fragile: true,
      complianceNotes: 'Need dimming kit verification per UL project notes.',
      careInstructions: 'Dust with microfiber; avoid solvents.',
      seoTitle: 'Lumen Pendant Cluster',
      seoDescription: 'Configurable brass pendant cluster with magnetic diffusers and LED core.',
      seoKeywords: ['pendant cluster', 'customizable lighting'],
      msrp: 2100,
      currency: 'USD',
      weight: { value: 38, unit: 'lb' },
      dimensions: { width: 24, depth: 24, height: 48, unit: 'inch' },
    },
  },
  {
    id: 'SKU-5124',
    name: 'Monarch Wardrobe System',
    collection: 'Monarch Capsule',
    pillar: 'Storage',
    stage: 'Launch Prep',
    status: 'Blocked on compliance',
    owner: 'Maya Chen',
    readiness: 54,
    margin: '49%',
    channel: 'Signature Drops',
    nextAction: 'Finalize anti-tip kit docs',
    launchWindow: 'Jun 5–18',
    priceFloor: 5200,
    priceCeiling: 6400,
    inventory: '20 units pilot',
    risk: 'High',
    badges: ['Solid walnut', 'Modular'],
    allocation: 'Made-to-order',
    leadTime: '10 weeks',
    detail: {
      brand: 'Monarch Capsule',
      shortDescription: 'Modular wardrobe system with integrated lighting and anti-tip kit.',
      longDescription:
        'Monarch delivers a wall-spanning wardrobe with mix-and-match modules, full-length lighting, and auto-level feet. Walnut facades pair with matte brass pulls.',
      storyline: 'Turn any wall into a boutique-grade display.',
      tags: ['wardrobe', 'modular'],
      styleTags: ['Warm modern', 'Tailored'],
      category: 'storage',
      materials: ['Walnut veneer', 'Brass', 'Powder-coated steel'],
      colors: ['Walnut', 'Brass', 'Ink'],
      availability: 'backorder',
      productLifecycleStatus: 'in_review',
      requiresApproval: true,
      has3d: true,
      arSupported: false,
      customizable: true,
      fragile: false,
      complianceNotes: 'Awaiting anti-tip documentation before compliance sign-off.',
      careInstructions: 'Oil finish twice per year; wipe with damp cloth.',
      seoTitle: 'Monarch Modular Wardrobe System',
      seoDescription: 'Signature wardrobe wall with modular inserts and embedded lighting.',
      seoKeywords: ['modular wardrobe', 'walnut wardrobe system'],
      msrp: 7800,
      currency: 'USD',
      weight: { value: 480, unit: 'lb' },
      dimensions: { width: 120, depth: 24, height: 96, unit: 'inch' },
    },
  },
  {
    id: 'SKU-6018',
    name: 'Kaiyo Outdoor Chaise',
    collection: 'Kaiyo Retreat',
    pillar: 'Outdoor',
    stage: 'Live',
    status: 'Launched',
    owner: 'Leo Stroud',
    readiness: 96,
    margin: '39%',
    channel: 'Outdoor Capsule',
    nextAction: 'Track replenishment',
    launchWindow: 'Now live',
    priceFloor: 2400,
    priceCeiling: 3100,
    inventory: '220 units active',
    risk: 'Low',
    badges: ['Sunbrella', 'Powder coat'],
    allocation: 'Stocked',
    leadTime: '4 weeks',
    detail: {
      brand: 'Kaiyo Retreat',
      shortDescription: 'Adjustable outdoor chaise with powder-coated frame and marine-grade straps.',
      longDescription:
        "Kaiyo's aluminum frame resists coastal corrosion, while marine straps cradle quick-dry cushions wrapped in Sunbrella Heritage.",
      storyline: 'Poolside comfort that shrugs off salt spray.',
      tags: ['outdoor', 'chaise'],
      styleTags: ['Resort', 'Relaxed'],
      category: 'outdoor',
      materials: ['Powder-coated aluminum', 'Marine straps', 'Sunbrella'],
      colors: ['Fog', 'Navy', 'White'],
      availability: 'in_stock',
      productLifecycleStatus: 'published',
      requiresApproval: false,
      has3d: true,
      arSupported: true,
      customizable: false,
      fragile: false,
      complianceNotes: 'Meets ASTM outdoor seating guidelines.',
      careInstructions: 'Hose off monthly; cover during off-season.',
      seoTitle: 'Kaiyo Outdoor Chaise Lounge',
      seoDescription: 'Marine-grade outdoor chaise with quick-dry cushions and powder-coated frame.',
      seoKeywords: ['outdoor chaise', 'sunbrella chaise'],
      msrp: 3200,
      currency: 'USD',
      weight: { value: 68, unit: 'lb' },
      dimensions: { width: 30, depth: 78, height: 32, unit: 'inch' },
    },
  },
];

export default function CatalogSandboxPage() {
  const [products, setProducts] = useState<DemoCatalogItem[]>(initialCatalogItems);
  const [selectedProductId, setSelectedProductId] = useState(initialCatalogItems[0]?.id ?? '');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === selectedProductId) ?? products[0],
    [products, selectedProductId]
  );

  const readinessAverage = useMemo(() => {
    if (!products.length) return 0;
    const total = products.reduce((acc, item) => acc + item.readiness, 0);
    return Math.round(total / products.length);
  }, [products]);

  const launchPrepCount = useMemo(
    () => products.filter((item) => item.stage === 'Launch Prep').length,
    [products]
  );
  const highRiskCount = useMemo(() => products.filter((item) => item.risk === 'High').length, [products]);

  return (
    <div className="space-y-8">
      <CatalogDemoHero
        readinessAverage={readinessAverage}
        launchPrepCount={launchPrepCount}
        highRiskCount={highRiskCount}
        onOpenCreate={() => setIsCreateModalOpen(true)}
        onOpenEdit={() => selectedProduct && setIsEditModalOpen(true)}
        canEdit={Boolean(selectedProduct)}
      />
      <CatalogCommandCenter
        items={products}
        selectedProductId={selectedProduct?.id ?? ''}
        onSelectItem={setSelectedProductId}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <CatalogCreationPrimer onOpenModal={() => setIsCreateModalOpen(true)} />
        <CatalogSelectionSummary product={selectedProduct} onEdit={() => setIsEditModalOpen(true)} />
      </div>

      <CatalogDemoProductModal
        mode="create"
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSave={(draft) => {
          const newItem = draftToCatalogItem(draft);
          setProducts((prev) => [newItem, ...prev]);
          setSelectedProductId(newItem.id);
        }}
      />
      <CatalogDemoProductModal
        mode="edit"
        product={selectedProduct}
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onSave={(draft) => {
          setProducts((prev) =>
            prev.map((item) => (item.id === draft.id ? draftToCatalogItem(draft, item) : item))
          );
          if (draft.id) {
            setSelectedProductId(draft.id);
          }
        }}
      />
    </div>
  );
}

function CatalogDemoHero({
  readinessAverage,
  launchPrepCount,
  highRiskCount,
  onOpenCreate,
  onOpenEdit,
  canEdit,
}: {
  readinessAverage: number;
  launchPrepCount: number;
  highRiskCount: number;
  onOpenCreate: () => void;
  onOpenEdit: () => void;
  canEdit: boolean;
}) {
  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-4 w-4" />
            Catalog system lab
          </div>
          <CardTitle className="text-3xl">Catalog management, reimagined</CardTitle>
          <CardDescription className="text-base">
            A dedicated sandbox to explore dual-mode list views plus creation and edit workflows before we wire
            into live data.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/catalog">
              Back to live catalog
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button onClick={onOpenCreate}>
            Stage concept
            <PenSquare className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={onOpenEdit} disabled={!canEdit}>
            Resume edit
            <Activity className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <HeroMetric
            label="Avg readiness"
            value={`${readinessAverage}%`}
            hint="+8 pts vs last sprint"
          />
          <HeroMetric
            label="Launch candidates"
            value={launchPrepCount}
            hint="In Launch Prep lane"
          />
          <HeroMetric
            label="Risk watch"
            value={highRiskCount ? `${highRiskCount} flagged` : 'All clear'}
            hint="Compliance + margin alerts"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function HeroMetric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function CatalogCommandCenter({
  items,
  selectedProductId,
  onSelectItem,
}: {
  items: DemoCatalogItem[];
  selectedProductId: string;
  onSelectItem: (id: string) => void;
}) {
  const [stageFilter, setStageFilter] = useState<'all' | CatalogStage>('all');
  const [viewMode, setViewMode] = useState<'table' | 'swimlane'>('table');

  const tableItems = useMemo(
    () => (stageFilter === 'all' ? items : items.filter((item) => item.stage === stageFilter)),
    [items, stageFilter]
  );

  const stageCounts = useMemo(() => {
    return stageOrder.reduce<Record<CatalogStage, number>>((acc, stage) => {
      acc[stage] = items.filter((item) => item.stage === stage).length;
      return acc;
    }, {} as Record<CatalogStage, number>);
  }, [items]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Catalog list explorations
          </p>
          <CardTitle>Command-center list views</CardTitle>
          <CardDescription>
            Toggle between dense tables and swimlanes to triage sourcing through launch without touching production
            data.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <ListChecks className="mr-2 h-4 w-4" />
            Share walkthrough
          </Button>
          <Button size="sm">
            <Layers3 className="mr-2 h-4 w-4" />
            Create from selection
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {(['all', ...stageOrder] as const).map((stage) => {
            const isActive = stageFilter === stage;
            const label = stage === 'all' ? 'All pipelines' : stage;
            const count = stage === 'all' ? items.length : stageCounts[stage];
            return (
              <Button
                key={stage}
                variant={isActive ? 'default' : 'ghost'}
                size="sm"
                className="gap-2"
                onClick={() => setStageFilter(stage)}
              >
                {stage === 'all' && <Filter className="h-3.5 w-3.5" />}
                {label}
                <Badge variant="subtle" color="neutral">{count}</Badge>
              </Button>
            );
          })}
        </div>

        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'table' | 'swimlane')}>
          <TabsList className="w-full justify-start rounded-xl bg-muted/40 p-1">
            <TabsTrigger value="table" className="flex-1">
              Structured table
            </TabsTrigger>
            <TabsTrigger value="swimlane" className="flex-1">
              Stage swimlane
            </TabsTrigger>
          </TabsList>
          <TabsContent value="table" className="mt-4">
            <div className="rounded-2xl border bg-card/80 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-40">Stage</TableHead>
                    <TableHead className="w-32">Owner</TableHead>
                    <TableHead className="w-32">Readiness</TableHead>
                    <TableHead className="w-32 text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        Nothing in this stage filter—perfect time to stage a new concept.
                      </TableCell>
                    </TableRow>
                  )}
                  {tableItems.map((item) => (
                    <TableRow
                      key={item.id}
                      onClick={() => onSelectItem(item.id)}
                      className={cn(
                        'cursor-pointer border-b transition-colors hover:bg-muted/60',
                        selectedProductId === item.id && 'bg-primary/5'
                      )}
                    >
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.collection} • {item.pillar}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.badges.map((badge) => (
                            <Badge key={badge} variant="outline" className="text-xs">
                              {badge}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            getStageAccent(item.stage)
                          )}
                        >
                          {item.stage}
                        </Badge>
                        <p className="mt-2 text-xs text-muted-foreground">{item.status}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{item.owner}</p>
                        <p className="text-xs text-muted-foreground">{item.channel}</p>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Readiness</span>
                            <span>{item.readiness}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${item.readiness}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">{item.nextAction}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <p className="text-sm font-semibold">{item.margin}</p>
                        <p className="text-xs text-muted-foreground">{item.launchWindow}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            'mt-2 text-xs',
                            getRiskAccent(item.risk)
                          )}
                        >
                          {item.risk} risk
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="swimlane" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stageOrder.map((stage) => {
                const laneItems = items.filter((item) => item.stage === stage);
                return (
                  <div key={stage} className="rounded-2xl border bg-card/70 p-4">
                    <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
                      <span>{stage}</span>
                      <Badge variant="subtle" color="neutral">{laneItems.length}</Badge>
                    </div>
                    <div className="space-y-3">
                      {laneItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No items yet.</p>
                      ) : (
                        laneItems.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => onSelectItem(item.id)}
                            className={cn(
                              'w-full rounded-xl border bg-background/80 px-3 py-2 text-left text-sm shadow-sm transition hover:border-primary/40',
                              selectedProductId === item.id && 'border-primary bg-primary/5'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{item.name}</span>
                              <span className="text-xs text-muted-foreground">{item.margin}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{item.nextAction}</p>
                            <div className="mt-1 text-xs text-muted-foreground">{item.inventory}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function CatalogCreationPrimer({ onOpenModal }: { onOpenModal: () => void }) {
  const blueprint = [
    { label: 'Pulse', detail: 'Source signals, supplier mood boards, compliance flags', duration: '48 hrs' },
    { label: 'Scope', detail: 'Budget guardrails + product object scaffolding', duration: '72 hrs' },
    { label: 'Launch', detail: 'Asset capture, readiness, and approval routing', duration: '5 days' },
  ];

  const highlights = [
    'Basics: name, brand, pillar, and lifecycle status as defined on Product.',
    'Specs: category, materials, colors, tags, and customization toggles.',
    'Pricing & logistics: floor/ceiling, target margin, allocation, lead time, availability.',
    'Publishing: story hook, SEO fields, compliance + care instructions, approval switch.',
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Creation blueprint</CardTitle>
        <CardDescription>
          Preview every product field we need before wiring into the real catalog service.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {blueprint.map((step) => (
            <div key={step.label} className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {step.label}
              </p>
              <p className="text-sm font-medium">{step.detail}</p>
              <p className="text-xs text-muted-foreground">{step.duration}</p>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">What this captures</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed pt-4">
          <p className="text-xs text-muted-foreground">Prototype only — nothing syncs to catalog services yet.</p>
          <Button onClick={onOpenModal}>
            Launch creation modal
            <Sparkles className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CatalogSelectionSummary({ product, onEdit }: { product?: DemoCatalogItem; onEdit: () => void }) {
  if (!product) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Pick a milestone</CardTitle>
          <CardDescription>Select a row in the list view to see readiness signals here.</CardDescription>
        </CardHeader>
        <CardContent className="h-full">
          <div className="flex h-full flex-col items-center justify-center space-y-3 text-center text-sm text-muted-foreground">
            <p>No SKU selected yet.</p>
            <Button onClick={onEdit} disabled>
              Open editing modal
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const detail = product.detail;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{product.name}</CardTitle>
            <CardDescription>{detail.shortDescription}</CardDescription>
          </div>
          <Badge variant="outline" className={cn('text-xs', getStageAccent(product.stage))}>
            {product.stage}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Collection: {product.collection}</span>
          <span>•</span>
          <span>{detail.brand}</span>
          <span>•</span>
          <span>Lifecycle: {detail.productLifecycleStatus}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase text-muted-foreground">Readiness</p>
            <p className="text-xl font-semibold">{product.readiness}%</p>
            <p className="text-xs text-muted-foreground">{product.status}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase text-muted-foreground">Margin</p>
            <p className="text-xl font-semibold">{product.margin}</p>
            <p className="text-xs text-muted-foreground">Floor {currency.format(product.priceFloor)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase text-muted-foreground">Risk</p>
            <p className="text-xl font-semibold">{product.risk}</p>
            <p className="text-xs text-muted-foreground">{detail.complianceNotes}</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-xs uppercase text-muted-foreground">Strategy</p>
          <p>{detail.storyline}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Materials</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.materials.map((material) => (
                <Badge key={material} variant="outline">
                  {material}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Tags</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
          <p>Lead time: {product.leadTime}</p>
          <p>Availability: {detail.availability}</p>
          <p>Allocation: {product.allocation}</p>
          <p>Inventory: {product.inventory}</p>
        </div>
      </CardContent>
      <div className="flex items-center justify-between border-t px-6 py-4">
        <p className="text-xs text-muted-foreground">
          SEO title: <span className="text-foreground">{detail.seoTitle}</span>
        </p>
        <Button onClick={onEdit}>
          Open editing modal
          <PenSquare className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

interface CatalogDemoProductModalProps {
  mode: 'create' | 'edit';
  product?: DemoCatalogItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: DemoProductDraft) => void;
}

const modalTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'specs', label: 'Specs' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'publishing', label: 'Publishing' },
] as const;

type ModalTabId = (typeof modalTabs)[number]['id'];

function CatalogDemoProductModal({ mode, product, open, onOpenChange, onSave }: CatalogDemoProductModalProps) {
  const [draft, setDraft] = useState<DemoProductDraft>(() => createDraftFromProduct(mode === 'edit' ? product : undefined));
  const [activeTab, setActiveTab] = useState<ModalTabId>('overview');

  useEffect(() => {
    if (open) {
      setDraft(createDraftFromProduct(mode === 'edit' ? product : undefined));
      setActiveTab('overview');
    }
  }, [open, product, mode]);

  const handleFieldChange = <K extends keyof DemoProductDraft>(field: K, value: DemoProductDraft[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: 'tags' | 'styleTags' | 'materials' | 'colors' | 'badges' | 'seoKeywords') => (value: string) => {
    handleFieldChange(field, parseListInput(value));
  };

  const handleSave = () => {
    onSave({
      ...draft,
      margin: Number.isNaN(draft.margin) ? 0 : draft.margin,
      priceFloor: Number(draft.priceFloor),
      priceCeiling: Number(draft.priceCeiling),
      msrp: Number(draft.msrp),
      weight: { ...draft.weight, value: Number(draft.weight.value) || 0 },
      dimensions: {
        ...draft.dimensions,
        width: Number(draft.dimensions.width) || 0,
        depth: Number(draft.dimensions.depth) || 0,
        height: Number(draft.dimensions.height) || 0,
      },
    });
    onOpenChange(false);
  };

  const detail = draft;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] gap-0 overflow-hidden p-0">
        <div className="flex flex-col h-full">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {mode === 'create' ? 'New concept' : 'Editing concept'}
              </p>
              <p className="text-2xl font-semibold leading-tight">{draft.name || 'Untitled concept'}</p>
              <p className="text-sm text-muted-foreground">
                {detail.brand} • {draft.channel} • {draft.stage}
              </p>
            </div>
            <Badge variant={mode === 'create' ? 'secondary' : 'outline'}>
              {mode === 'create' ? 'Create flow' : 'Edit flow'}
            </Badge>
          </div>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ModalTabId)} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="w-full justify-start gap-2 overflow-x-auto border-b bg-muted/40 px-4 py-2">
              {modalTabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="px-4 py-2 data-[state=active]:bg-background">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex-1 min-h-0">
              <TabsContent value="overview" className="h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={draft.name} onChange={(e) => handleFieldChange('name', e.target.value)} placeholder="Enter product name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Brand</Label>
                        <Input value={detail.brand} onChange={(e) => handleFieldChange('brand', e.target.value)} placeholder="Studio brand" />
                      </div>
                      <div className="space-y-2">
                        <Label>Collection</Label>
                        <Input value={draft.collection} onChange={(e) => handleFieldChange('collection', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Owner</Label>
                        <Input value={draft.owner} onChange={(e) => handleFieldChange('owner', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Stage</Label>
                        <Select
                          value={draft.stage}
                          onValueChange={(value) => handleFieldChange('stage', value as CatalogStage)}
                          options={stageOptions}
                          placeholder="Select stage"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Lifecycle status</Label>
                        <Select
                          value={detail.productLifecycleStatus}
                          onValueChange={(value) => handleFieldChange('productLifecycleStatus', value as ProductStatus)}
                          options={lifecycleOptions}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Channel</Label>
                        <Select
                          value={draft.channel}
                          onValueChange={(value) => handleFieldChange('channel', value)}
                          options={channelOptions}
                          placeholder="Pick a channel"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Pillar</Label>
                        <Input value={draft.pillar} onChange={(e) => handleFieldChange('pillar', e.target.value)} placeholder="Lounge, Lighting..." />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Readiness (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={draft.readiness}
                          onChange={(e) => handleFieldChange('readiness', Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Margin target (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={draft.margin}
                          onChange={(e) => handleFieldChange('margin', Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Launch window</Label>
                        <Input value={draft.launchWindow} onChange={(e) => handleFieldChange('launchWindow', e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Short description</Label>
                      <Textarea value={detail.shortDescription} onChange={(e) => handleFieldChange('shortDescription', e.target.value)} rows={3} />
                    </div>
                    <div className="space-y-2">
                      <Label>Long description</Label>
                      <Textarea value={detail.longDescription} onChange={(e) => handleFieldChange('longDescription', e.target.value)} rows={4} />
                    </div>
                    <div className="space-y-2">
                      <Label>Story hook</Label>
                      <Textarea value={detail.storyline} onChange={(e) => handleFieldChange('storyline', e.target.value)} rows={3} />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Tags (comma separated)</Label>
                        <Input value={formatListValue(detail.tags)} onChange={(e) => handleArrayChange('tags')(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Style tags</Label>
                        <Input value={formatListValue(detail.styleTags)} onChange={(e) => handleArrayChange('styleTags')(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="specs" className="h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select
                          value={detail.category}
                          onValueChange={(value) => handleFieldChange('category', value as ProductCategory)}
                          options={categoryOptions}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Availability</Label>
                        <Select
                          value={detail.availability}
                          onValueChange={(value) => handleFieldChange('availability', value as AvailabilityStatus)}
                          options={availabilityOptions}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Materials</Label>
                        <Input value={formatListValue(detail.materials)} onChange={(e) => handleArrayChange('materials')(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Colors</Label>
                        <Input value={formatListValue(detail.colors)} onChange={(e) => handleArrayChange('colors')(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Dimensions (W × D × H)</Label>
                        <div className="grid grid-cols-[1fr,1fr,1fr,auto] gap-2">
                          <Input
                            type="number"
                            value={detail.dimensions.width}
                            onChange={(e) =>
                              handleFieldChange('dimensions', { ...detail.dimensions, width: Number(e.target.value) })
                            }
                            placeholder="Width"
                          />
                          <Input
                            type="number"
                            value={detail.dimensions.depth}
                            onChange={(e) =>
                              handleFieldChange('dimensions', { ...detail.dimensions, depth: Number(e.target.value) })
                            }
                            placeholder="Depth"
                          />
                          <Input
                            type="number"
                            value={detail.dimensions.height}
                            onChange={(e) =>
                              handleFieldChange('dimensions', { ...detail.dimensions, height: Number(e.target.value) })
                            }
                            placeholder="Height"
                          />
                          <Select
                            value={detail.dimensions.unit}
                            onValueChange={(value) =>
                              handleFieldChange('dimensions', { ...detail.dimensions, unit: value as 'cm' | 'inch' })
                            }
                            options={dimensionUnitOptions}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Weight</Label>
                        <div className="grid grid-cols-[1fr,auto] gap-2">
                          <Input
                            type="number"
                            value={detail.weight.value}
                            onChange={(e) =>
                              handleFieldChange('weight', { ...detail.weight, value: Number(e.target.value) })
                            }
                          />
                          <Select
                            value={detail.weight.unit}
                            onValueChange={(value) =>
                              handleFieldChange('weight', { ...detail.weight, unit: value as 'kg' | 'lb' })
                            }
                            options={weightUnitOptions}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Customization & tech</Label>
                        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Has 3D</span>
                            <Switch checked={detail.has3d} onCheckedChange={(checked) => handleFieldChange('has3d', checked)} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">AR supported</span>
                            <Switch
                              checked={detail.arSupported}
                              onCheckedChange={(checked) => handleFieldChange('arSupported', checked)}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Customizable</span>
                            <Switch
                              checked={detail.customizable}
                              onCheckedChange={(checked) => handleFieldChange('customizable', checked)}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Fragile handling</span>
                            <Switch
                              checked={detail.fragile}
                              onCheckedChange={(checked) => handleFieldChange('fragile', checked)}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Care instructions</Label>
                        <Textarea
                          rows={5}
                          value={detail.careInstructions}
                          onChange={(e) => handleFieldChange('careInstructions', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="pricing" className="h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Floor price</Label>
                        <Input
                          type="number"
                          value={draft.priceFloor}
                          onChange={(e) => handleFieldChange('priceFloor', Number(e.target.value))}
                          leftIcon={<span className="text-xs text-muted-foreground">$</span>}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Ceiling price</Label>
                        <Input
                          type="number"
                          value={draft.priceCeiling}
                          onChange={(e) => handleFieldChange('priceCeiling', Number(e.target.value))}
                          leftIcon={<span className="text-xs text-muted-foreground">$</span>}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>MSRP</Label>
                        <Input
                          type="number"
                          value={detail.msrp}
                          onChange={(e) => handleFieldChange('msrp', Number(e.target.value))}
                          leftIcon={<span className="text-xs text-muted-foreground">$</span>}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select
                          value={detail.currency}
                          onValueChange={(value) => handleFieldChange('currency', value)}
                          options={currencyOptions}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Badges (badging strategy)</Label>
                      <Input value={formatListValue(draft.badges)} onChange={(e) => handleArrayChange('badges')(e.target.value)} />
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="logistics" className="h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Allocation strategy</Label>
                        <Select
                          value={draft.allocation}
                          onValueChange={(value) => handleFieldChange('allocation', value as DemoCatalogItem['allocation'])}
                          options={allocationOptions}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Lead time</Label>
                        <Input value={draft.leadTime} onChange={(e) => handleFieldChange('leadTime', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Inventory notes</Label>
                        <Input value={draft.inventory} onChange={(e) => handleFieldChange('inventory', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Next action</Label>
                        <Input value={draft.nextAction} onChange={(e) => handleFieldChange('nextAction', e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Compliance notes</Label>
                      <Textarea rows={3} value={detail.complianceNotes} onChange={(e) => handleFieldChange('complianceNotes', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Risk posture</Label>
                      <Select
                        value={draft.risk}
                        onValueChange={(value) => handleFieldChange('risk', value as DemoCatalogItem['risk'])}
                        options={riskOptions}
                      />
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="publishing" className="h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-6">
                    <div className="space-y-2">
                      <Label>SEO title</Label>
                      <Input value={detail.seoTitle} onChange={(e) => handleFieldChange('seoTitle', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>SEO description</Label>
                      <Textarea rows={3} value={detail.seoDescription} onChange={(e) => handleFieldChange('seoDescription', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>SEO keywords</Label>
                      <Input
                        value={formatListValue(detail.seoKeywords)}
                        onChange={(e) => handleArrayChange('seoKeywords')(e.target.value)}
                        placeholder="comma, separated, keywords"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Requires approval</Label>
                      <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                        <p className="text-sm text-muted-foreground">
                          Toggle when Operations needs to sign off before publication.
                        </p>
                        <Switch
                          checked={detail.requiresApproval}
                          onCheckedChange={(checked) => handleFieldChange('requiresApproval', checked)}
                        />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(createDraftFromProduct(mode === 'edit' ? product : undefined))}
            >
              Reset
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>{mode === 'create' ? 'Stage concept' : 'Save changes'}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function parseListInput(value: string): string[] {
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function formatListValue(list: string[]): string {
  return list.join(', ');
}

const defaultDraft: DemoProductDraft = {
  id: undefined,
  name: 'New concept',
  collection: 'Studio Concepts',
  pillar: 'Lounge',
  stage: 'Sourcing',
  status: 'Awaiting routing',
  owner: 'Catalog Ops',
  readiness: 45,
  margin: 48,
  channel: 'Studio Library',
  nextAction: 'Outline guardrails',
  launchWindow: 'TBD',
  priceFloor: 2500,
  priceCeiling: 4200,
  inventory: 'Pilot lot pending',
  risk: 'Medium',
  badges: ['Prototype'],
  allocation: 'Made-to-order',
  leadTime: '8 weeks',
  brand: 'Patina Studio',
  shortDescription: 'Concept-stage product summary.',
  longDescription: 'Expand the story with materials, provenance, and partner rationale.',
  storyline: 'Connect inspiration to rollout strategy.',
  tags: ['concept'],
  styleTags: ['Modern'],
  category: 'sofa',
  materials: ['Performance textile'],
  colors: ['Sand'],
  availability: 'preorder',
  productLifecycleStatus: 'draft',
  requiresApproval: true,
  has3d: false,
  arSupported: false,
  customizable: true,
  fragile: false,
  complianceNotes: 'Compliance review pending.',
  careInstructions: 'Spot clean.',
  seoTitle: 'Concept SKU',
  seoDescription: 'Draft SEO description for early concept.',
  seoKeywords: ['concept', 'catalog'],
  msrp: 5200,
  currency: 'USD',
  weight: { value: 200, unit: 'lb' },
  dimensions: { width: 96, depth: 40, height: 32, unit: 'inch' },
};

function createDraftFromProduct(product?: DemoCatalogItem): DemoProductDraft {
  if (!product) {
    return { ...defaultDraft };
  }

  return {
    id: product.id,
    name: product.name,
    collection: product.collection,
    pillar: product.pillar,
    stage: product.stage,
    status: product.status,
    owner: product.owner,
    readiness: product.readiness,
    margin: parseInt(product.margin.replace('%', ''), 10) || 0,
    channel: product.channel,
    nextAction: product.nextAction,
    launchWindow: product.launchWindow,
    priceFloor: product.priceFloor,
    priceCeiling: product.priceCeiling,
    inventory: product.inventory,
    risk: product.risk,
    badges: [...product.badges],
    allocation: product.allocation,
    leadTime: product.leadTime,
    ...product.detail,
    tags: [...product.detail.tags],
    styleTags: [...product.detail.styleTags],
    materials: [...product.detail.materials],
    colors: [...product.detail.colors],
    seoKeywords: [...product.detail.seoKeywords],
  };
}

function draftToCatalogItem(draft: DemoProductDraft, base?: DemoCatalogItem): DemoCatalogItem {
  const id = draft.id ?? generateSku();

  return {
    id,
    name: draft.name || base?.name || 'Untitled concept',
    collection: draft.collection || base?.collection || 'Studio Concepts',
    pillar: draft.pillar || base?.pillar || 'Lounge',
    stage: draft.stage,
    status: draft.status,
    owner: draft.owner,
    readiness: draft.readiness,
    margin: `${draft.margin}%`,
    channel: draft.channel,
    nextAction: draft.nextAction,
    launchWindow: draft.launchWindow,
    priceFloor: Math.round(draft.priceFloor),
    priceCeiling: Math.round(draft.priceCeiling),
    inventory: draft.inventory,
    risk: draft.risk,
    badges: [...draft.badges],
    allocation: draft.allocation,
    leadTime: draft.leadTime,
    detail: {
      brand: draft.brand,
      shortDescription: draft.shortDescription,
      longDescription: draft.longDescription,
      storyline: draft.storyline,
      tags: [...draft.tags],
      styleTags: [...draft.styleTags],
      category: draft.category,
      materials: [...draft.materials],
      colors: [...draft.colors],
      availability: draft.availability,
      productLifecycleStatus: draft.productLifecycleStatus,
      requiresApproval: draft.requiresApproval,
      has3d: draft.has3d,
      arSupported: draft.arSupported,
      customizable: draft.customizable,
      fragile: draft.fragile,
      complianceNotes: draft.complianceNotes,
      careInstructions: draft.careInstructions,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      seoKeywords: [...draft.seoKeywords],
      msrp: Math.round(draft.msrp),
      currency: draft.currency,
      weight: { ...draft.weight },
      dimensions: { ...draft.dimensions },
    },
  };
}

function generateSku() {
  return `SKU-${Date.now()}-${Math.floor(Math.random() * 90 + 10)}`;
}

function getStageAccent(stage: CatalogStage) {
  switch (stage) {
    case 'Sourcing':
      return 'border-amber-400/60 text-amber-600';
    case 'Evaluation':
      return 'border-sky-400/60 text-sky-600';
    case 'Launch Prep':
      return 'border-purple-400/60 text-purple-600';
    case 'Live':
      return 'border-emerald-400/60 text-emerald-600';
    default:
      return '';
  }
}

function getRiskAccent(risk: DemoCatalogItem['risk']) {
  switch (risk) {
    case 'High':
      return 'border-red-500/60 text-red-600';
    case 'Medium':
      return 'border-amber-500/60 text-amber-600';
    case 'Low':
      return 'border-emerald-500/60 text-emerald-600';
    default:
      return '';
  }
}

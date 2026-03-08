import type {
  CatalogProductsResponse,
  CatalogSearchResponse,
  Collection,
  ProposalStatus,
} from '@patina/types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

type MockStage = 'discovery' | 'onboarding' | 'active' | 'care';

type MockScan = {
  id: string;
  room: string;
  capturedAt: string;
  type: 'glb' | 'usdz';
  previewImage: string;
  dimensions: { width: number; depth: number; height: number; unit: string };
  features: string[];
  quickLookUrl?: string;
  quality: 'good' | 'review';
};

type MockClient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  timezone: string;
  stage: MockStage;
  verificationStatus: 'verified' | 'in_review' | 'pending';
  createdAt: string;
  updatedAt: string;
  totalSpent: number;
  proposalsCount: number;
  projectsCount: number;
  ordersCount: number;
  styleProfileId: string;
  constraints: string[];
  preferences: string[];
  notes?: string;
  lastActivity: string;
  tags: string[];
  budgetRange: { min: number; max: number; currency: string };
  homeType: string;
  assignedDesigner: string;
  scans: MockScan[];
};

type MockProject = {
  id: string;
  clientId: string;
  name: string;
  status: 'planning' | 'active' | 'on-hold' | 'completed';
  budget: number;
  startDate: string;
  endDate?: string;
  progress: number;
  description: string;
  tasks: { total: number; completed: number };
};

type MockOrder = {
  id: string;
  clientId: string;
  orderNumber: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
  paymentStatus: 'pending' | 'paid';
  totalAmount: number;
  itemCount: number;
  createdAt: string;
};

type MockProposalItem = {
  id: string;
  productId: string;
  productName: string;
  brand: string;
  price: number;
  quantity: number;
  imageUrl: string;
  notes?: string;
  status?: 'approved' | 'pending' | 'needs_revision';
  tags?: string[];
};

type MockProposalSection = {
  id: string;
  name: string;
  description?: string;
  items: MockProposalItem[];
};

type MockProposalTimelineEntry = {
  id: string;
  label: string;
  timestamp: string;
  actor: string;
  meta?: string;
};

type MockProposalVersion = {
  id: string;
  label: string;
  summary: string;
  createdAt: string;
  author: string;
};

type MockProposal = {
  id: string;
  clientId: string;
  clientName: string;
  designerId: string;
  title: string;
  status: ProposalStatus;
  targetBudget: number;
  currency: string;
  notes?: string;
  version: number;
  dueDate: string;
  updatedAt: string;
  totalAmount: number;
  itemCount: number;
  approvals: { status: 'pending' | 'approved' | 'changes_requested'; dueDate: string; decisionBy?: string };
  sections: MockProposalSection[];
  timeline: MockProposalTimelineEntry[];
  versions: MockProposalVersion[];
};

type MockProductMedia = {
  id: string;
  type: 'image' | '3d';
  role: 'hero' | 'detail' | 'ambient';
  cdnUrl: string;
  order: number;
};

type MockProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  currency: string;
  tags: string[];
  styleTags: string[];
  materials: string[];
  colors: string[];
  description: string;
  has3D: boolean;
  arSupported: boolean;
  media: MockProductMedia[];
  inventoryStatus: 'in_stock' | 'low_stock' | 'made_to_order';
  leadTimeWeeks: number;
  dimensions: string;
  vendor: string;
  rating: number;
  variants?: Array<{ id: string; name: string; stock: number }>;
  specifications?: Array<{ label: string; value: string }>;
};

type MockThreadMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
  attachments?: Array<{ id: string; name: string; url?: string }>;
};

type MockThread = {
  id: string;
  clientId?: string;
  proposalId?: string;
  title: string;
  status: 'open' | 'waiting' | 'resolved';
  lastMessageAt: string;
  updatedAt: string;
  participants: Array<{ id: string; name: string; role: string }>;
  messages: MockThreadMessage[];
};

type MockPaletteSwatch = { name: string; hex: string; weight: number };

type MockStyleProfile = {
  id: string;
  clientId: string;
  summary: string;
  confidence: number;
  budgetRange: { min: number; max: number; currency: string };
  facets: Array<{ label: string; score: number; rationale: string }>;
  constraints: string[];
  rationale: string[];
  palette: MockPaletteSwatch[];
  quickSignals: Array<{ label: string; value: string }>;
  roomFocus: Array<{ room: string; score: number }>;
  recommendedMaterials: string[];
  moodboard: Array<{ id: string; image: string; note: string }>;
};

type MockTeaching = {
  impact: {
    recLift: number;
    acceptanceDelta: number;
    overrideDrop: number;
    lastSync: string;
  };
  feedbackQueue: Array<{
    id: string;
    clientName: string;
    productName: string;
    tags: string[];
    reason: string;
    action: 'approve' | 'reject' | 'replace' | 'similar';
    recommendation: string;
    budgetFit: string;
    image: string;
  }>;
  labels: Array<{
    id: string;
    name: string;
    description: string;
    usage: number;
    lastApplied: string;
  }>;
  rules: Array<{
    id: string;
    name: string;
    impact: string;
    lastTriggered: string;
    predicate: string;
  }>;
  timeline: Array<{
    id: string;
    label: string;
    timestamp: string;
    details: string;
  }>;
};

type MockDashboardSnapshot = {
  hero: {
    greeting: string;
    focus: string;
    nextAction: string;
  };
  stats: Array<{ id: string; label: string; value: string; delta: string; trend: 'up' | 'down' | 'flat' }>;
  pipeline: Array<{
    id: string;
    clientName: string;
    stage: string;
    milestone: string;
    dueLabel: string;
    status: 'on-track' | 'at-risk' | 'blocked';
  }>;
  alerts: Array<{ id: string; severity: 'info' | 'warning' | 'critical'; title: string; detail: string }>;
  updates: Array<{ id: string; label: string; detail: string; timestamp: string }>;
};

type DesignerMockState = {
  designer: { id: string; name: string; email: string };
  clients: MockClient[];
  projects: MockProject[];
  orders: MockOrder[];
  proposals: MockProposal[];
  products: MockProduct[];
  collections: Collection[];
  threads: MockThread[];
  styleProfiles: MockStyleProfile[];
  teaching: MockTeaching;
  dashboard: MockDashboardSnapshot;
};

const designerMockState: DesignerMockState = {
  designer: {
    id: 'designer-jane',
    name: 'Jane Patel',
    email: 'jane.patel@patina.com',
  },
  clients: [],
  projects: [],
  orders: [],
  proposals: [],
  products: [],
  collections: [],
  threads: [],
  styleProfiles: [],
  teaching: {
    impact: {
      recLift: 12,
      acceptanceDelta: 9,
      overrideDrop: 15,
      lastSync: '2024-04-12T07:30:00Z',
    },
    feedbackQueue: [],
    labels: [],
    rules: [],
    timeline: [],
  },
  dashboard: {
    hero: {
      greeting: 'Good morning, Jane',
      focus: 'Finalize Montclair living proposal before Friday',
      nextAction: 'Send revised lighting pack to Sarah',
    },
    stats: [],
    pipeline: [],
    alerts: [],
    updates: [],
  },
};

// Seed clients, projects, etc. (full dataset trimmed for brevity in this snippet)
// -- Clients -----------------------------------------------------------------

designerMockState.clients = [
  {
    id: 'client-sarah',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah.johnson@example.com',
    phone: '+1 (415) 555-0101',
    address: '2438 Pacific Ave, San Francisco, CA',
    timezone: 'America/Los_Angeles',
    stage: 'active',
    verificationStatus: 'verified',
    createdAt: '2023-11-15T09:00:00Z',
    updatedAt: '2024-04-12T07:40:00Z',
    totalSpent: 12850000,
    proposalsCount: 4,
    projectsCount: 2,
    ordersCount: 3,
    styleProfileId: 'style-sarah',
    constraints: ['Two toddlers at home', 'Pet-friendly fabrics only', 'Hide media wiring'],
    preferences: ['Warm neutrals', 'Soft curves', 'Gallery moments'],
    notes: 'Prefers sustainable vendors and 8-week or faster lead times.',
    lastActivity: '2024-04-12T08:30:00Z',
    tags: ['residential', 'priority'],
    budgetRange: { min: 2200000, max: 4500000, currency: 'USD' },
    homeType: 'Pacific Heights condominium',
    assignedDesigner: 'Jane Patel',
    scans: [
      {
        id: 'scan-sarah-living',
        room: 'Living Room',
        capturedAt: '2024-04-05T17:00:00Z',
        type: 'glb',
        previewImage: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=900&q=80',
        dimensions: { width: 182, depth: 150, height: 118, unit: 'in' },
        features: ['14ft ceiling', 'Existing plaster moulding'],
        quickLookUrl: 'https://example.com/scans/sarah-living.usdz',
        quality: 'good',
      },
      {
        id: 'scan-sarah-dining',
        room: 'Dining Room',
        capturedAt: '2024-04-06T19:15:00Z',
        type: 'glb',
        previewImage: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80',
        dimensions: { width: 168, depth: 132, height: 112, unit: 'in' },
        features: ['Existing skylight', 'Load-bearing column to preserve'],
        quickLookUrl: 'https://example.com/scans/sarah-dining.usdz',
        quality: 'review',
      },
    ],
  },
  {
    id: 'client-helix',
    firstName: 'Marcus',
    lastName: 'Reed',
    email: 'marcus.reed@helixbio.com',
    phone: '+1 (206) 555-0144',
    address: '500 Terry Francois Blvd, Seattle, WA',
    timezone: 'America/Los_Angeles',
    stage: 'active',
    verificationStatus: 'verified',
    createdAt: '2023-09-02T10:00:00Z',
    updatedAt: '2024-04-11T21:10:00Z',
    totalSpent: 24180000,
    proposalsCount: 3,
    projectsCount: 1,
    ordersCount: 2,
    styleProfileId: 'style-helix',
    constraints: ['Lab-safe finishes', 'Low VOC requirement', 'No exposed wiring'],
    preferences: ['Future minimalism', 'Integrated lighting', 'Acoustic control'],
    notes: 'C-suite wants bold gesture in main lab lobby. Operations team sensitive to maintenance.',
    lastActivity: '2024-04-11T18:05:00Z',
    tags: ['commercial', 'lab'],
    budgetRange: { min: 8000000, max: 13000000, currency: 'USD' },
    homeType: 'Bio tech HQ retrofit',
    assignedDesigner: 'Jane Patel',
    scans: [
      {
        id: 'scan-helix-lab',
        room: 'Innovation Lab',
        capturedAt: '2024-04-02T15:20:00Z',
        type: 'glb',
        previewImage: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80',
        dimensions: { width: 320, depth: 240, height: 156, unit: 'in' },
        features: ['Raised access floor', 'Existing data trunk'],
        quickLookUrl: 'https://example.com/scans/helix-lab.usdz',
        quality: 'good',
      },
    ],
  },
  {
    id: 'client-emily',
    firstName: 'Emily',
    lastName: 'Davis',
    email: 'emily.davis@novahospitality.com',
    phone: '+1 (917) 555-0099',
    address: '9 Crosby St, New York, NY',
    timezone: 'America/New_York',
    stage: 'onboarding',
    verificationStatus: 'verified',
    createdAt: '2024-01-22T14:00:00Z',
    updatedAt: '2024-04-10T16:25:00Z',
    totalSpent: 6850000,
    proposalsCount: 2,
    projectsCount: 1,
    ordersCount: 1,
    styleProfileId: 'style-emily',
    constraints: ['Boutique footprint', 'Detachable fixtures', 'Nighttime transformations'],
    preferences: ['Softly saturated palette', 'Textured plaster', 'Sculptural lighting'],
    notes: 'Need opening concept before Memorial Day. Wants to lean into desert dusk vibes.',
    lastActivity: '2024-04-10T12:40:00Z',
    tags: ['hospitality', 'fast-track'],
    budgetRange: { min: 4500000, max: 7500000, currency: 'USD' },
    homeType: 'Boutique hospitality concept',
    assignedDesigner: 'Jane Patel',
    scans: [
      {
        id: 'scan-emily-lobby',
        room: 'Entry Lobby',
        capturedAt: '2024-03-28T20:10:00Z',
        type: 'glb',
        previewImage: 'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=900&q=80',
        dimensions: { width: 140, depth: 110, height: 132, unit: 'in' },
        features: ['Existing terrazzo', 'Exposed beam condition'],
        quickLookUrl: 'https://example.com/scans/emily-lobby.usdz',
        quality: 'good',
      },
    ],
  },
  {
    id: 'client-greenway',
    firstName: 'Imani',
    lastName: 'Lewis',
    email: 'imani.lewis@greenwaydev.com',
    phone: '+1 (646) 555-7744',
    address: '60 Hudson St, New York, NY',
    timezone: 'America/New_York',
    stage: 'care',
    verificationStatus: 'verified',
    createdAt: '2023-04-11T16:00:00Z',
    updatedAt: '2024-04-09T10:00:00Z',
    totalSpent: 3050000,
    proposalsCount: 3,
    projectsCount: 1,
    ordersCount: 2,
    styleProfileId: 'style-greenway',
    constraints: ['Warranty punchlist', 'Need modular fixes'],
    preferences: ['Soft biophilic gestures', 'Matte bronze accents'],
    notes: 'Post-install care; focus on refresh of tenant amenities.',
    lastActivity: '2024-04-07T11:15:00Z',
    tags: ['commercial', 'care'],
    budgetRange: { min: 1800000, max: 3200000, currency: 'USD' },
    homeType: 'Developer amenity refresh',
    assignedDesigner: 'Jane Patel',
    scans: [],
  },
];

// TODO: populate projects, orders, proposals, products, collections, threads, style profiles, teaching, dashboard data, and expose helper functions.

designerMockState.projects = [
  {
    id: 'project-sarah-living',
    clientId: 'client-sarah',
    name: 'Montclair Living Refresh',
    status: 'active',
    budget: 380000000,
    startDate: '2024-02-05T09:00:00Z',
    endDate: '2024-05-18T09:00:00Z',
    progress: 68,
    description: 'Living + dining overhaul with custom millwork, sculpted seating, and layered lighting.',
    tasks: { total: 18, completed: 12 },
  },
  {
    id: 'project-helix-lab',
    clientId: 'client-helix',
    name: 'Helix Bio Innovation Hub',
    status: 'active',
    budget: 1120000000,
    startDate: '2023-12-01T09:00:00Z',
    endDate: '2024-07-30T09:00:00Z',
    progress: 54,
    description: 'Lab lobby, touchdown lounges, and acoustic envelope upgrades with performance lighting.',
    tasks: { total: 26, completed: 14 },
  },
  {
    id: 'project-emily-boutique',
    clientId: 'client-emily',
    name: 'Nova Boutique Concept',
    status: 'planning',
    budget: 620000000,
    startDate: '2024-03-15T09:00:00Z',
    endDate: '2024-08-12T09:00:00Z',
    progress: 28,
    description: 'Hospitality concept kit-of-parts with dusk-inspired palette and transformable fixtures.',
    tasks: { total: 22, completed: 6 },
  },
];

designerMockState.orders = [
  {
    id: 'order-sarah-1',
    clientId: 'client-sarah',
    orderNumber: 'ORD-2404-01',
    status: 'processing',
    paymentStatus: 'paid',
    totalAmount: 8450000,
    itemCount: 6,
    createdAt: '2024-04-08T12:00:00Z',
  },
  {
    id: 'order-helix-1',
    clientId: 'client-helix',
    orderNumber: 'ORD-2403-11',
    status: 'shipped',
    paymentStatus: 'paid',
    totalAmount: 18750000,
    itemCount: 12,
    createdAt: '2024-03-22T10:30:00Z',
  },
  {
    id: 'order-emily-1',
    clientId: 'client-emily',
    orderNumber: 'ORD-2404-07',
    status: 'pending',
    paymentStatus: 'pending',
    totalAmount: 4250000,
    itemCount: 4,
    createdAt: '2024-04-10T15:10:00Z',
  },
];

designerMockState.products = [
  {
    id: 'prod-arno-sofa',
    name: 'Arno Modular Sofa',
    brand: 'Patina Studio',
    category: 'Seating',
    price: 480000,
    currency: 'USD',
    tags: ['modular', 'family-friendly'],
    styleTags: ['warm-modern', 'organic'],
    materials: ['Bouclé', 'White Oak'],
    colors: ['Ivory', 'Oak'],
    description: 'Low-profile modular sofa with generous radius corners, reversible cushions, and concealed storage channel.',
    has3D: true,
    arSupported: true,
    media: [
      {
        id: 'media-arno-hero',
        type: 'image',
        role: 'hero',
        cdnUrl: 'https://images.unsplash.com/photo-1501045661006-fcebe0257c3f?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
      {
        id: 'media-arno-detail',
        type: 'image',
        role: 'detail',
        cdnUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80',
        order: 1,
      },
    ],
    inventoryStatus: 'made_to_order',
    leadTimeWeeks: 8,
    dimensions: '120" W x 64" D x 32" H',
    vendor: 'Patina Atelier',
    rating: 4.9,
    variants: [
      { id: 'arno-ivory', name: 'Ivory Bouclé', stock: 6 },
      { id: 'arno-mocha', name: 'Mocha Linen', stock: 3 },
    ],
    specifications: [
      { label: 'Seat Height', value: '18"' },
      { label: 'Cushion Fill', value: 'Feather & memory foam blend' },
    ],
  },
  {
    id: 'prod-strata-coffee',
    name: 'Strata Stone Coffee Table',
    brand: 'Studio Scribe',
    category: 'Tables',
    price: 215000,
    currency: 'USD',
    tags: ['stone', 'sculpted'],
    styleTags: ['organic', 'minimal'],
    materials: ['Travertine', 'Plaster'],
    colors: ['Bone'],
    description: 'Solid carved travertine slab with ribbon edge detail and inset plinth base for floating effect.',
    has3D: false,
    arSupported: false,
    media: [
      {
        id: 'media-strata-hero',
        type: 'image',
        role: 'hero',
        cdnUrl: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    inventoryStatus: 'low_stock',
    leadTimeWeeks: 5,
    dimensions: '52" W x 32" D x 14" H',
    vendor: 'Studio Scribe',
    rating: 4.7,
  },
  {
    id: 'prod-loom-rug',
    name: 'Loom Cloud Rug',
    brand: 'Patina Textiles',
    category: 'Flooring',
    price: 98000,
    currency: 'USD',
    tags: ['hand-tufted', 'custom'],
    styleTags: ['soft', 'tonal'],
    materials: ['New Zealand Wool', 'Tencel'],
    colors: ['Sand', 'Taupe'],
    description: 'Gradient rug with tonal cloud motif and 1.2" high/low pile for a sculpted feel.',
    has3D: false,
    arSupported: false,
    media: [
      {
        id: 'media-loom-hero',
        type: 'image',
        role: 'hero',
        cdnUrl: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    inventoryStatus: 'in_stock',
    leadTimeWeeks: 4,
    dimensions: 'Custom up to 15ft',
    vendor: 'Patina Textiles',
    rating: 4.8,
  },
  {
    id: 'prod-orbit-sconce',
    name: 'Orbit Brass Sconce',
    brand: 'Fieldwork Lighting',
    category: 'Lighting',
    price: 64000,
    currency: 'USD',
    tags: ['dimmable', 'UL-listed'],
    styleTags: ['sculptural', 'modern'],
    materials: ['Brushed Brass', 'Opal Glass'],
    colors: ['Brass'],
    description: 'Orbital sconce with hand-blown opal shade and pivoting backplate for directional washes.',
    has3D: false,
    arSupported: false,
    media: [
      {
        id: 'media-orbit-hero',
        type: 'image',
        role: 'hero',
        cdnUrl: 'https://images.unsplash.com/photo-1501045661006-fcebe0257c3f?auto=format&fit=crop&w=900&q=80',
        order: 0,
      },
    ],
    inventoryStatus: 'in_stock',
    leadTimeWeeks: 3,
    dimensions: '12" Ø x 6" D',
    vendor: 'Fieldwork Lighting',
    rating: 4.6,
  },
  {
    id: 'prod-halo-chair',
    name: 'Halo Dining Chair',
    brand: 'Atelier Arc',
    category: 'Seating',
    price: 125000,
    currency: 'USD',
    tags: ['stackable', 'performance-fabric'],
    styleTags: ['sleek', 'architectural'],
    materials: ['Powdercoat Steel', 'Linen Blend'],
    colors: ['Terracotta', 'Ivory'],
    description: 'Stackable dining chair with elliptical back hoop, powdercoat frame, and stain-guard cushion.',
    has3D: true,
    arSupported: true,
    media: [
      {
        id: 'media-halo-hero',
        type: 'image',
        role: 'hero',
        cdnUrl: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    inventoryStatus: 'in_stock',
    leadTimeWeeks: 6,
    dimensions: '21" W x 22" D x 31" H',
    vendor: 'Atelier Arc',
    rating: 4.5,
  },
  {
    id: 'prod-haze-panel',
    name: 'Haze Acoustic Panel',
    brand: 'Aesthete Labs',
    category: 'Wall Systems',
    price: 182000,
    currency: 'USD',
    tags: ['acoustic', 'commercial'],
    styleTags: ['future', 'technical'],
    materials: ['PET Felt', 'Bronzed Mesh'],
    colors: ['Graphite'],
    description: 'Parametric acoustic fins with integrated LED channel, Class-A fire rating, and tool-free mounting.',
    has3D: true,
    arSupported: false,
    media: [
      {
        id: 'media-haze-hero',
        type: 'image',
        role: 'hero',
        cdnUrl: 'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    inventoryStatus: 'made_to_order',
    leadTimeWeeks: 7,
    dimensions: 'Panel: 24" W x 108" H',
    vendor: 'Aesthete Labs',
    rating: 4.8,
  },
  {
    id: 'prod-cascade-pendant',
    name: 'Cascade Pendant Trio',
    brand: 'Studio Lantern',
    category: 'Lighting',
    price: 298000,
    currency: 'USD',
    tags: ['dimmable', 'UL-listed'],
    styleTags: ['statement', 'warm'],
    materials: ['Patina Brass', 'Hand-cast Glass'],
    colors: ['Champagne'],
    description: 'Triple pendant cluster inspired by cascading water droplets with programmable drivers.',
    has3D: false,
    arSupported: false,
    media: [
      {
        id: 'media-cascade-hero',
        type: 'image',
        role: 'hero',
        cdnUrl: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    inventoryStatus: 'low_stock',
    leadTimeWeeks: 10,
    dimensions: 'Drop adjustable 24" - 120"',
    vendor: 'Studio Lantern',
    rating: 4.9,
  },
  {
    id: 'prod-woven-screen',
    name: 'Woven Brass Room Screen',
    brand: 'Maison Patina',
    category: 'Accessories',
    price: 164000,
    currency: 'USD',
    tags: ['folding', 'artisan'],
    styleTags: ['textural', 'statement'],
    materials: ['Raw Brass', 'Cord'],
    colors: ['Antique Brass'],
    description: 'Three-panel folding screen with hand-wrapped cord lattice for soft zoning.',
    has3D: false,
    arSupported: false,
    media: [
      {
        id: 'media-screen-hero',
        type: 'image',
        role: 'hero',
        cdnUrl: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80',
        order: 0,
      },
    ],
    inventoryStatus: 'in_stock',
    leadTimeWeeks: 4,
    dimensions: '54" W x 72" H',
    vendor: 'Maison Patina',
    rating: 4.4,
  },
];

designerMockState.collections = [
  {
    id: 'collection-gallery-loft',
    name: 'Gallery Loft Essentials',
    slug: 'gallery-loft-essentials',
    type: 'manual',
    description: 'Curated mix for converted lofts: sculpted seating, acoustic wraps, gallery-ready lighting.',
    heroImage: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1600&q=80',
    status: 'published',
    featured: true,
    tags: ['loft', 'warm'],
    items: [
      { id: 'collection-gallery-item-1', collectionId: 'collection-gallery-loft', productId: 'prod-arno-sofa', displayOrder: 1, addedAt: new Date('2024-03-01T10:00:00Z') },
      { id: 'collection-gallery-item-2', collectionId: 'collection-gallery-loft', productId: 'prod-strata-coffee', displayOrder: 2, addedAt: new Date('2024-03-01T10:05:00Z') },
      { id: 'collection-gallery-item-3', collectionId: 'collection-gallery-loft', productId: 'prod-orbit-sconce', displayOrder: 3, addedAt: new Date('2024-03-01T10:07:00Z') },
    ],
    productCount: 3,
    createdAt: new Date('2024-02-28T09:00:00Z'),
    updatedAt: new Date('2024-04-05T09:00:00Z'),
  },
  {
    id: 'collection-desert-dusk',
    name: 'Desert Dusk Hospitality',
    slug: 'desert-dusk-hospitality',
    type: 'manual',
    description: 'Textural palette for boutique hotels inspired by desert sunsets.',
    heroImage: 'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=1600&q=80',
    status: 'published',
    featured: true,
    tags: ['hospitality', 'palette'],
    items: [
      { id: 'collection-desert-item-1', collectionId: 'collection-desert-dusk', productId: 'prod-loom-rug', displayOrder: 1, addedAt: new Date('2024-03-15T09:00:00Z') },
      { id: 'collection-desert-item-2', collectionId: 'collection-desert-dusk', productId: 'prod-halo-chair', displayOrder: 2, addedAt: new Date('2024-03-15T09:05:00Z') },
      { id: 'collection-desert-item-3', collectionId: 'collection-desert-dusk', productId: 'prod-cascade-pendant', displayOrder: 3, addedAt: new Date('2024-03-15T09:07:00Z') },
    ],
    productCount: 3,
    createdAt: new Date('2024-03-10T09:00:00Z'),
    updatedAt: new Date('2024-04-08T09:00:00Z'),
  },
  {
    id: 'collection-lab-kit',
    name: 'Future Lab Kit',
    slug: 'future-lab-kit',
    type: 'manual',
    description: 'High-performance finishes and fixtures for R&D workspaces.',
    heroImage: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1600&q=80',
    status: 'published',
    featured: true,
    tags: ['lab', 'commercial'],
    items: [
      { id: 'collection-lab-item-1', collectionId: 'collection-lab-kit', productId: 'prod-haze-panel', displayOrder: 1, addedAt: new Date('2024-02-10T10:00:00Z') },
      { id: 'collection-lab-item-2', collectionId: 'collection-lab-kit', productId: 'prod-woven-screen', displayOrder: 2, addedAt: new Date('2024-02-10T10:05:00Z') },
    ],
    productCount: 2,
    createdAt: new Date('2024-02-05T09:00:00Z'),
    updatedAt: new Date('2024-04-03T09:00:00Z'),
  },
];

designerMockState.proposals = [
  {
    id: 'proposal-montclair-living',
    clientId: 'client-sarah',
    clientName: 'Sarah Johnson',
    designerId: designerMockState.designer.id,
    title: 'Montclair Living Experience',
    status: 'draft',
    targetBudget: 420000000,
    currency: 'USD',
    notes: 'Anchor the room with the Arno sofa, soften transitions, and keep storage hidden.',
    version: 3,
    dueDate: '2024-04-19T17:00:00Z',
    updatedAt: '2024-04-12T08:00:00Z',
    totalAmount: 372500000,
    itemCount: 8,
    approvals: { status: 'pending', dueDate: '2024-04-22T12:00:00Z', decisionBy: 'Sarah Johnson' },
    sections: [
      {
        id: 'section-lounge',
        name: 'Conversation Lounge',
        description: 'Curved seating moments and sculpted lighting.',
        items: [
          {
            id: 'item-arno',
            productId: 'prod-arno-sofa',
            productName: 'Arno Modular Sofa',
            brand: 'Patina Studio',
            price: 480000,
            quantity: 4,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-arno-sofa')?.media[0]?.cdnUrl || '',
            status: 'approved',
            tags: ['hero'],
          },
          {
            id: 'item-orbit',
            productId: 'prod-orbit-sconce',
            productName: 'Orbit Brass Sconce',
            brand: 'Fieldwork Lighting',
            price: 64000,
            quantity: 4,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-orbit-sconce')?.media[0]?.cdnUrl || '',
            status: 'pending',
          },
        ],
      },
      {
        id: 'section-foundation',
        name: 'Foundations',
        description: 'Soft layering pieces for warmth.',
        items: [
          {
            id: 'item-loom',
            productId: 'prod-loom-rug',
            productName: 'Loom Cloud Rug',
            brand: 'Patina Textiles',
            price: 98000,
            quantity: 2,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-loom-rug')?.media[0]?.cdnUrl || '',
            status: 'approved',
          },
          {
            id: 'item-strata',
            productId: 'prod-strata-coffee',
            productName: 'Strata Stone Coffee Table',
            brand: 'Studio Scribe',
            price: 215000,
            quantity: 1,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-strata-coffee')?.media[0]?.cdnUrl || '',
            status: 'needs_revision',
            notes: 'Client asked for lighter stone option.',
          },
        ],
      },
    ],
    timeline: [
      { id: 'tl-created', label: 'Created draft', timestamp: '2024-03-28T10:00:00Z', actor: 'Jane Patel' },
      { id: 'tl-version', label: 'Version 3 saved', timestamp: '2024-04-10T17:45:00Z', actor: 'Jane Patel', meta: 'Added statement lighting' },
      { id: 'tl-shared', label: 'Preview shared internally', timestamp: '2024-04-12T07:45:00Z', actor: 'Miles' },
    ],
    versions: [
      { id: 'ver-1', label: 'V1 Mood', summary: 'Initial palette + layout', createdAt: '2024-03-28T10:00:00Z', author: 'Jane Patel' },
      { id: 'ver-2', label: 'V2 Lighting', summary: 'Added Orbit sconces + storage', createdAt: '2024-04-05T15:20:00Z', author: 'Jane Patel' },
      { id: 'ver-3', label: 'V3 Story', summary: 'Layered art wall + updated rug', createdAt: '2024-04-10T17:45:00Z', author: 'Jane Patel' },
    ],
  },
  {
    id: 'proposal-helix-lab',
    clientId: 'client-helix',
    clientName: 'Helix Bio HQ',
    designerId: designerMockState.designer.id,
    title: 'Innovation Hub Capsule',
    status: 'sent',
    targetBudget: 980000000,
    currency: 'USD',
    notes: 'Pair high-performance finishes with tactile lounge pieces for exec briefings.',
    version: 2,
    dueDate: '2024-04-08T18:00:00Z',
    updatedAt: '2024-04-09T09:30:00Z',
    totalAmount: 915000000,
    itemCount: 6,
    approvals: { status: 'pending', dueDate: '2024-04-15T12:00:00Z', decisionBy: 'Marcus Reed' },
    sections: [
      {
        id: 'section-lab-lounge',
        name: 'Lounge Spine',
        items: [
          {
            id: 'item-haze',
            productId: 'prod-haze-panel',
            productName: 'Haze Acoustic Panel',
            brand: 'Aesthete Labs',
            price: 182000,
            quantity: 12,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-haze-panel')?.media[0]?.cdnUrl || '',
            status: 'approved',
          },
          {
            id: 'item-halo',
            productId: 'prod-halo-chair',
            productName: 'Halo Dining Chair',
            brand: 'Atelier Arc',
            price: 125000,
            quantity: 14,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-halo-chair')?.media[0]?.cdnUrl || '',
            status: 'pending',
          },
        ],
      },
      {
        id: 'section-lighting',
        name: 'Lighting Statements',
        items: [
          {
            id: 'item-cascade',
            productId: 'prod-cascade-pendant',
            productName: 'Cascade Pendant Trio',
            brand: 'Studio Lantern',
            price: 298000,
            quantity: 3,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-cascade-pendant')?.media[0]?.cdnUrl || '',
            status: 'approved',
          },
        ],
      },
    ],
    timeline: [
      { id: 'helix-created', label: 'Created draft', timestamp: '2024-03-15T09:00:00Z', actor: 'Jane Patel' },
      { id: 'helix-review', label: 'Ops feedback received', timestamp: '2024-03-29T11:12:00Z', actor: 'Marcus Reed' },
      { id: 'helix-sent', label: 'Sent to client', timestamp: '2024-04-08T18:05:00Z', actor: 'Jane Patel' },
    ],
    versions: [
      { id: 'helix-v1', label: 'V1', summary: 'Gesture + zoning concepts', createdAt: '2024-03-15T09:00:00Z', author: 'Jane Patel' },
      { id: 'helix-v2', label: 'V2', summary: 'Integrated acoustic system + halo seating', createdAt: '2024-04-07T14:20:00Z', author: 'Jane Patel' },
    ],
  },
  {
    id: 'proposal-nova-coastal',
    clientId: 'client-emily',
    clientName: 'Nova Boutique',
    designerId: designerMockState.designer.id,
    title: 'Coastal Dusk Lobby',
    status: 'ready',
    targetBudget: 560000000,
    currency: 'USD',
    notes: 'Leaning into terra tones, sculptural lighting, and soft zoning for events.',
    version: 1,
    dueDate: '2024-04-25T18:00:00Z',
    updatedAt: '2024-04-11T16:10:00Z',
    totalAmount: 498000000,
    itemCount: 5,
    approvals: { status: 'pending', dueDate: '2024-04-26T12:00:00Z', decisionBy: 'Emily Davis' },
    sections: [
      {
        id: 'section-entry',
        name: 'Arrival Sequence',
        items: [
          {
            id: 'item-screen',
            productId: 'prod-woven-screen',
            productName: 'Woven Brass Room Screen',
            brand: 'Maison Patina',
            price: 164000,
            quantity: 2,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-woven-screen')?.media[0]?.cdnUrl || '',
            status: 'pending',
          },
          {
            id: 'item-chair',
            productId: 'prod-halo-chair',
            productName: 'Halo Dining Chair',
            brand: 'Atelier Arc',
            price: 125000,
            quantity: 8,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-halo-chair')?.media[0]?.cdnUrl || '',
            status: 'approved',
          },
        ],
      },
      {
        id: 'section-light',
        name: 'Lighting',
        items: [
          {
            id: 'item-pendant',
            productId: 'prod-cascade-pendant',
            productName: 'Cascade Pendant Trio',
            brand: 'Studio Lantern',
            price: 298000,
            quantity: 2,
            imageUrl: designerMockState.products.find((p) => p.id === 'prod-cascade-pendant')?.media[0]?.cdnUrl || '',
            status: 'pending',
          },
        ],
      },
    ],
    timeline: [
      { id: 'nova-created', label: 'Concept created', timestamp: '2024-04-02T08:15:00Z', actor: 'Jane Patel' },
      { id: 'nova-sourcing', label: 'Vendor availability confirmed', timestamp: '2024-04-09T13:45:00Z', actor: 'Procurement Bot' },
    ],
    versions: [
      { id: 'nova-v1', label: 'V1', summary: 'Opening pass with palette + hero pieces', createdAt: '2024-04-02T08:15:00Z', author: 'Jane Patel' },
    ],
  },
];

designerMockState.threads = [
  {
    id: 'thread-sarah-proposal',
    clientId: 'client-sarah',
    proposalId: 'proposal-montclair-living',
    title: 'Montclair Living Feedback',
    status: 'open',
    lastMessageAt: '2024-04-12T07:55:00Z',
    updatedAt: '2024-04-12T07:55:00Z',
    participants: [
      { id: designerMockState.designer.id, name: 'Jane Patel', role: 'Designer' },
      { id: 'client-sarah', name: 'Sarah Johnson', role: 'Client' },
    ],
    messages: [
      {
        id: 'msg-sarah-1',
        authorId: 'client-sarah',
        authorName: 'Sarah Johnson',
        authorRole: 'Client',
        body: 'Can we explore a lighter coffee table stone with the same footprint?',
        createdAt: '2024-04-12T07:40:00Z',
      },
      {
        id: 'msg-jane-1',
        authorId: designerMockState.designer.id,
        authorName: 'Jane Patel',
        authorRole: 'Designer',
        body: 'Absolutely—I have a honed Calacatta option that keeps the soft profile. Will drop into V4.',
        createdAt: '2024-04-12T07:55:00Z',
      },
    ],
  },
  {
    id: 'thread-helix-ops',
    clientId: 'client-helix',
    proposalId: 'proposal-helix-lab',
    title: 'Ops Review Thread',
    status: 'waiting',
    lastMessageAt: '2024-04-11T18:20:00Z',
    updatedAt: '2024-04-11T18:20:00Z',
    participants: [
      { id: designerMockState.designer.id, name: 'Jane Patel', role: 'Designer' },
      { id: 'client-helix', name: 'Marcus Reed', role: 'Client' },
      { id: 'ops-helix', name: 'Leena Park', role: 'Operations' },
    ],
    messages: [
      {
        id: 'msg-helix-1',
        authorId: 'ops-helix',
        authorName: 'Leena Park',
        authorRole: 'Operations',
        body: 'Need confirmation that the acoustic fins keep clear span for sprinkler coverage.',
        createdAt: '2024-04-11T17:58:00Z',
      },
      {
        id: 'msg-jane-helix',
        authorId: designerMockState.designer.id,
        authorName: 'Jane Patel',
        authorRole: 'Designer',
        body: 'Yes—fins drop to 9’6”, sprinkler elevation is 10’, so we maintain 6” buffer. Added section detail.',
        createdAt: '2024-04-11T18:20:00Z',
      },
    ],
  },
  {
    id: 'thread-emily-lobby',
    clientId: 'client-emily',
    proposalId: 'proposal-nova-coastal',
    title: 'Lobby Palette Chat',
    status: 'open',
    lastMessageAt: '2024-04-10T13:05:00Z',
    updatedAt: '2024-04-10T13:05:00Z',
    participants: [
      { id: designerMockState.designer.id, name: 'Jane Patel', role: 'Designer' },
      { id: 'client-emily', name: 'Emily Davis', role: 'Client' },
    ],
    messages: [
      {
        id: 'msg-emily-1',
        authorId: 'client-emily',
        authorName: 'Emily Davis',
        authorRole: 'Client',
        body: 'Loving the dusk palette. Could we hide the check-in desk with a movable partition?',
        createdAt: '2024-04-10T12:44:00Z',
      },
      {
        id: 'msg-jane-emily',
        authorId: designerMockState.designer.id,
        authorName: 'Jane Patel',
        authorRole: 'Designer',
        body: 'Yes! Adding the woven brass screen in a wider span to create a soft reveal moment.',
        createdAt: '2024-04-10T13:05:00Z',
      },
    ],
  },
];

designerMockState.styleProfiles = [
  {
    id: 'style-sarah',
    clientId: 'client-sarah',
    summary: 'Warm minimalism with art-forward moments, soft edges, and disguised storage.',
    confidence: 0.87,
    budgetRange: { min: 2200000, max: 4500000, currency: 'USD' },
    facets: [
      { label: 'Modern Warmth', score: 92, rationale: 'Consistently flags warm neutrals + brass' },
      { label: 'Organic Forms', score: 78, rationale: 'Selected curved silhouettes during quiz' },
      { label: 'Statement Lighting', score: 65, rationale: 'Requests layered lighting moments' },
    ],
    constraints: ['Hide AV wiring', 'Pet-friendly textiles', '8-week install max'],
    rationale: ['Loves gallery-like walls', 'Needs vinyl storage integrated'],
    palette: [
      { name: 'Porcelain', hex: '#F5F1EB', weight: 32 },
      { name: 'Cider', hex: '#B47652', weight: 18 },
      { name: 'Char', hex: '#2F2A28', weight: 10 },
      { name: 'Moss', hex: '#7C7B66', weight: 8 },
    ],
    quickSignals: [
      { label: 'Budget fit', value: '74% of catalog within target' },
      { label: 'Lead time tolerance', value: '≤ 8 weeks' },
      { label: 'Material focus', value: 'Bouclé, limewash, aged brass' },
    ],
    roomFocus: [
      { room: 'Living', score: 92 },
      { room: 'Dining', score: 74 },
      { room: 'Primary Suite', score: 61 },
    ],
    recommendedMaterials: ['European oak', 'Limewash plaster', 'Aged brass'],
    moodboard: [
      { id: 'sarah-mood-1', image: 'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=800&q=80', note: 'Soft glazing with curved sectional' },
      { id: 'sarah-mood-2', image: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=800&q=80', note: 'Tonal art wall inspiration' },
    ],
  },
  {
    id: 'style-helix',
    clientId: 'client-helix',
    summary: 'High-performance futurism balancing lab neutrality with sculpted hospitality zones.',
    confidence: 0.81,
    budgetRange: { min: 9000000, max: 13000000, currency: 'USD' },
    facets: [
      { label: 'Future Minimalism', score: 88, rationale: 'Prefers monolithic pieces + tech finishes' },
      { label: 'Acoustic Control', score: 72, rationale: 'Flags sound management as priority' },
      { label: 'Flexible Layouts', score: 66, rationale: 'Needs reconfigurable furniture' },
    ],
    constraints: ['Lab safe finishes', 'UL-listed fixtures only', 'No exposed wiring'],
    rationale: ['Exec team wants hero lobby gesture', 'Ops needs cleanable surfaces'],
    palette: [
      { name: 'Graphite', hex: '#333333', weight: 30 },
      { name: 'Chalk', hex: '#F2F2F2', weight: 25 },
      { name: 'Oxide', hex: '#A35D3A', weight: 10 },
      { name: 'Signal Blue', hex: '#1D5B79', weight: 8 },
    ],
    quickSignals: [
      { label: 'Lead time', value: '≤ 12 weeks' },
      { label: 'Sustainability', value: 'Prefers EPD-backed products' },
    ],
    roomFocus: [
      { room: 'Lobby', score: 86 },
      { room: 'Innovation Hub', score: 79 },
      { room: 'Touchdown', score: 62 },
    ],
    recommendedMaterials: ['PET felt', 'Glass fiber reinforced concrete', 'Electroplated metal'],
    moodboard: [
      { id: 'helix-mood-1', image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80', note: 'Layered light ribbons' },
    ],
  },
  {
    id: 'style-emily',
    clientId: 'client-emily',
    summary: 'Desert dusk hospitality palette with transformable spaces for events.',
    confidence: 0.76,
    budgetRange: { min: 4500000, max: 7500000, currency: 'USD' },
    facets: [
      { label: 'Color Saturation', score: 80, rationale: 'Prefers terracotta + dusk tones' },
      { label: 'Transformability', score: 69, rationale: 'Needs movable partitions + hidden check-in' },
      { label: 'Lighting Drama', score: 64, rationale: 'Requests sculptural fixtures' },
    ],
    constraints: ['Small footprint', 'Daily conversions', 'Low maintenance finishes'],
    rationale: ['Wants wow moment for arrival', 'Needs quick resets between events'],
    palette: [
      { name: 'Terracotta', hex: '#C26A4A', weight: 20 },
      { name: 'Sunset Mauve', hex: '#CA9BA6', weight: 15 },
      { name: 'Dune', hex: '#E6D1B1', weight: 30 },
      { name: 'Ink', hex: '#2A1F28', weight: 8 },
    ],
    quickSignals: [
      { label: 'Hospitality codes', value: 'Needs UL + damp rating' },
      { label: 'Install window', value: '3 nights max' },
    ],
    roomFocus: [
      { room: 'Lobby', score: 88 },
      { room: 'Bar', score: 70 },
      { room: 'Guest Suites', score: 55 },
    ],
    recommendedMaterials: ['Plaster', 'Smoked mirror', 'Patina brass'],
    moodboard: [
      { id: 'emily-mood-1', image: 'https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=800&q=80', note: 'Dusk gradient inspiration' },
    ],
  },
  {
    id: 'style-greenway',
    clientId: 'client-greenway',
    summary: 'Care phase focus on durable refreshes with biophilic accents.',
    confidence: 0.69,
    budgetRange: { min: 1800000, max: 3200000, currency: 'USD' },
    facets: [
      { label: 'Care Maintenance', score: 82, rationale: 'Needs easy swap modules' },
      { label: 'Biophilic Layering', score: 58, rationale: 'Prefers brass + greenery' },
    ],
    constraints: ['Active tenants', 'Night installs only'],
    rationale: ['Focus on amenity refresh + warranty punchlist'],
    palette: [
      { name: 'Slate', hex: '#3B3C3E', weight: 22 },
      { name: 'Fern', hex: '#6F8D62', weight: 14 },
      { name: 'Clay', hex: '#A86C4E', weight: 9 },
      { name: 'Linen', hex: '#E4DCD1', weight: 28 },
    ],
    quickSignals: [
      { label: 'Install window', value: '11pm-5am only' },
    ],
    roomFocus: [
      { room: 'Amenity Lounge', score: 68 },
      { room: 'Entry', score: 54 },
    ],
    recommendedMaterials: ['Powdercoat metal', 'Engineered wood'],
    moodboard: [],
  },
];

designerMockState.teaching = {
  impact: {
    recLift: 12,
    acceptanceDelta: 9,
    overrideDrop: 15,
    lastSync: '2024-04-12T07:30:00Z',
  },
  feedbackQueue: [
    {
      id: 'teach-1',
      clientName: 'Sarah Johnson',
      productName: 'Strata Stone Coffee Table',
      tags: ['living', 'hero'],
      reason: 'Tone reads too heavy next to boucle seating',
      action: 'replace',
      recommendation: 'Swap for lighter travertine or microcement option',
      budgetFit: 'Under by 6%',
      image: designerMockState.products.find((p) => p.id === 'prod-strata-coffee')?.media[0]?.cdnUrl || '',
    },
    {
      id: 'teach-2',
      clientName: 'Helix Bio HQ',
      productName: 'Halo Dining Chair',
      tags: ['lab', 'seating'],
      reason: 'Ops flagged cleanability risk on linen',
      action: 'approve',
      recommendation: 'Keep design, apply nano-guard finish + spec darker fabric',
      budgetFit: 'On target',
      image: designerMockState.products.find((p) => p.id === 'prod-halo-chair')?.media[0]?.cdnUrl || '',
    },
    {
      id: 'teach-3',
      clientName: 'Nova Boutique',
      productName: 'Cascade Pendant Trio',
      tags: ['lighting', 'hospitality'],
      reason: 'Needs damp rating for bar adjacency',
      action: 'similar',
      recommendation: 'Surface-match finish but move to UL damp-rated sibling',
      budgetFit: 'Over by 4%',
      image: designerMockState.products.find((p) => p.id === 'prod-cascade-pendant')?.media[0]?.cdnUrl || '',
    },
  ],
  labels: [
    {
      id: 'label-warm-modern',
      name: 'Warm Modern Core',
      description: 'Rounded silhouettes, warm metals, tonal art walls',
      usage: 24,
      lastApplied: '2024-04-12T07:10:00Z',
    },
    {
      id: 'label-lab-safe',
      name: 'Lab Safe Priority',
      description: 'UL-listed, bleach cleanable, non-porous',
      usage: 18,
      lastApplied: '2024-04-11T18:05:00Z',
    },
    {
      id: 'label-dusk-palette',
      name: 'Dusk Palette',
      description: 'Terracotta, mauve, smoked bronze accents',
      usage: 9,
      lastApplied: '2024-04-10T12:20:00Z',
    },
  ],
  rules: [
    {
      id: 'rule-soft-storage',
      name: 'Hide Storage in Living',
      impact: 'Reduced overrides 14%',
      lastTriggered: '2024-04-09T09:18:00Z',
      predicate: "category == 'Seating' AND tags CONTAINS 'storage'",
    },
    {
      id: 'rule-lab-finish',
      name: 'Lab Finish Compliance',
      impact: 'Kept rec accuracy 96%',
      lastTriggered: '2024-04-11T17:55:00Z',
      predicate: "clientTag == 'lab' => materials exclude 'linen'",
    },
  ],
  timeline: [
    {
      id: 'teach-tl-1',
      label: 'Override drop recorded',
      timestamp: '2024-04-12T07:32:00Z',
      details: '15% fewer manual overrides week over week',
    },
    {
      id: 'teach-tl-2',
      label: 'Label applied',
      timestamp: '2024-04-11T18:05:00Z',
      details: "Applied 'Lab Safe Priority' to Halo seating",
    },
    {
      id: 'teach-tl-3',
      label: 'Rule published',
      timestamp: '2024-04-10T14:15:00Z',
      details: 'Dusk palette rule now live for hospitality accounts',
    },
  ],
};

designerMockState.dashboard = {
  hero: {
    greeting: 'Good morning, Jane',
    focus: 'Montclair living concept leaves today',
    nextAction: 'Record feedback for Strata table swap',
  },
  stats: [
    { id: 'clients', label: 'Active clients', value: '8', delta: '+2 vs last week', trend: 'up' },
    { id: 'proposals', label: 'Proposals in flight', value: '5', delta: '3 awaiting review', trend: 'flat' },
    { id: 'teaching', label: 'Teaching impact', value: '+12% rec lift', delta: '15 min ago', trend: 'up' },
    { id: 'messages', label: 'Replies needed', value: '3', delta: 'Sarah, Helix ops', trend: 'down' },
  ],
  pipeline: [
    { id: 'client-sarah', clientName: 'Sarah Johnson', stage: 'Style review', milestone: 'Share V4', dueLabel: 'Due in 2d', status: 'on-track' },
    { id: 'client-helix', clientName: 'Helix Bio HQ', stage: 'Ops approval', milestone: 'Sign-off acoustics', dueLabel: 'Waiting', status: 'at-risk' },
    { id: 'client-emily', clientName: 'Nova Boutique', stage: 'Material hold', milestone: 'Reserve pendant', dueLabel: 'Fri', status: 'on-track' },
    { id: 'client-greenway', clientName: 'Greenway Dev', stage: 'Care sprint', milestone: 'Night install', dueLabel: 'Sun', status: 'blocked' },
  ],
  alerts: [
    { id: 'alert-stock', severity: 'warning', title: 'Cascade Pendant Trio', detail: 'Only 2 sets left in stock. Place hold within 24h.' },
    { id: 'alert-order', severity: 'info', title: 'Order ORD-2404-01', detail: 'Processing delay flagged—carrier swap suggested.' },
  ],
  updates: [
    { id: 'update-1', label: 'Proposal viewed', detail: 'Sarah opened Montclair proposal (3m dwell)', timestamp: '45m ago' },
    { id: 'update-2', label: 'Feedback logged', detail: 'Ops added lab compliance note', timestamp: '18h ago' },
    { id: 'update-3', label: 'Teaching sync', detail: 'Override drop -15% after warm modern label', timestamp: '1d ago' },
  ],
};

type ClientListParams = {
  search?: string;
  page?: number;
  limit?: number;
};

type ProposalListParams = {
  status?: ProposalStatus;
  clientId?: string;
};

type ProductFilterInput = {
  categoryId?: string;
  priceMin?: number;
  priceMax?: number;
  brand?: string;
  tags?: string[];
  materials?: string[];
  page?: number;
  pageSize?: number;
  take?: number;
};

type ThreadFilter = {
  clientId?: string;
  proposalId?: string;
};

const paginate = <T>(items: T[], page = 1, pageSize = items.length || 1) => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

const matchesSearch = (value: string, search: string) =>
  value.toLowerCase().includes(search.trim().toLowerCase());

function getClients(params: ClientListParams = {}) {
  const { search, page = 1, limit = designerMockState.clients.length } = params;
  let filtered = designerMockState.clients;

  if (search) {
    filtered = filtered.filter((client) =>
      [client.firstName, client.lastName, client.email, client.homeType]
        .filter(Boolean)
        .some((field) => matchesSearch(field ?? '', search))
    );
  }

  const pageItems = paginate(filtered, page, limit);

  return {
    data: pageItems.map((client) => ({
      ...clone(client),
      name: `${client.firstName} ${client.lastName}`.trim(),
    })),
    meta: { total: filtered.length, page, pageSize: limit },
  };
}

function getClientById(id: string) {
  const client = designerMockState.clients.find((c) => c.id === id);
  return client ? { ...clone(client), name: `${client.firstName} ${client.lastName}` } : null;
}

function getClientProjects(clientId: string) {
  return clone(designerMockState.projects.filter((project) => project.clientId === clientId));
}

function getClientOrders(clientId: string) {
  return clone(designerMockState.orders.filter((order) => order.clientId === clientId));
}

function getProposals(params: ProposalListParams = {}) {
  const { status, clientId } = params;
  let proposals = designerMockState.proposals;

  if (status) {
    proposals = proposals.filter((proposal) => proposal.status === status);
  }

  if (clientId) {
    proposals = proposals.filter((proposal) => proposal.clientId === clientId);
  }

  return {
    data: clone(
      proposals.map((proposal) => ({
        id: proposal.id,
        title: proposal.title,
        clientId: proposal.clientId,
        clientName: proposal.clientName,
        status: proposal.status,
        itemCount: proposal.itemCount,
        totalAmount: proposal.totalAmount,
        updatedAt: proposal.updatedAt,
        targetBudget: proposal.targetBudget,
        dueDate: proposal.dueDate,
      }))
    ),
  };
}

function getProposalById(id: string) {
  const proposal = designerMockState.proposals.find((p) => p.id === id);
  return proposal ? clone(proposal) : null;
}

const applyProductFilters = (products: MockProduct[], filters: ProductFilterInput = {}) => {
  const { priceMin, priceMax, brand, tags, materials } = filters;

  return products.filter((product) => {
    if (priceMin !== undefined && product.price < priceMin) return false;
    if (priceMax !== undefined && product.price > priceMax) return false;
    if (brand && product.brand !== brand) return false;
    if (tags && tags.length > 0 && !tags.every((tag) => product.tags.includes(tag))) return false;
    if (materials && materials.length > 0 && !materials.every((mat) => product.materials.includes(mat))) return false;
    return true;
  });
};

const buildFacets = (products: MockProduct[]) => ({
  category: buildCount(products.map((p) => p.category)),
  brand: buildCount(products.map((p) => p.brand)),
  materials: buildCount(products.flatMap((p) => p.materials)),
  style: buildCount(products.flatMap((p) => p.styleTags)),
});

function buildCount(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function getProducts(filters: ProductFilterInput = {}): CatalogProductsResponse {
  const { page = 1, pageSize = filters.take ?? 12 } = filters;
  const filtered = applyProductFilters(designerMockState.products, filters);
  const items = paginate(filtered, page, pageSize);

  return {
    products: clone(items),
    meta: {
      total: filtered.length,
      page,
      pageSize,
    },
  };
}

function parseFilterString(filterString?: string): ProductFilterInput {
  if (!filterString) return {};
  try {
    const parsed = JSON.parse(filterString);
    return parsed;
  } catch (error) {
    console.warn('Failed to parse filter string', error);
    return {};
  }
}

function searchProducts(params: { q?: string; filters?: string; limit?: number }): CatalogSearchResponse {
  const { q, filters: encodedFilters, limit = 24 } = params;
  const filters = parseFilterString(encodedFilters);
  let results = applyProductFilters(designerMockState.products, filters);

  if (q) {
    const query = q.toLowerCase();
    results = results.filter((product) =>
      [product.name, product.brand, product.description, product.category]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }

  return {
    results: clone(results.slice(0, limit)),
    total: results.length,
    limit,
    facets: buildFacets(results),
  };
}

function getSimilarProducts(productId: string, limit = 6) {
  const target = designerMockState.products.find((product) => product.id === productId);
  if (!target) {
    return { products: [] };
  }

  const scored = designerMockState.products
    .filter((product) => product.id !== productId)
    .map((product) => {
      const sharedTags = product.tags.filter((tag) => target.tags.includes(tag)).length;
      const sharedStyle = product.styleTags.filter((tag) => target.styleTags.includes(tag)).length;
      return { product, score: sharedTags + sharedStyle };
    })
    .sort((a, b) => b.score - a.score);

  return { products: clone(scored.slice(0, limit).map((entry) => entry.product)) };
}

function getThreads(params: ThreadFilter = {}) {
  const { clientId, proposalId } = params;
  let threads = designerMockState.threads;
  if (clientId) {
    threads = threads.filter((thread) => thread.clientId === clientId);
  }
  if (proposalId) {
    threads = threads.filter((thread) => thread.proposalId === proposalId);
  }
  return clone(threads);
}

function getThreadById(id: string) {
  const thread = designerMockState.threads.find((t) => t.id === id);
  return thread ? clone(thread) : null;
}

function addThreadMessage(threadId: string, data: { bodyText?: string; bodyMd?: string }) {
  const thread = designerMockState.threads.find((t) => t.id === threadId);
  if (!thread) {
    throw new Error('Thread not found');
  }
  const newMessage: MockThreadMessage = {
    id: `mock-${Date.now()}`,
    authorId: designerMockState.designer.id,
    authorName: designerMockState.designer.name,
    authorRole: 'Designer',
    body: data.bodyText || data.bodyMd || '',
    createdAt: new Date().toISOString(),
  };
  thread.messages.push(newMessage);
  thread.lastMessageAt = newMessage.createdAt;
  thread.updatedAt = newMessage.createdAt;
  return clone(newMessage);
}

function getStyleProfile(id: string) {
  const profile = designerMockState.styleProfiles.find((style) => style.id === id);
  return profile ? clone(profile) : null;
}

function getTeachingInsights() {
  return clone(designerMockState.teaching);
}

function getDashboardSnapshot() {
  return clone(designerMockState.dashboard);
}

function getCollections() {
  return clone(designerMockState.collections);
}

function getFeaturedCollections(limit = 3) {
  return clone(
    designerMockState.collections.filter((collection) => collection.featured).slice(0, limit)
  );
}

function getProductById(id: string) {
  const product = designerMockState.products.find((p) => p.id === id);
  return product ? clone(product) : null;
}

function getProductBySlug(slug: string) {
  const product =
    designerMockState.products.find(
      (p) => p.id === slug || p.name.toLowerCase().replace(/\\s+/g, '-') === slug
    ) || null;
  return product ? clone(product) : null;
}

function getProjects(filters: ProjectFilterInput = {}) {
  const { status, clientId } = filters;
  let projects = designerMockState.projects;
  if (status) {
    projects = projects.filter((project) => project.status === status);
  }
  if (clientId) {
    projects = projects.filter((project) => project.clientId === clientId);
  }
  return clone(projects);
}

function getProjectById(id: string) {
  const project = designerMockState.projects.find((proj) => proj.id === id);
  return project ? clone(project) : null;
}

export const mockData = {
  getClients,
  getClientById,
  getClientProjects,
  getClientOrders,
  getProposals,
  getProposalById,
  getProducts,
  searchProducts,
  getProductById,
  getProductBySlug,
  getSimilarProducts,
  getThreads,
  getThreadById,
  addThreadMessage,
  getStyleProfile,
  getTeachingInsights,
  getDashboardSnapshot,
  getCollections,
  getFeaturedCollections,
  getProjects,
  getProjectById,
};

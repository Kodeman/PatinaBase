import type { Order, User } from '@/types';

/**
 * Shared mock data used across the admin portal UI to guarantee that
 * complex surfaces render even when backend services are unavailable.
 * These objects intentionally resemble production payloads so the UI
 * components do not need to be aware of the data source.
 */

// -----------------------------------------------------------------------------
// Analytics & Reporting
// -----------------------------------------------------------------------------

export interface AnalyticsPoint {
  label: string;
  activeUsers: number;
  designersVerified: number;
  orders: number;
  revenue: number;
}

export const analyticsTrend: AnalyticsPoint[] = [
  { label: 'May', activeUsers: 12400, designersVerified: 310, orders: 420, revenue: 54000 },
  { label: 'Jun', activeUsers: 13250, designersVerified: 338, orders: 455, revenue: 56800 },
  { label: 'Jul', activeUsers: 14900, designersVerified: 376, orders: 502, revenue: 61200 },
  { label: 'Aug', activeUsers: 15840, designersVerified: 402, orders: 530, revenue: 64000 },
  { label: 'Sep', activeUsers: 16780, designersVerified: 431, orders: 562, revenue: 69850 },
  { label: 'Oct', activeUsers: 17410, designersVerified: 458, orders: 588, revenue: 72100 },
  { label: 'Nov', activeUsers: 18190, designersVerified: 482, orders: 614, revenue: 75240 },
  { label: 'Dec', activeUsers: 19320, designersVerified: 516, orders: 645, revenue: 81230 },
];

export const channelPerformance = [
  { channel: 'Marketplace', orders: 312, revenue: 82000, contribution: 48 },
  { channel: 'Designer Shop', orders: 187, revenue: 61000, contribution: 36 },
  { channel: 'Wholesale', orders: 96, revenue: 38000, contribution: 16 },
];

export const conversionFunnel = [
  { step: 'Sessions', value: 52810, change: '+4.2%' },
  { step: 'Product Views', value: 32040, change: '+2.1%' },
  { step: 'Adds to Cart', value: 9820, change: '+1.4%' },
  { step: 'Checkouts', value: 4310, change: '+0.8%' },
  { step: 'Completed Orders', value: 645, change: '+0.6%' },
];

export const geoBreakdown = [
  { region: 'United States', percent: 48, trend: '+3%' },
  { region: 'Canada', percent: 18, trend: '+1%' },
  { region: 'United Kingdom', percent: 14, trend: '+2%' },
  { region: 'Germany', percent: 9, trend: '+0.4%' },
  { region: 'Australia', percent: 6, trend: 'Flat' },
];

export const topProducts = [
  {
    id: 'prd_walnut_table',
    name: 'Modern Walnut Dining Table',
    sku: 'DIN-204',
    category: 'Dining',
    views: 18234,
    conversions: 214,
    revenue: 68500,
    availability: 'published',
    margin: '42%',
  },
  {
    id: 'prd_velvet_sofa',
    name: 'Channel Velvet Sofa',
    sku: 'LIV-112',
    category: 'Living Room',
    views: 14382,
    conversions: 176,
    revenue: 58210,
    availability: 'published',
    margin: '39%',
  },
  {
    id: 'prd_brass_lamp',
    name: 'Brass Arc Floor Lamp',
    sku: 'LGT-076',
    category: 'Lighting',
    views: 10241,
    conversions: 248,
    revenue: 32490,
    availability: 'scheduled',
    margin: '48%',
  },
  {
    id: 'prd_boucle_chair',
    name: 'Bouclé Accent Chair',
    sku: 'LIV-221',
    category: 'Living Room',
    views: 9850,
    conversions: 163,
    revenue: 29840,
    availability: 'published',
    margin: '44%',
  },
  {
    id: 'prd_marble_coffee',
    name: 'Carrara Marble Coffee Table',
    sku: 'LIV-301',
    category: 'Living Room',
    views: 8742,
    conversions: 129,
    revenue: 41200,
    availability: 'draft',
    margin: '37%',
  },
];

// -----------------------------------------------------------------------------
// Media Management
// -----------------------------------------------------------------------------

export type MediaAssetKind = 'image' | 'model3d' | 'video';

export interface MediaAssetPreview {
  id: string;
  title: string;
  productSku: string;
  kind: MediaAssetKind;
  role: 'hero' | 'detail' | 'lifestyle' | 'ar' | 'variant';
  resolution: string;
  sizeMb: number;
  status: 'ready' | 'processing' | 'queued' | 'failed';
  owner: string;
  updatedAt: string;
  checksum: string;
  issues?: string[];
  accentColor: string;
}

export const mediaAssets: MediaAssetPreview[] = [
  {
    id: 'asset-hero-001',
    title: 'Walnut Dining Table — Hero',
    productSku: 'DIN-204',
    kind: 'image',
    role: 'hero',
    resolution: '4200 × 2800',
    sizeMb: 6.2,
    status: 'ready',
    owner: 'Holly Becker',
    updatedAt: '2024-10-08T14:12:00Z',
    checksum: 'a91f-22c8',
    accentColor: 'from-amber-200/70 via-orange-200/60 to-amber-100/90',
  },
  {
    id: 'asset-lifestyle-014',
    title: 'Channel Velvet Sofa — Lifestyle',
    productSku: 'LIV-112',
    kind: 'image',
    role: 'lifestyle',
    resolution: '3840 × 2160',
    sizeMb: 5.1,
    status: 'ready',
    owner: 'Diego Jimenez',
    updatedAt: '2024-10-07T21:40:00Z',
    checksum: 'b73e-190a',
    issues: ['Shadow cleanup'],
    accentColor: 'from-emerald-200/70 via-teal-200/60 to-cyan-100/80',
  },
  {
    id: 'asset-detail-022',
    title: 'Bouclé Accent Chair — Detail',
    productSku: 'LIV-221',
    kind: 'image',
    role: 'detail',
    resolution: '3000 × 3000',
    sizeMb: 4.3,
    status: 'ready',
    owner: 'Grace Lin',
    updatedAt: '2024-10-08T10:05:00Z',
    checksum: 'f107-b912',
    accentColor: 'from-violet-200/70 via-fuchsia-200/60 to-pink-100/90',
  },
  {
    id: 'asset-3d-004',
    title: 'Carrara Coffee Table — 3D',
    productSku: 'LIV-301',
    kind: 'model3d',
    role: 'ar',
    resolution: '2.1M tris',
    sizeMb: 18.4,
    status: 'processing',
    owner: 'Noah Patel',
    updatedAt: '2024-10-08T15:30:00Z',
    checksum: 'd210-44e1',
    issues: ['UV overlap auto-fix'],
    accentColor: 'from-slate-200/70 via-slate-100/80 to-white',
  },
  {
    id: 'asset-hero-018',
    title: 'Brass Arc Floor Lamp — Hero',
    productSku: 'LGT-076',
    kind: 'image',
    role: 'hero',
    resolution: '3600 × 3600',
    sizeMb: 3.7,
    status: 'ready',
    owner: 'Priya Shah',
    updatedAt: '2024-10-06T18:24:00Z',
    checksum: 'e981-54d2',
    accentColor: 'from-yellow-200/70 via-amber-100/80 to-yellow-50',
  },
  {
    id: 'asset-variant-011',
    title: 'Velvet Sofa — Ivory Variant',
    productSku: 'LIV-112',
    kind: 'image',
    role: 'variant',
    resolution: '4096 × 2730',
    sizeMb: 4.9,
    status: 'queued',
    owner: 'Ella McConnell',
    updatedAt: '2024-10-08T15:02:00Z',
    checksum: 'c442-09b7',
    accentColor: 'from-stone-200/70 via-zinc-100/80 to-white',
  },
  {
    id: 'asset-hero-030',
    title: 'Outdoor Teak Set — Hero',
    productSku: 'OUT-044',
    kind: 'image',
    role: 'hero',
    resolution: '5000 × 3400',
    sizeMb: 7.8,
    status: 'ready',
    owner: 'Isabella Rossi',
    updatedAt: '2024-10-05T09:42:00Z',
    checksum: 'bb08-92ec',
    accentColor: 'from-sky-200/70 via-blue-100/80 to-cyan-50',
  },
  {
    id: 'asset-video-002',
    title: 'Walnut Dining Table — Spin',
    productSku: 'DIN-204',
    kind: 'video',
    role: 'variant',
    resolution: '4K 15s',
    sizeMb: 22.6,
    status: 'failed',
    owner: 'Holly Becker',
    updatedAt: '2024-10-08T13:15:00Z',
    checksum: 'aa11-331d',
    issues: ['Render timed out'],
    accentColor: 'from-rose-200/70 via-rose-100/80 to-rose-50',
  },
];

export const mediaProcessingJobs = [
  {
    id: 'job-4310',
    asset: 'Velvet Sofa — Ivory Variant',
    stage: 'Generating derivatives',
    startedAt: '2024-10-08T15:05:00Z',
    etaMinutes: 6,
    progress: 68,
  },
  {
    id: 'job-4302',
    asset: 'Carrara Coffee Table — 3D',
    stage: 'Decimating mesh',
    startedAt: '2024-10-08T14:45:00Z',
    etaMinutes: 3,
    progress: 82,
  },
  {
    id: 'job-4297',
    asset: 'Outdoor Teak Set — Hero',
    stage: 'Color normalization',
    startedAt: '2024-10-08T14:10:00Z',
    etaMinutes: 0,
    progress: 100,
  },
];

export const mediaQualityQueue = [
  {
    id: 'qc-902',
    asset: 'Glass Coffee Table — Detail',
    issue: 'Reflections reveal rig',
    severity: 'high',
    assignedTo: 'Alex Morgan',
    submittedAt: '2024-10-08T14:20:00Z',
  },
  {
    id: 'qc-897',
    asset: 'Bouclé Accent Chair — Detail',
    issue: 'Texture seam visible',
    severity: 'medium',
    assignedTo: 'Jules Harper',
    submittedAt: '2024-10-08T13:05:00Z',
  },
  {
    id: 'qc-883',
    asset: 'Walnut Dining Table — Hero',
    issue: 'Shadow cleanup',
    severity: 'low',
    assignedTo: 'Sam Lee',
    submittedAt: '2024-10-08T11:40:00Z',
  },
];

// -----------------------------------------------------------------------------
// Privacy & Compliance
// -----------------------------------------------------------------------------

export type PrivacyRequestType = 'export' | 'delete' | 'rectify' | 'consent';
export type PrivacyRequestStatus = 'new' | 'in_progress' | 'fulfilled' | 'blocked';

export interface PrivacyRequest {
  id: string;
  user: string;
  type: PrivacyRequestType;
  region: 'US' | 'EU' | 'UK' | 'CA';
  submittedAt: string;
  slaHoursRemaining: number;
  status: PrivacyRequestStatus;
  risk: 'low' | 'medium' | 'high';
  owner: string;
}

export const privacyRequests: PrivacyRequest[] = [
  {
    id: 'req-1042',
    user: 'emily.anderson@example.com',
    type: 'export',
    region: 'EU',
    submittedAt: '2024-10-08T10:12:00Z',
    slaHoursRemaining: 36,
    status: 'in_progress',
    risk: 'medium',
    owner: 'Sarah Patel',
  },
  {
    id: 'req-1041',
    user: 'mateo.fernandez@example.com',
    type: 'delete',
    region: 'US',
    submittedAt: '2024-10-07T22:40:00Z',
    slaHoursRemaining: 18,
    status: 'new',
    risk: 'high',
    owner: 'Ravi Desai',
  },
  {
    id: 'req-1038',
    user: 'amelia.cho@example.com',
    type: 'consent',
    region: 'EU',
    submittedAt: '2024-10-07T14:02:00Z',
    slaHoursRemaining: 10,
    status: 'in_progress',
    risk: 'medium',
    owner: 'Emily Tran',
  },
  {
    id: 'req-1033',
    user: 'simon.wright@example.com',
    type: 'export',
    region: 'UK',
    submittedAt: '2024-10-07T04:45:00Z',
    slaHoursRemaining: 4,
    status: 'blocked',
    risk: 'high',
    owner: 'Larissa Cohen',
  },
  {
    id: 'req-1029',
    user: 'marie.dubois@example.com',
    type: 'rectify',
    region: 'EU',
    submittedAt: '2024-10-06T23:18:00Z',
    slaHoursRemaining: 0,
    status: 'fulfilled',
    risk: 'low',
    owner: 'Sarah Patel',
  },
];

// -----------------------------------------------------------------------------
// Notification Preferences (Admin Settings)
// -----------------------------------------------------------------------------

export interface NotificationPreferences {
  channels: {
    email: boolean;
    sms: boolean;
    slack: boolean;
  };
  digests: 'daily' | 'weekly' | 'monthly';
  escalation: {
    pagerDuty: boolean;
    smsBackup: boolean;
    emailSummary: boolean;
  };
  categories: Array<{
    key: string;
    label: string;
    description: string;
    enabled: boolean;
  }>;
}

export const notificationDefaults: NotificationPreferences = {
  channels: {
    email: true,
    sms: false,
    slack: true,
  },
  digests: 'daily',
  escalation: {
    pagerDuty: true,
    smsBackup: false,
    emailSummary: true,
  },
  categories: [
    {
      key: 'verification',
      label: 'Designer verification queue',
      description: 'Approvals, document uploads, and SLA breaches',
      enabled: true,
    },
    {
      key: 'catalog',
      label: 'Catalog publishing issues',
      description: 'Validation failures, stuck imports, and publish errors',
      enabled: true,
    },
    {
      key: 'orders',
      label: 'Order escalations',
      description: 'Refund failures or manual review requests',
      enabled: true,
    },
    {
      key: 'privacy',
      label: 'Privacy deadlines',
      description: 'GDPR/CCPA requests nearing SLA',
      enabled: true,
    },
    {
      key: 'system',
      label: 'System health alerts',
      description: 'Critical service degradations or incident bridges',
      enabled: false,
    },
  ],
};

// -----------------------------------------------------------------------------
// User Activity Timeline
// -----------------------------------------------------------------------------

export interface UserActivityEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  context: string;
  tone: 'info' | 'success' | 'warning' | 'destructive';
}

export const userActivityByUserId: Record<string, UserActivityEvent[]> = {
  default: [
    {
      id: 'evt-4001',
      timestamp: '2024-10-08T15:20:00Z',
      title: 'Session created',
      description: 'New login from Chrome on macOS',
      context: 'IP 64.71.12.91 · San Francisco, CA',
      tone: 'info',
    },
    {
      id: 'evt-3998',
      timestamp: '2024-10-08T14:55:00Z',
      title: 'Role updated',
      description: 'Granted catalog:editor via admin portal',
      context: 'Performed by admin@patina.com',
      tone: 'success',
    },
    {
      id: 'evt-3988',
      timestamp: '2024-10-07T22:41:00Z',
      title: 'Password reset',
      description: 'Self-service reset completed',
      context: 'Email confirmation + WebAuthn device approved',
      tone: 'info',
    },
    {
      id: 'evt-3971',
      timestamp: '2024-10-06T09:13:00Z',
      title: 'Account flagged',
      description: '3 consecutive failed MFA challenges',
      context: 'Lockout cleared automatically after 30 minutes',
      tone: 'warning',
    },
    {
      id: 'evt-3960',
      timestamp: '2024-10-05T18:02:00Z',
      title: 'Security email bounced',
      description: 'DMARC reject from secondary email alias',
      context: 'System auto-disabled notifications for alias',
      tone: 'destructive',
    },
  ],
};

// -----------------------------------------------------------------------------
// Convenience helpers
// -----------------------------------------------------------------------------

export const mockUsers: User[] = [
  {
    id: 'usr-1001',
    sub: 'ocid1.user.oc1..aaaa',
    email: 'jane.operator@patina.com',
    emailVerified: true,
    displayName: 'Jane Operator',
    avatarUrl: undefined,
    status: 'active',
    roles: [
      {
        id: 'role-admin',
        name: 'Platform Admin',
        description: 'Full platform access',
        permissions: [
          { id: 'perm-1', code: 'catalog:manage', description: '', resource: 'catalog', action: 'manage' },
          { id: 'perm-2', code: 'orders:refund', description: '', resource: 'orders', action: 'refund' },
        ],
      },
    ],
    createdAt: '2023-08-12T12:00:00Z',
    updatedAt: '2024-10-08T14:50:00Z',
  },
];

export const mockOrders: Order[] = [
  {
    id: 'ord-1001',
    userId: 'usr-2001',
    status: 'paid',
    currency: 'USD',
    subtotal: 52000,
    discountTotal: 0,
    taxTotal: 4200,
    shippingTotal: 7500,
    total: 63700,
    snapshot: {},
    items: [],
    shipments: [],
    refunds: [],
    payments: [],
    createdAt: '2024-10-07T15:22:00Z',
    updatedAt: '2024-10-07T15:22:00Z',
  },
];

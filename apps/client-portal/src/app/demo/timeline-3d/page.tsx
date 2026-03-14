'use client'

import { useState } from 'react'
import {
  ImmersiveTimelineCarousel,
  Badge,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
  ApprovalTheater,
} from '@patina/design-system'
import type { MilestoneDetail, ApprovalItem } from '@patina/design-system'
import { FileCheck2, Palette, MessageSquare, ChevronDown } from 'lucide-react'

// Sample milestone data for demonstration
const sampleMilestones: MilestoneDetail[] = [
  {
    id: '1',
    title: 'Initial Consultation',
    description: 'Met with designer to discuss vision, budget, and timeline. Reviewed inspiration photos and established project scope.',
    sequenceNumber: 1,
    totalMilestones: 6,
    progress: 100,
    status: 'completed',
    date: new Date('2025-01-15'),
    phase: 'Discovery',
    checklist: [
      { id: 'c1', title: 'Vision board created', completed: true },
      { id: 'c2', title: 'Budget approved', completed: true },
      { id: 'c3', title: 'Timeline agreed', completed: true },
    ],
    messages: [
      {
        id: 'm1',
        authorId: 'designer-1',
        authorName: 'Leah Kochaver',
        authorRole: 'designer',
        body: 'Thank you for the wonderful consultation! I love your vision for a warm, modern aesthetic.',
        createdAt: new Date('2025-01-15T14:30:00'),
      },
    ],
  },
  {
    id: '2',
    title: 'Design Concept Development',
    description: 'Designer creates comprehensive design concepts including floor plans, color palettes, and furniture selections.',
    sequenceNumber: 2,
    totalMilestones: 6,
    progress: 100,
    status: 'completed',
    date: new Date('2025-02-01'),
    phase: 'Design',
    media: [
      {
        id: 'img1',
        url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800',
        type: 'image',
        caption: 'Living room concept rendering',
      },
      {
        id: 'img2',
        url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800',
        type: 'image',
        caption: 'Kitchen color palette',
      },
    ],
  },
  {
    id: '3',
    title: 'Design Approval',
    description: 'Review and approve the final design concepts and material selections.',
    sequenceNumber: 3,
    totalMilestones: 6,
    progress: 85,
    status: 'approval-needed',
    date: new Date('2025-02-15'),
    phase: 'Design',
    approval: {
      id: 'a1',
      title: 'Design Concept Approval',
      description: 'Please review the final design concepts, floor plans, and material selections.',
      status: 'pending',
      value: 12500,
      currency: 'USD',
    },
  },
  {
    id: '4',
    title: 'Material Ordering',
    description: 'Order all approved materials, furniture, and fixtures.',
    sequenceNumber: 4,
    totalMilestones: 6,
    progress: 0,
    status: 'upcoming',
    date: new Date('2025-03-01'),
    phase: 'Procurement',
  },
  {
    id: '5',
    title: 'Installation',
    description: 'Professional installation of all furniture, fixtures, and décor.',
    sequenceNumber: 5,
    totalMilestones: 6,
    progress: 0,
    status: 'upcoming',
    date: new Date('2025-03-15'),
    phase: 'Installation',
  },
  {
    id: '6',
    title: 'Final Walkthrough',
    description: 'Tour your completed space, final touches, and project completion celebration.',
    sequenceNumber: 6,
    totalMilestones: 6,
    progress: 0,
    status: 'upcoming',
    date: new Date('2025-03-22'),
    phase: 'Completion',
  },
]

type MaterialStatus = 'pending' | 'approved' | 'ordered'
type ShipmentStatus = 'awaiting' | 'ordered' | 'in_transit' | 'delivered'

interface MaterialBoard {
  id: string
  title: string
  description: string
  curatedBy: string
  eta: string
  totalEstimate: number
  currency: string
  items: Array<{
    id: string
    name: string
    vendor: string
    category: string
    finish: string
    quantity: number
    status: MaterialStatus
  }>
  shipments: Array<{
    id: string
    label: string
    status: ShipmentStatus
    eta: string
    notes?: string
  }>
}

interface CommunicationThread {
  id: string
  subject: string
  summary: string
  lastUpdated: string
  messages: Array<{
    id: string
    author: string
    role: 'designer' | 'client' | 'producer'
    timestamp: string
    body: string
  }>
}

interface MilestoneExperience {
  approvals: ApprovalItem[]
  materials: MaterialBoard
  communications: CommunicationThread
}

type MilestonePanelType = 'checklist' | 'media' | 'messages'

interface MilestonePanelState {
  type: MilestonePanelType
  milestone: MilestoneDetail
}

interface DecisionHubState {
  milestone: MilestoneDetail
  experience: MilestoneExperience
}

interface MilestoneNarrative {
  startDate: Date
  endDate: Date
  happening: string
  completed: string[]
  needsInput: string[]
}

const milestoneExperiences: Record<string, MilestoneExperience> = {
  '2': {
    approvals: [
      {
        id: 'approval-living-room-concept',
        title: 'Living Room Concept Layers',
        description: 'Approve the plaster fireplace, inset brass shelf, and curated art direction.',
        type: 'design',
        status: 'pending',
        recommendedAction: 'approve',
        beforeImage: 'https://images.unsplash.com/photo-1481277542470-605612bd2d61?w=900',
        afterImage: 'https://images.unsplash.com/photo-1505692794400-90c45332a452?w=900',
        images: [
          'https://images.unsplash.com/photo-1505692794400-90c45332a452?w=600',
          'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=600',
        ],
        costImpact: {
          amount: 12500,
          currency: 'USD',
          breakdown: [
            { label: 'Custom millwork', amount: 7800 },
            { label: 'Specialty plaster', amount: 4700 },
          ],
        },
        timelineImpact: {
          days: 2,
          affectedMilestones: ['Material Ordering'],
        },
        designerNote: 'The plaster finish warms the envelope while the inset brass rail keeps it modern.',
        alternatives: [
          {
            id: 'alt-walnut',
            title: 'Walnut Panel System',
            description: 'Darker, more formal wrap with cleaner detailing.',
            costDifference: -1800,
            timelineDifference: -1,
          },
        ],
      },
    ],
    materials: {
      id: 'board-living-room',
      title: 'Living Room Layering Kit',
      description: 'Tactile samples for upholstery, casegoods, lighting, and art ledges.',
      curatedBy: 'Leah Kochaver',
      eta: 'March 8, 2025',
      totalEstimate: 18750,
      currency: 'USD',
      items: [
        {
          id: 'item-sofa',
          name: 'Custom channel sofa',
          vendor: 'Holm & Reed',
          category: 'Seating',
          finish: 'Bouclé dune',
          quantity: 1,
          status: 'pending',
        },
        {
          id: 'item-lamp',
          name: 'Linea floor lamp',
          vendor: 'Atelier 19',
          category: 'Lighting',
          finish: 'Antique brass',
          quantity: 2,
          status: 'approved',
        },
        {
          id: 'item-rug',
          name: 'Hand-knotted wool rug',
          vendor: 'Loom + Field',
          category: 'Textile',
          finish: 'Oatmeal / Slate',
          quantity: 1,
          status: 'pending',
        },
      ],
      shipments: [
        {
          id: 'ship-textiles',
          label: 'Textiles + Rugs',
          status: 'ordered',
          eta: 'Mar 12',
          notes: 'Awaiting COM cuttings for review',
        },
        {
          id: 'ship-casegoods',
          label: 'Casegoods & Lighting',
          status: 'awaiting',
          eta: 'Mar 18',
          notes: 'Release deposit once concept is approved',
        },
      ],
    },
    communications: {
      id: 'thread-concept',
      subject: 'Concept refinement notes',
      summary: 'Discussed warmer walnut accents and the reading cove scale before locking documentation.',
      lastUpdated: 'Feb 18 • 3:24 PM',
      messages: [
        {
          id: 'msg-1',
          author: 'Leah Kochaver',
          role: 'designer',
          timestamp: 'Feb 18 • 3:24 PM',
          body: 'Uploading the revised render set with softened plaster tone and brass picture rail.',
        },
        {
          id: 'msg-2',
          author: 'Morgan Ellis',
          role: 'client',
          timestamp: 'Feb 18 • 4:02 PM',
          body: 'Love the warmth! Can we keep a single walnut ledge for heirloom books?',
        },
        {
          id: 'msg-3',
          author: 'Noah Patel',
          role: 'producer',
          timestamp: 'Feb 18 • 4:25 PM',
          body: 'Flagging that walnut detail adds 3 days to the millwork lead unless we confirm today.',
        },
      ],
    },
  },
  '3': {
    approvals: [
      {
        id: 'approval-banquette',
        title: 'Dining Banquette & Storage',
        description: 'Lock the channel pattern and leather selection for fabrication.',
        type: 'material',
        status: 'discussion',
        recommendedAction: 'discuss',
        beforeImage: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=900',
        afterImage: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=900',
        costImpact: {
          amount: 8900,
          currency: 'USD',
        },
        timelineImpact: {
          days: 4,
          affectedMilestones: ['Material Ordering', 'Installation'],
        },
        designerNote: 'The saddle leather patinas beautifully but we can pivot to performance velvet.',
      },
      {
        id: 'approval-lighting',
        title: 'Sculptural Pendant Cluster',
        description: 'Decide between glass or ceramic shades for the dining pendant.',
        type: 'design',
        status: 'pending',
        recommendedAction: 'consider-alternative',
        images: [
          'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600',
          'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=600',
        ],
        costImpact: {
          amount: 3100,
          currency: 'USD',
        },
        timelineImpact: {
          days: 0,
          affectedMilestones: ['Material Ordering'],
        },
        alternatives: [
          {
            id: 'alt-ceramic',
            title: 'Ceramic Dome Set',
            description: 'Matte ceramic with brass knuckles, ships faster.',
            costDifference: -450,
            timelineDifference: -5,
          },
        ],
      },
    ],
    materials: {
      id: 'board-dining',
      title: 'Dining Suite Material Board',
      description: 'Finishes for banquette, dining table, and sculptural lighting.',
      curatedBy: 'Noah Patel',
      eta: 'March 15, 2025',
      totalEstimate: 22400,
      currency: 'USD',
      items: [
        {
          id: 'item-leather',
          name: 'Aniline leather hide',
          vendor: 'Moore & Giles',
          category: 'Leather',
          finish: 'Saddle / 3265',
          quantity: 3,
          status: 'pending',
        },
        {
          id: 'item-table',
          name: 'Custom oak dining table',
          vendor: 'Northhouse Studio',
          category: 'Casegood',
          finish: 'Bleached oak',
          quantity: 1,
          status: 'ordered',
        },
        {
          id: 'item-pendant',
          name: 'Glass pendant trio',
          vendor: 'Allied Maker',
          category: 'Lighting',
          finish: 'Frosted glass / brass',
          quantity: 1,
          status: 'pending',
        },
      ],
      shipments: [
        {
          id: 'ship-banquette',
          label: 'Banquette fabrication slot',
          status: 'ordered',
          eta: 'Apr 02',
          notes: 'Hold pending client approval',
        },
        {
          id: 'ship-lighting',
          label: 'Lighting production',
          status: 'in_transit',
          eta: 'Mar 28',
        },
      ],
    },
    communications: {
      id: 'thread-approvals',
      subject: 'Banquette comfort tweaks',
      summary: 'Thread captures the cushioning tests and center seam decision.',
      lastUpdated: 'Feb 23 • 11:10 AM',
      messages: [
        {
          id: 'msg-4',
          author: 'Morgan Ellis',
          role: 'client',
          timestamp: 'Feb 23 • 9:02 AM',
          body: 'We loved the showroom sample but prefer a slightly taller back for dinner parties.',
        },
        {
          id: 'msg-5',
          author: 'Leah Kochaver',
          role: 'designer',
          timestamp: 'Feb 23 • 10:40 AM',
          body: 'Adding 3" to the back cushion and testing dual-density foam. Uploading a sketch now.',
        },
        {
          id: 'msg-6',
          author: 'Noah Patel',
          role: 'producer',
          timestamp: 'Feb 23 • 11:10 AM',
          body: 'Fabricator confirmed the change keeps lead time the same if released before Friday.',
        },
      ],
    },
  },
  '4': {
    approvals: [
      {
        id: 'approval-material-batch',
        title: 'Material Procurement Bundle',
        description: 'Authorize bundled purchase orders for tile, lighting, and plumbing.',
        type: 'timeline',
        status: 'pending',
        recommendedAction: 'approve',
        costImpact: {
          amount: 48250,
          currency: 'USD',
        },
        timelineImpact: {
          days: -3,
          affectedMilestones: ['Installation'],
        },
        designerNote: 'Bundling gives us priority fabrication dates and consolidated freight.',
      },
    ],
    materials: {
      id: 'board-procurement',
      title: 'Procurement Readiness Board',
      description: 'Status of every vendor release plus freight plans.',
      curatedBy: 'Operations Desk',
      eta: 'Rolling releases',
      totalEstimate: 48250,
      currency: 'USD',
      items: [
        {
          id: 'item-plumbing',
          name: 'Brizo Litze plumbing suite',
          vendor: 'Brizo',
          category: 'Plumbing',
          finish: 'Brilliance Luxe Gold',
          quantity: 12,
          status: 'ordered',
        },
        {
          id: 'item-tile',
          name: 'Handmade zellige tile',
          vendor: 'Clé Tile',
          category: 'Tile',
          finish: 'Weathered white',
          quantity: 220,
          status: 'pending',
        },
        {
          id: 'item-sconce',
          name: 'Custom alabaster sconces',
          vendor: 'Ignite Studio',
          category: 'Lighting',
          finish: 'Alabaster / brass',
          quantity: 6,
          status: 'pending',
        },
      ],
      shipments: [
        {
          id: 'ship-plumbing',
          label: 'Plumbing drop',
          status: 'delivered',
          eta: 'Feb 05',
        },
        {
          id: 'ship-tile',
          label: 'Tile production',
          status: 'ordered',
          eta: 'Mar 30',
          notes: 'Requires approval to release glazing batch',
        },
      ],
    },
    communications: {
      id: 'thread-logistics',
      subject: 'Freight consolidation',
      summary: 'Coordinating white-glove delivery windows for fragile items.',
      lastUpdated: 'Feb 27 • 6:42 PM',
      messages: [
        {
          id: 'msg-7',
          author: 'Noah Patel',
          role: 'producer',
          timestamp: 'Feb 27 • 5:05 PM',
          body: 'Routing plumbing + tile through the same carrier saves $1.2K and a full week.',
        },
        {
          id: 'msg-8',
          author: 'Leah Kochaver',
          role: 'designer',
          timestamp: 'Feb 27 • 5:44 PM',
          body: 'Need to confirm tile glaze tonight so we keep the kiln reservation.',
        },
        {
          id: 'msg-9',
          author: 'Morgan Ellis',
          role: 'client',
          timestamp: 'Feb 27 • 6:42 PM',
          body: 'Approved on our end. Thanks for keeping everything bundled.',
        },
      ],
    },
  },
}

const milestoneNarratives: Record<string, MilestoneNarrative> = {
  '1': {
    startDate: new Date('2025-01-08'),
    endDate: new Date('2025-01-15'),
    happening:
      'Discovery wrapped with the full vision brief, budget guardrails, and measurement notes ready for design exploration.',
    completed: [
      'Consultation recap delivered to project workspace',
      'Budget and scope alignment documented and signed',
      'Timeline expectations synced with production team',
    ],
    needsInput: [],
  },
  '2': {
    startDate: new Date('2025-01-18'),
    endDate: new Date('2025-02-01'),
    happening:
      'Concept directions, renderings, and palettes are assembled into a layered presentation for client synthesis.',
    completed: [
      'Living room render set refined with warmer palette',
      'Kitchen color stories benchmarked against mood board',
      'Producer notes consolidated for approval hand-off',
    ],
    needsInput: [
      'Capture reactions to revised render set before hand-off',
      'Outline priority areas to focus in the approval session',
    ],
  },
  '3': {
    startDate: new Date('2025-02-02'),
    endDate: new Date('2025-02-18'),
    happening:
      'Client approval sprint for concept, banquette detailing, and sculptural lighting — design is awaiting sign-off.',
    completed: [
      'Concept deck annotated with client comfort notes',
      'Lighting alternatives evaluated with lead times',
      'Cost impacts summarized for quick decision-making',
    ],
    needsInput: [
      'Approve the dining banquette materials and pattern',
      'Confirm the sculptural pendant cluster finish package',
    ],
  },
  '4': {
    startDate: new Date('2025-02-19'),
    endDate: new Date('2025-03-10'),
    happening:
      'Procurement staging is underway, with bundled purchase orders queued pending final release of glazing and sconces.',
    completed: [
      'Plumbing suite released and delivered to warehouse',
      'Freight consolidation plan drafted with white-glove vendor',
      'Material board reviewed with operations desk',
    ],
    needsInput: [
      'Authorize tile glazing batch to lock in production window',
      'Approve custom alabaster sconce fabrication slot',
    ],
  },
  '5': {
    startDate: new Date('2025-03-11'),
    endDate: new Date('2025-03-20'),
    happening:
      'Installation sequencing is mapped with trades, aligning delivery drops with on-site milestones.',
    completed: [
      'Installation checklist drafted with trade assignments',
      'Site readiness walk-through scheduled with contractor',
    ],
    needsInput: [
      'Confirm client availability for site access during week 1',
      'Finalize punch list priorities for day-three install review',
    ],
  },
  '6': {
    startDate: new Date('2025-03-21'),
    endDate: new Date('2025-03-28'),
    happening:
      'Celebration walkthrough is staged, focusing on styling moments, final QA, and handover materials.',
    completed: [
      'Welcome kit drafted with care guides and styling tips',
      'Final photography brief outlined with creative team',
    ],
    needsInput: [
      'Highlight must-capture moments for the walkthrough reel',
      'Share any final fit or finish tweaks before reveal day',
    ],
  },
}

const formatCurrency = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)

const materialStatusClasses: Record<MaterialStatus, string> = {
  pending: 'border-amber-200 text-amber-800',
  approved: 'border-emerald-200 text-emerald-700',
  ordered: 'border-indigo-200 text-indigo-700',
}

const shipmentStatusClasses: Record<ShipmentStatus, string> = {
  awaiting: 'border-slate-200 text-slate-600',
  ordered: 'border-amber-200 text-amber-800',
  in_transit: 'border-blue-200 text-blue-700',
  delivered: 'border-emerald-200 text-emerald-700',
}

const formatStatus = (status: string) => status.replace(/_/g, ' ')
const formatTimelineDate = (date?: Date) =>
  date
    ? date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'TBD'

const statusToneClasses: Record<string, string> = {
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  in_progress: 'border-sky-200 bg-sky-50 text-sky-800',
  attention: 'border-amber-200 bg-amber-50 text-amber-800',
  'approval-needed': 'border-rose-200 bg-rose-50 text-rose-800',
  upcoming: 'border-slate-200 bg-slate-50 text-slate-700',
  default: 'border-slate-200 bg-slate-50 text-slate-700',
}

const getStatusTone = (status?: string) =>
  statusToneClasses[status ?? 'default'] ?? statusToneClasses.default

const getProgressBarColor = (value?: number) => {
  if (value === undefined) return 'bg-slate-200'
  if (value >= 100) return 'bg-emerald-500'
  if (value >= 70) return 'bg-emerald-400'
  if (value >= 40) return 'bg-amber-400'
  if (value > 0) return 'bg-rose-400'
  return 'bg-slate-300'
}

const ACTIONABLE_APPROVAL_STATES = new Set<ApprovalItem['status']>([
  'pending',
  'discussion',
  'rejected',
])

interface ApprovalSummary {
  total: number
  completed: number
  actionable: number
  primary?: ApprovalItem
}

const computeApprovalSummary = (approvals?: ApprovalItem[]): ApprovalSummary => {
  if (!approvals || approvals.length === 0) {
    return { total: 0, completed: 0, actionable: 0 }
  }

  const summary: ApprovalSummary = {
    total: approvals.length,
    completed: 0,
    actionable: 0,
    primary: undefined,
  }

  approvals.forEach((approval) => {
    if (approval.status === 'approved') {
      summary.completed += 1
    } else if (ACTIONABLE_APPROVAL_STATES.has(approval.status)) {
      summary.actionable += 1
      if (!summary.primary) {
        summary.primary = approval
      }
    }
  })

  if (!summary.primary) {
    summary.primary =
      approvals.find((approval) => approval.status !== 'approved') ?? approvals[0]
  }

  return summary
}

const formatTimestamp = (value: Date) => {
  const datePart = value.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const timePart = value.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${datePart} • ${timePart}`
}

const mapMessageRole = (role: string): 'designer' | 'client' | 'producer' => {
  if (role === 'designer' || role === 'client') {
    return role
  }
  return 'producer'
}

const createThreadFromMilestone = (milestone: MilestoneDetail): CommunicationThread | null => {
  if (!milestone.messages || milestone.messages.length === 0) {
    return null
  }

  const sortedMessages = [...milestone.messages].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
  const latest = sortedMessages[0]

  return {
    id: `thread-${milestone.id}`,
    subject: `${milestone.title} updates`,
    summary: milestone.description ?? 'Latest milestone updates and decisions',
    lastUpdated: formatTimestamp(latest.createdAt),
    messages: sortedMessages.map((message) => ({
      id: message.id,
      author: message.authorName,
      role: mapMessageRole(message.authorRole),
      timestamp: formatTimestamp(message.createdAt),
      body: message.body,
    })),
  }
}

export default function ImmersiveTimelineDemoPage() {
  const [activeMilestoneId, setActiveMilestoneId] = useState<string>('')

  // Hero section component
  const heroSection = (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-[#EDE9E4]">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h1 className="font-serif text-5xl md:text-7xl font-bold mb-6">
          Oak Street Residence
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground mb-8">
          Interior Design & Furnishing Project
        </p>
        <div className="flex items-center justify-center gap-8 mt-12">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Overall Progress
            </p>
            <p className="text-3xl font-serif font-bold">62%</p>
          </div>
          <div className="h-12 w-px bg-gray-300" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Milestones Completed
            </p>
            <p className="text-3xl font-serif font-bold">2 of 6</p>
          </div>
        </div>
        <div className="mt-12 animate-bounce">
          <p className="text-sm text-muted-foreground">Scroll to explore</p>
          <svg
            className="mx-auto mt-2 h-6 w-6 text-muted-foreground"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
          </svg>
        </div>
      </div>
    </div>
  )

  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null)
  const [activeMaterialsBoard, setActiveMaterialsBoard] = useState<MaterialBoard | null>(null)
  const [activeThread, setActiveThread] = useState<CommunicationThread | null>(null)
  const [focusedPanel, setFocusedPanel] = useState<MilestonePanelState | null>(null)
  const [activeDecisionHub, setActiveDecisionHub] = useState<DecisionHubState | null>(null)
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null)

  const handleApprovalLaunch = (approval: ApprovalItem) => setSelectedApproval(approval)
  const handleMaterialsOpen = (board: MaterialBoard) => setActiveMaterialsBoard(board)
  const handleThreadOpen = (thread: CommunicationThread) => setActiveThread(thread)
  const handlePanelOpen = (type: MilestonePanelType, milestone: MilestoneDetail) =>
    setFocusedPanel({ type, milestone })
  const handleDecisionHubOpen = (milestone: MilestoneDetail, experience: MilestoneExperience) =>
    setActiveDecisionHub({ milestone, experience })
  const handleMilestoneChange = (milestoneId: string) => {
    setActiveMilestoneId(milestoneId)
    setExpandedMilestoneId(null)
  }

  // Render milestone content
  const renderMilestone = (milestone: MilestoneDetail, isActive: boolean) => {
    const decisionExperience = milestoneExperiences[milestone.id]
    const narrative = milestoneNarratives[milestone.id]
    const checklistItems = milestone.checklist ?? []
    const completedChecklistItems = checklistItems.filter((item) => item.completed)
    const completedChecklistCount = completedChecklistItems.length
    const totalChecklist = checklistItems.length
    const checklistTitles = completedChecklistItems.map((item) => item.title)
    const approvalsSummary = computeApprovalSummary(decisionExperience?.approvals)
    const milestoneApprovalItem = milestone.approval
      ? (milestone.approval as unknown as ApprovalItem)
      : undefined
    const totalApprovals =
      approvalsSummary.total > 0 ? approvalsSummary.total : milestoneApprovalItem ? 1 : 0
    const approvalsPending =
      approvalsSummary.total > 0
        ? approvalsSummary.actionable
        : milestone.approval && milestone.approval.status !== 'approved'
          ? 1
          : 0
    const approvalsCleared = totalApprovals > 0 ? Math.max(totalApprovals - approvalsPending, 0) : 0
    const primaryApproval = approvalsSummary.primary ?? milestoneApprovalItem
    const startDate = narrative?.startDate ?? milestone.date
    const endDate = narrative?.endDate ?? milestone.date
    const happeningCopy = narrative?.happening ?? milestone.description ?? ''
    const completedHighlights =
      narrative?.completed && narrative.completed.length > 0
        ? narrative.completed
        : checklistTitles
    const derivedNeeds =
      narrative?.needsInput && narrative.needsInput.length > 0
        ? narrative.needsInput
        : approvalsPending > 0
          ? [`${approvalsPending} approval${approvalsPending === 1 ? '' : 's'} awaiting action`]
          : []
    const communicationsThread =
      decisionExperience?.communications ?? createThreadFromMilestone(milestone)
    const messagesCount = milestone.messages?.length ?? 0
    const isExpanded = expandedMilestoneId === milestone.id
    const needsAttention =
      milestone.status === 'approval-needed' ||
      milestone.status === 'changes-requested' ||
      approvalsPending > 0
    const cardClassName = `rounded-3xl border bg-white/85 p-6 shadow-lg shadow-slate-200/40 backdrop-blur supports-[backdrop-filter]:bg-white/75 ${
      needsAttention ? 'border-rose-200 ring-1 ring-rose-200/50' : 'border-slate-200/70'
    }`
    const toggleExpanded = () =>
      setExpandedMilestoneId((current) => (current === milestone.id ? null : milestone.id))
    const detailWrapperClasses = `overflow-hidden transition-all duration-500 ease-out ${
      isExpanded ? 'max-h-[1200px] opacity-100 mt-6 border-t border-slate-100 pt-6' : 'max-h-0 opacity-0'
    }`
    const statusLabel =
      approvalsPending > 0
        ? `${approvalsPending} approval${approvalsPending === 1 ? '' : 's'} pending`
        : formatStatus(milestone.status)

    return (
      <div className={cardClassName}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {milestone.phase && (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {milestone.phase}
                  </span>
                )}
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getStatusTone(
                  milestone.status
                )}`}
              >
                {formatStatus(milestone.status)}
              </span>
              {needsAttention && (
                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
                  Needs attention
                </span>
              )}
                {isActive && (
                  <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    Active
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold text-slate-900">{milestone.title}</h2>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Milestone {milestone.sequenceNumber} of {milestone.totalMilestones}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Schedule</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatTimelineDate(startDate)} — {formatTimelineDate(endDate)}
              </p>
              <p className="text-xs text-muted-foreground">
                Target {formatTimelineDate(milestone.date)}
              </p>
            </div>
          </div>

          {happeningCopy && (
            <p className="mt-4 text-sm text-muted-foreground line-clamp-2">{happeningCopy}</p>
          )}

          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
              <span>{statusLabel}</span>
              {milestone.progress !== undefined && (
                <span className="font-semibold text-slate-700">{milestone.progress}%</span>
              )}
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(
                  milestone.progress
                )}`}
                style={{ width: `${milestone.progress ?? 0}%` }}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {primaryApproval && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full px-3 text-slate-700 hover:bg-slate-100"
                  onClick={() => handleApprovalLaunch(primaryApproval)}
                >
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  {approvalsPending > 0 ? 'Review approval' : 'View approval'}
                </Button>
              )}
              {communicationsThread && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full px-3 text-indigo-700 hover:bg-indigo-100"
                  onClick={() => handleThreadOpen(communicationsThread)}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Messages{messagesCount ? ` (${messagesCount})` : ''}
                </Button>
              )}
              {isExpanded && decisionExperience && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full px-3 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => handleDecisionHubOpen(milestone, decisionExperience)}
                >
                  Decision hub
                </Button>
              )}
              {isExpanded && totalChecklist > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full px-3 text-slate-700 hover:bg-slate-100"
                  onClick={() => handlePanelOpen('checklist', milestone)}
                >
                  Checklist ({completedChecklistCount}/{totalChecklist})
                </Button>
              )}
              {isExpanded && milestone.media && milestone.media.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full px-3 text-slate-700 hover:bg-slate-100"
                  onClick={() => handlePanelOpen('media', milestone)}
                >
                  Media ({milestone.media.length})
                </Button>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full px-3 text-indigo-600 hover:bg-indigo-50"
              onClick={toggleExpanded}
            >
              <span>{isExpanded ? 'Hide details' : 'View details'}</span>
              <ChevronDown
                className={`ml-2 h-4 w-4 transition-transform duration-300 ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </div>

          <div className={detailWrapperClasses} aria-hidden={!isExpanded}>
            <div
              className={`space-y-6 ${isExpanded ? '' : 'pointer-events-none select-none'} ${
                isExpanded ? '' : ''
              }`}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <DetailList
                  title="Completed highlights"
                  accent="emerald"
                  items={completedHighlights}
                  emptyCopy="No completions logged yet."
                />
                <DetailList
                  title="Needs input"
                  accent="rose"
                  items={derivedNeeds}
                  emptyCopy="Nothing required right now."
                />
              </div>

              {totalChecklist > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
                      Checklist
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {completedChecklistCount}/{totalChecklist} complete
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {checklistItems.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            item.completed ? 'bg-emerald-400/80' : 'bg-slate-300'
                          }`}
                        />
                        <span>{item.title}</span>
                      </div>
                    ))}
                  </div>
                  {totalChecklist > 3 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      +{totalChecklist - 3} more checklist item
                      {totalChecklist - 3 === 1 ? '' : 's'}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-4 rounded-full px-3 text-slate-700 hover:bg-slate-100"
                    onClick={() => handlePanelOpen('checklist', milestone)}
                  >
                    View checklist
                  </Button>
                </div>
              )}

              {milestone.approval && milestone.approval.status === 'pending' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-amber-800">Pending approval</p>
                    <p className="text-sm font-semibold text-amber-900">{milestone.approval.title}</p>
                    <p className="text-sm text-amber-800">{milestone.approval.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {milestone.approval.value && (
                      <p className="text-lg font-semibold text-amber-900">
                        ${milestone.approval.value.toLocaleString()}
                      </p>
                    )}
                    <Button
                      onClick={() =>
                        handleApprovalLaunch(milestone.approval as unknown as ApprovalItem)
                      }
                    >
                      Review
                    </Button>
                  </div>
                </div>
              )}

              {decisionExperience && (
                <DecisionCenter
                  experience={decisionExperience}
                  onApprovalSelect={handleApprovalLaunch}
                  onMaterialsOpen={handleMaterialsOpen}
                  onCommunicationOpen={handleThreadOpen}
                />
              )}
            </div>
          </div>
        </div>
    )
  }

  return (
    <div className="min-h-screen">
      <ImmersiveTimelineCarousel
        milestones={sampleMilestones}
        activeMilestoneId={activeMilestoneId}
        onMilestoneChange={handleMilestoneChange}
        heroSection={heroSection}
        renderMilestone={renderMilestone}
        enableKeyboardNav
      />

      {/* Instructions overlay - fades out on scroll */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white px-6 py-3 rounded-full text-sm backdrop-blur-sm">
        Use ↑↓ or J/K to navigate • Scroll freely or snap to milestones
      </div>

      {selectedApproval && (
        <ApprovalTheater
          open={Boolean(selectedApproval)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedApproval(null)
            }
          }}
          approval={selectedApproval}
          mode="fullscreen"
          backdrop="blur"
        />
      )}

      {activeMaterialsBoard && (
        <Modal
          open={Boolean(activeMaterialsBoard)}
          onOpenChange={(open) => {
            if (!open) {
              setActiveMaterialsBoard(null)
            }
          }}
        >
          <ModalContent size="xl" className="max-h-[90vh] overflow-hidden">
            <ModalHeader>
              <ModalTitle>{activeMaterialsBoard.title}</ModalTitle>
              <ModalDescription>{activeMaterialsBoard.description}</ModalDescription>
            </ModalHeader>

            <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-amber-800">Curated by</p>
                  <p className="text-lg font-semibold text-amber-900">{activeMaterialsBoard.curatedBy}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-amber-800">ETA</p>
                  <p className="text-lg font-semibold text-amber-900">{activeMaterialsBoard.eta}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-amber-800">Budget</p>
                  <p className="text-lg font-semibold text-amber-900">
                    {formatCurrency(activeMaterialsBoard.totalEstimate, activeMaterialsBoard.currency)}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">Material items</h4>
                  <span className="text-xs text-muted-foreground">
                    {activeMaterialsBoard.items.length} selections
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {activeMaterialsBoard.items.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-100 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.vendor} • {item.category}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`${materialStatusClasses[item.status]} uppercase tracking-wide`}
                        >
                          {formatStatus(item.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Finish: {item.finish} • Qty {item.quantity}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">Logistics</h4>
                  <span className="text-xs text-muted-foreground">
                    {activeMaterialsBoard.shipments.length} shipments
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {activeMaterialsBoard.shipments.map((shipment) => (
                    <div key={shipment.id} className="rounded-2xl border border-slate-100 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{shipment.label}</p>
                          <p className="text-xs text-muted-foreground">ETA {shipment.eta}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`${shipmentStatusClasses[shipment.status]} uppercase tracking-wide`}
                        >
                          {formatStatus(shipment.status)}
                        </Badge>
                      </div>
                      {shipment.notes && (
                        <p className="mt-1 text-xs text-muted-foreground">{shipment.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <ModalFooter className="pt-4">
              <Button variant="secondary" onClick={() => setActiveMaterialsBoard(null)}>
                Close
              </Button>
              <Button>Share Board</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {activeThread && (
        <Modal
          open={Boolean(activeThread)}
      onOpenChange={(open) => {
        if (!open) {
          setActiveThread(null)
        }
      }}
    >
      <ModalContent size="full" className="max-h-[92vh] max-w-[min(1100px,96vw)] overflow-hidden">
        <ModalHeader>
          <ModalTitle>{activeThread.subject}</ModalTitle>
          <ModalDescription>
            {activeThread.summary} — Updated {activeThread.lastUpdated}
          </ModalDescription>
            </ModalHeader>

            <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
              {activeThread.messages.map((message) => (
                <div key={message.id} className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{message.author}</p>
                      <p className="text-xs uppercase tracking-wide text-indigo-600">{message.role}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{message.body}</p>
                </div>
              ))}
            </div>

            <ModalFooter className="pt-4">
              <Button variant="secondary" onClick={() => setActiveThread(null)}>
                Close
              </Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Jump to discussion
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {focusedPanel && (
        <Modal
          open={Boolean(focusedPanel)}
          onOpenChange={(open) => {
            if (!open) {
              setFocusedPanel(null)
            }
          }}
        >
          <ModalContent size="lg" className="max-h-[85vh] overflow-hidden">
            <ModalHeader>
              <ModalTitle>
                {focusedPanel.type === 'checklist'
                  ? 'Milestone checklist'
                  : focusedPanel.type === 'media'
                    ? 'Milestone media'
                    : 'Milestone messages'}
              </ModalTitle>
              <ModalDescription>{focusedPanel.milestone.title}</ModalDescription>
            </ModalHeader>

            <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2">
              {focusedPanel.type === 'checklist' && (
                <>
                  {focusedPanel.milestone.checklist && focusedPanel.milestone.checklist.length > 0 ? (
                    <div className="space-y-3">
                      {focusedPanel.milestone.checklist.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{item.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.completed ? 'Completed' : 'Pending'}
                            </p>
                          </div>
                          <Badge
                            variant={item.completed ? 'solid' : 'outline'}
                            className={
                              item.completed
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'border-slate-200 text-slate-600'
                            }
                          >
                            {item.completed ? 'Done' : 'Open'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      No checklist items for this milestone
                    </p>
                  )}
                </>
              )}

              {focusedPanel.type === 'media' && (
                <>
                  {focusedPanel.milestone.media && focusedPanel.milestone.media.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {focusedPanel.milestone.media.map((item) => (
                        <div key={item.id} className="space-y-2">
                          <img
                            src={item.url}
                            alt={item.caption || 'Milestone media'}
                            className="h-56 w-full rounded-2xl object-cover"
                          />
                          {item.caption && (
                            <p className="text-xs text-muted-foreground">{item.caption}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      No media available for this milestone
                    </p>
                  )}
                </>
              )}

              {focusedPanel.type === 'messages' && (
                <>
                  {focusedPanel.milestone.messages && focusedPanel.milestone.messages.length > 0 ? (
                    <div className="space-y-4">
                      {focusedPanel.milestone.messages.map((message) => (
                        <div
                          key={message.id}
                          className="rounded-2xl border border-slate-100 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{message.authorName}</p>
                            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                              {message.authorRole}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {message.createdAt.toLocaleDateString()}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{message.body}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      No messages yet
                    </p>
                  )}
                </>
              )}
            </div>

            <ModalFooter>
              <Button variant="secondary" onClick={() => setFocusedPanel(null)}>
                Close
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {activeDecisionHub && (
        <Modal
          open={Boolean(activeDecisionHub)}
      onOpenChange={(open) => {
        if (!open) {
          setActiveDecisionHub(null)
        }
      }}
    >
      <ModalContent size="full" className="max-h-[94vh] max-w-[min(1200px,96vw)] overflow-hidden">
        <ModalHeader>
          <ModalTitle>Decision hub</ModalTitle>
          <ModalDescription>{activeDecisionHub.milestone.title}</ModalDescription>
        </ModalHeader>

            <div className="max-h-[70vh] overflow-y-auto pr-2 pb-4">
              <DecisionCenter
                experience={activeDecisionHub.experience}
                onApprovalSelect={handleApprovalLaunch}
                onMaterialsOpen={handleMaterialsOpen}
                onCommunicationOpen={handleThreadOpen}
              />
            </div>

            <ModalFooter>
              <Button variant="secondary" onClick={() => setActiveDecisionHub(null)}>
                Close
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </div>
  )
}

type DetailAccent = 'emerald' | 'rose' | 'slate'

interface DetailListProps {
  title: string
  items: string[]
  emptyCopy: string
  accent: DetailAccent
}

function DetailList({ title, items, emptyCopy, accent }: DetailListProps) {
  const accentColor =
    accent === 'emerald'
      ? 'bg-emerald-400/80'
      : accent === 'rose'
        ? 'bg-rose-400/80'
        : 'bg-slate-400/80'

  return (
    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2">
              <span className={`mt-[6px] h-1.5 w-1.5 rounded-full ${accentColor}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyCopy}</p>
      )}
    </div>
  )
}

interface DecisionCenterProps {
  experience: MilestoneExperience
  onApprovalSelect: (approval: ApprovalItem) => void
  onMaterialsOpen: (board: MaterialBoard) => void
  onCommunicationOpen: (thread: CommunicationThread) => void
}

function DecisionCenter({
  experience,
  onApprovalSelect,
  onMaterialsOpen,
  onCommunicationOpen,
}: DecisionCenterProps) {
  return (
    <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200/60 bg-white/95 shadow-[0_20px_60px_rgba(15,15,15,0.08)]">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Decision hub</p>
          <h3 className="text-lg font-semibold text-slate-900">Keep every decision inside the timeline</h3>
        </div>
        <p className="text-sm text-muted-foreground md:max-w-xl">
          Launch the Approval Theater, material drops, and live communications without losing scroll position.
        </p>
      </div>

      <div className="grid gap-4 px-6 py-6 md:grid-cols-3">
        {/* Approvals */}
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-inner">
          <div className="flex items-center gap-2 text-emerald-700">
            <FileCheck2 className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Approvals</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {experience.approvals.length} decision{experience.approvals.length > 1 ? 's' : ''} ready
          </p>
          <div className="mt-4 space-y-3">
            {experience.approvals.map((approval) => (
              <button
                key={approval.id}
                type="button"
                onClick={() => onApprovalSelect(approval)}
                className="w-full rounded-xl border border-emerald-200/80 bg-white/90 px-3 py-2 text-left transition hover:border-emerald-400 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">{approval.title}</p>
                  <Badge
                    variant="outline"
                    className="border-emerald-200 text-[0.65rem] uppercase tracking-wide text-emerald-700"
                  >
                    {approval.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{approval.description}</p>
              </button>
            ))}
          </div>
          <Button
            className="mt-4 w-full"
            disabled={experience.approvals.length === 0}
            onClick={() => experience.approvals[0] && onApprovalSelect(experience.approvals[0])}
          >
            Launch Approval Theater
          </Button>
        </div>

        {/* Materials */}
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-inner">
          <div className="flex items-center gap-2 text-amber-700">
            <Palette className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Material boards</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-900">{experience.materials.title}</p>
          <p className="text-sm text-muted-foreground">{experience.materials.description}</p>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Curated by</span>
              <span className="font-medium text-slate-900">{experience.materials.curatedBy}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">ETA</span>
              <span className="font-medium text-slate-900">{experience.materials.eta}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Budget</span>
              <span className="font-medium text-slate-900">
                {formatCurrency(experience.materials.totalEstimate, experience.materials.currency)}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {experience.materials.shipments.map((shipment) => (
              <div key={shipment.id} className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900">{shipment.label}</p>
                  <span className="text-xs uppercase tracking-wide text-amber-700">
                    {formatStatus(shipment.status)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{shipment.notes ?? `ETA ${shipment.eta}`}</p>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            className="mt-4 w-full border-amber-200 text-amber-800 hover:bg-amber-50"
            onClick={() => onMaterialsOpen(experience.materials)}
          >
            Open materials modal
          </Button>
        </div>

        {/* Communications */}
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-5 shadow-inner">
          <div className="flex items-center gap-2 text-indigo-700">
            <MessageSquare className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Communications</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-900">{experience.communications.subject}</p>
          <p className="text-sm text-muted-foreground">{experience.communications.summary}</p>

          <div className="mt-4 space-y-2">
            {experience.communications.messages.slice(0, 2).map((message) => (
              <div key={message.id} className="rounded-xl border border-indigo-100 bg-white/90 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900">{message.author}</p>
                  <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                </div>
                <p className="text-xs uppercase tracking-wide text-indigo-600">{message.role}</p>
                <p className="mt-1 text-sm text-slate-700">{message.body}</p>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            className="mt-4 w-full border-indigo-200 text-indigo-800 hover:bg-indigo-50"
            onClick={() => onCommunicationOpen(experience.communications)}
          >
            Open communications modal
          </Button>
        </div>
      </div>
    </div>
  )
}

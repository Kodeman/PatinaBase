'use client'

import { useState } from 'react'
import {
  ImmersiveTimelineCarousel,
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

// ——— Sample milestone data ———
const sampleMilestones: MilestoneDetail[] = [
  {
    id: '1',
    title: 'Initial Consultation',
    description:
      'Met with designer to discuss vision, budget, and timeline. Reviewed inspiration photos and established project scope.',
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
    description:
      'Designer creates comprehensive design concepts including floor plans, color palettes, and furniture selections.',
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
    description:
      'Review and approve the final design concepts and material selections.',
    sequenceNumber: 3,
    totalMilestones: 6,
    progress: 85,
    status: 'approval-needed',
    date: new Date('2025-02-15'),
    phase: 'Design',
    approval: {
      id: 'a1',
      title: 'Design Concept Approval',
      description:
        'Please review the final design concepts, floor plans, and material selections.',
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
    description:
      'Professional installation of all furniture, fixtures, and décor.',
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
    description:
      'Tour your completed space, final touches, and project completion celebration.',
    sequenceNumber: 6,
    totalMilestones: 6,
    progress: 0,
    status: 'upcoming',
    date: new Date('2025-03-22'),
    phase: 'Completion',
  },
]

// ——— Types ———
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

// ——— Milestone experiences (rich data for certain milestones) ———
const milestoneExperiences: Record<string, MilestoneExperience> = {
  '2': {
    approvals: [
      {
        id: 'approval-living-room-concept',
        title: 'Living Room Concept Layers',
        description:
          'Approve the plaster fireplace, inset brass shelf, and curated art direction.',
        type: 'design',
        status: 'pending',
        recommendedAction: 'approve',
        beforeImage:
          'https://images.unsplash.com/photo-1481277542470-605612bd2d61?w=900',
        afterImage:
          'https://images.unsplash.com/photo-1505692794400-90c45332a452?w=900',
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
        timelineImpact: { days: 2, affectedMilestones: ['Material Ordering'] },
        designerNote:
          'The plaster finish warms the envelope while the inset brass rail keeps it modern.',
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
        { id: 'item-sofa', name: 'Custom channel sofa', vendor: 'Holm & Reed', category: 'Seating', finish: 'Bouclé dune', quantity: 1, status: 'pending' },
        { id: 'item-lamp', name: 'Linea floor lamp', vendor: 'Atelier 19', category: 'Lighting', finish: 'Antique brass', quantity: 2, status: 'approved' },
        { id: 'item-rug', name: 'Hand-knotted wool rug', vendor: 'Loom + Field', category: 'Textile', finish: 'Oatmeal / Slate', quantity: 1, status: 'pending' },
      ],
      shipments: [
        { id: 'ship-textiles', label: 'Textiles + Rugs', status: 'ordered', eta: 'Mar 12', notes: 'Awaiting COM cuttings for review' },
        { id: 'ship-casegoods', label: 'Casegoods & Lighting', status: 'awaiting', eta: 'Mar 18', notes: 'Release deposit once concept is approved' },
      ],
    },
    communications: {
      id: 'thread-concept',
      subject: 'Concept refinement notes',
      summary: 'Discussed warmer walnut accents and the reading cove scale before locking documentation.',
      lastUpdated: 'Feb 18 · 3:24 PM',
      messages: [
        { id: 'msg-1', author: 'Leah Kochaver', role: 'designer', timestamp: 'Feb 18 · 3:24 PM', body: 'Uploading the revised render set with softened plaster tone and brass picture rail.' },
        { id: 'msg-2', author: 'Morgan Ellis', role: 'client', timestamp: 'Feb 18 · 4:02 PM', body: 'Love the warmth! Can we keep a single walnut ledge for heirloom books?' },
        { id: 'msg-3', author: 'Noah Patel', role: 'producer', timestamp: 'Feb 18 · 4:25 PM', body: 'Flagging that walnut detail adds 3 days to the millwork lead unless we confirm today.' },
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
        costImpact: { amount: 8900, currency: 'USD' },
        timelineImpact: { days: 4, affectedMilestones: ['Material Ordering', 'Installation'] },
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
        costImpact: { amount: 3100, currency: 'USD' },
        timelineImpact: { days: 0, affectedMilestones: ['Material Ordering'] },
        alternatives: [
          { id: 'alt-ceramic', title: 'Ceramic Dome Set', description: 'Matte ceramic with brass knuckles, ships faster.', costDifference: -450, timelineDifference: -5 },
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
        { id: 'item-leather', name: 'Aniline leather hide', vendor: 'Moore & Giles', category: 'Leather', finish: 'Saddle / 3265', quantity: 3, status: 'pending' },
        { id: 'item-table', name: 'Custom oak dining table', vendor: 'Northhouse Studio', category: 'Casegood', finish: 'Bleached oak', quantity: 1, status: 'ordered' },
        { id: 'item-pendant', name: 'Glass pendant trio', vendor: 'Allied Maker', category: 'Lighting', finish: 'Frosted glass / brass', quantity: 1, status: 'pending' },
      ],
      shipments: [
        { id: 'ship-banquette', label: 'Banquette fabrication slot', status: 'ordered', eta: 'Apr 02', notes: 'Hold pending client approval' },
        { id: 'ship-lighting', label: 'Lighting production', status: 'in_transit', eta: 'Mar 28' },
      ],
    },
    communications: {
      id: 'thread-approvals',
      subject: 'Banquette comfort tweaks',
      summary: 'Thread captures the cushioning tests and center seam decision.',
      lastUpdated: 'Feb 23 · 11:10 AM',
      messages: [
        { id: 'msg-4', author: 'Morgan Ellis', role: 'client', timestamp: 'Feb 23 · 9:02 AM', body: 'We loved the showroom sample but prefer a slightly taller back for dinner parties.' },
        { id: 'msg-5', author: 'Leah Kochaver', role: 'designer', timestamp: 'Feb 23 · 10:40 AM', body: 'Adding 3" to the back cushion and testing dual-density foam. Uploading a sketch now.' },
        { id: 'msg-6', author: 'Noah Patel', role: 'producer', timestamp: 'Feb 23 · 11:10 AM', body: 'Fabricator confirmed the change keeps lead time the same if released before Friday.' },
      ],
    },
  },
}

// ——— Helpers ———
const formatCurrency = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)

const formatStatus = (status: string) => status.replace(/_/g, ' ')

const formatTimelineDate = (date?: Date) =>
  date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'

const statusTextClass = (status?: string) => {
  switch (status) {
    case 'completed': return 'text-patina-sage'
    case 'in_progress': return 'text-patina-clay'
    case 'approval-needed': return 'text-patina-terracotta'
    case 'upcoming': return 'text-patina-aged-oak'
    default: return 'text-patina-aged-oak'
  }
}

const getProgressBarColor = (value?: number) => {
  if (value === undefined) return 'bg-patina-pearl'
  if (value >= 100) return 'bg-patina-sage'
  if (value >= 40) return 'bg-patina-clay'
  if (value > 0) return 'bg-patina-terracotta'
  return 'bg-patina-pearl'
}

const materialStatusClass: Record<MaterialStatus, string> = {
  pending: 'text-patina-terracotta',
  approved: 'text-patina-sage',
  ordered: 'text-patina-clay',
}

const shipmentStatusClass: Record<ShipmentStatus, string> = {
  awaiting: 'text-patina-aged-oak',
  ordered: 'text-patina-clay',
  in_transit: 'text-patina-dusty-blue',
  delivered: 'text-patina-sage',
}

// ——— Main Page ———
export default function ImmersiveTimelineDemoPage() {
  const [activeMilestoneId, setActiveMilestoneId] = useState<string>('')
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null)
  const [activeMaterialsBoard, setActiveMaterialsBoard] = useState<MaterialBoard | null>(null)
  const [activeThread, setActiveThread] = useState<CommunicationThread | null>(null)
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null)

  const handleMilestoneChange = (milestoneId: string) => {
    setActiveMilestoneId(milestoneId)
    setExpandedMilestoneId(null)
  }

  // ——— Hero section — typography-first ———
  const heroSection = (
    <div className="relative min-h-screen flex flex-col justify-end pb-24 px-[clamp(1.5rem,5vw,4rem)] bg-[var(--bg-primary)]">
      <p className="type-meta">Patina — Client Timeline</p>
      <h1 className="type-page-title mt-4" style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)', fontWeight: 400 }}>
        Oak Street<br />
        <span className="font-heading italic text-patina-aged-oak" style={{ fontSize: '0.65em' }}>Residence</span>
      </h1>
      <p className="type-body mt-4 max-w-xl">
        Interior design &amp; furnishing project. Scroll to explore your timeline, review decisions, and celebrate milestones.
      </p>

      {/* Strata mark */}
      <div className="flex flex-col gap-1.5 py-8">
        <div className="h-[2px] w-full max-w-[200px] bg-patina-mocha" />
        <div className="h-[2px] w-[160px] bg-patina-clay opacity-70" />
        <div className="h-[2px] w-[120px] bg-patina-clay opacity-35" />
      </div>

      <div className="flex items-baseline gap-12 flex-wrap">
        <div>
          <span className="type-data-large">62</span>
          <span className="type-meta ml-2">% complete</span>
        </div>
        <div className="h-8 w-px bg-patina-pearl" />
        <div>
          <span className="type-data-large">2</span>
          <span className="type-meta ml-2">of 6 milestones</span>
        </div>
      </div>

      <div className="mt-16 animate-bounce">
        <p className="type-meta-small">Scroll to explore</p>
        <svg
          className="mt-2 h-5 w-5 text-patina-aged-oak"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </div>
  )

  // ——— Typography-forward milestone renderer (no visible card container) ———
  const renderMilestone = (milestone: MilestoneDetail, isActive: boolean) => {
    const experience = milestoneExperiences[milestone.id]
    const needsAttention = milestone.status === 'approval-needed' || milestone.status === 'changes-requested'
    const isExpanded = expandedMilestoneId === milestone.id
    const toggleExpanded = () =>
      setExpandedMilestoneId((current) => (current === milestone.id ? null : milestone.id))

    return (
      <div className="px-[clamp(1.5rem,4vw,3.5rem)] py-10">
        {/* Phase + status line */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          {milestone.phase && <span className="type-meta">{milestone.phase}</span>}
          <span className={`type-meta font-medium ${statusTextClass(milestone.status)}`}>
            {formatStatus(milestone.status)}
          </span>
          {needsAttention && (
            <span className="type-meta font-medium text-patina-terracotta">Needs attention</span>
          )}
          {isActive && (
            <span className="type-meta font-medium text-patina-clay">Active</span>
          )}
        </div>

        {/* Title */}
        <h2 className="font-heading text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-tight">
          {milestone.title}
        </h2>

        {/* Sequence + date */}
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <span className="type-meta">
            Milestone {milestone.sequenceNumber} of {milestone.totalMilestones}
          </span>
          <span className="type-meta">Target {formatTimelineDate(milestone.date)}</span>
        </div>

        {/* Description */}
        {milestone.description && (
          <p className="type-body mt-4">{milestone.description}</p>
        )}

        {/* Progress — thin line with large numeral */}
        {milestone.progress !== undefined && (
          <div className="mt-6 flex items-end gap-4">
            <span className="type-data-large">{milestone.progress}</span>
            <div className="flex-1 pb-2">
              <div className="h-[2px] w-full bg-patina-pearl overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${getProgressBarColor(milestone.progress)}`}
                  style={{ width: `${milestone.progress ?? 0}%` }}
                />
              </div>
            </div>
            <span className="type-meta pb-2">% complete</span>
          </div>
        )}

        {/* Strata separator */}
        <div className="h-px bg-patina-pearl my-6" />

        {/* Action row */}
        <div className="flex flex-wrap items-center gap-4">
          {experience && (
            <button
              type="button"
              onClick={() => setSelectedApproval(experience.approvals[0])}
              className="type-meta text-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              Review approvals
            </button>
          )}
          {experience?.communications && (
            <button
              type="button"
              onClick={() => setActiveThread(experience.communications)}
              className="type-meta text-patina-dusty-blue hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Messages ({experience.communications.messages.length})
            </button>
          )}
          {experience?.materials && (
            <button
              type="button"
              onClick={() => setActiveMaterialsBoard(experience.materials)}
              className="type-meta text-patina-clay hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5"
            >
              <Palette className="h-3.5 w-3.5" />
              Materials
            </button>
          )}

          <button
            type="button"
            onClick={toggleExpanded}
            className="type-meta text-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 ml-auto"
          >
            {isExpanded ? 'Hide details' : 'View details'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Expanded details */}
        <div className={`overflow-hidden transition-all duration-500 ease-out ${
          isExpanded ? 'max-h-[1200px] opacity-100 mt-6' : 'max-h-0 opacity-0'
        }`}>
          <div className={`space-y-6 ${isExpanded ? '' : 'pointer-events-none'}`}>
            {/* Checklist */}
            {milestone.checklist && milestone.checklist.length > 0 && (
              <div>
                <p className="type-meta mb-3">Checklist</p>
                {milestone.checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2 text-sm">
                    <span className={`h-1.5 w-1.5 rounded-full ${item.completed ? 'bg-patina-sage' : 'bg-patina-pearl'}`} />
                    <span className={item.completed ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Approval */}
            {milestone.approval && milestone.approval.status === 'pending' && (
              <div className="border-l-2 border-patina-terracotta pl-4">
                <p className="type-meta text-patina-terracotta">Pending approval</p>
                <p className="font-heading text-lg mt-1 text-[var(--text-primary)]">{milestone.approval.title}</p>
                <p className="type-body-small mt-1">{milestone.approval.description}</p>
                {milestone.approval.value && (
                  <p className="type-data-large mt-2">${milestone.approval.value.toLocaleString()}</p>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedApproval(milestone.approval as unknown as ApprovalItem)}
                  className="mt-3 rounded-[3px] bg-patina-charcoal px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Review
                </button>
              </div>
            )}

            {/* Decision center preview */}
            {experience && (
              <div className="border-t border-[var(--border-default)] pt-6">
                <p className="type-meta mb-1">Decision hub</p>
                <p className="type-body-small mb-4">
                  Launch approvals, material boards, and communications without losing scroll position.
                </p>
                <div className="grid gap-6 md:grid-cols-3">
                  {/* Approvals */}
                  <div>
                    <p className="type-meta-small text-patina-sage mb-2 flex items-center gap-1">
                      <FileCheck2 className="h-3 w-3" />
                      Approvals
                    </p>
                    <p className="font-heading text-lg font-medium text-[var(--text-primary)]">
                      {experience.approvals.length} decision{experience.approvals.length > 1 ? 's' : ''} ready
                    </p>
                    {experience.approvals.map((approval) => (
                      <button
                        key={approval.id}
                        type="button"
                        onClick={() => setSelectedApproval(approval)}
                        className="mt-2 w-full text-left border-b border-[var(--border-subtle)] pb-2 hover:text-[var(--accent-primary)] transition-colors"
                      >
                        <p className="text-sm font-medium text-[var(--text-primary)]">{approval.title}</p>
                        <p className="type-meta-small mt-0.5">{approval.status}</p>
                      </button>
                    ))}
                  </div>
                  {/* Materials */}
                  <div>
                    <p className="type-meta-small text-patina-clay mb-2 flex items-center gap-1">
                      <Palette className="h-3 w-3" />
                      Materials
                    </p>
                    <p className="font-heading text-lg font-medium text-[var(--text-primary)]">{experience.materials.title}</p>
                    <p className="type-body-small mt-1">{experience.materials.description}</p>
                    <button
                      type="button"
                      onClick={() => setActiveMaterialsBoard(experience.materials)}
                      className="mt-2 type-meta text-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Open materials
                    </button>
                  </div>
                  {/* Communications */}
                  <div>
                    <p className="type-meta-small text-patina-dusty-blue mb-2 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Communications
                    </p>
                    <p className="font-heading text-lg font-medium text-[var(--text-primary)]">{experience.communications.subject}</p>
                    <p className="type-body-small mt-1">{experience.communications.summary}</p>
                    <button
                      type="button"
                      onClick={() => setActiveThread(experience.communications)}
                      className="mt-2 type-meta text-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Open thread
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ImmersiveTimelineCarousel
        milestones={sampleMilestones}
        activeMilestoneId={activeMilestoneId}
        onMilestoneChange={handleMilestoneChange}
        heroSection={heroSection}
        renderMilestone={renderMilestone}
        enableKeyboardNav
      />

      {/* Navigation hint */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 type-meta-small bg-patina-charcoal/80 text-patina-pearl px-5 py-2 rounded-[3px] backdrop-blur-sm">
        Use ↑↓ or J/K to navigate · Scroll freely or snap to milestones
      </div>

      {/* Approval Theater */}
      {selectedApproval && (
        <ApprovalTheater
          open={Boolean(selectedApproval)}
          onOpenChange={(open) => { if (!open) setSelectedApproval(null) }}
          approval={selectedApproval}
          mode="fullscreen"
          backdrop="blur"
        />
      )}

      {/* Materials Modal — typography-forward */}
      {activeMaterialsBoard && (
        <Modal
          open={Boolean(activeMaterialsBoard)}
          onOpenChange={(open) => { if (!open) setActiveMaterialsBoard(null) }}
        >
          <ModalContent
            size="xl"
            className="max-h-[92vh] max-w-[min(1000px,94vw)] overflow-hidden border-0 bg-[var(--bg-primary)] shadow-none rounded-none sm:rounded-[3px] p-0"
          >
            <div className="px-[clamp(1.5rem,4vw,3rem)] pt-8 pb-4">
              <p className="type-meta mb-2">Material board</p>
              <h2 className="type-section-head">{activeMaterialsBoard.title}</h2>
              <p className="type-body mt-2">{activeMaterialsBoard.description}</p>

              {/* Strata mini */}
              <div className="flex flex-col gap-1 py-6">
                <div className="h-[1.5px] w-[60px] bg-patina-mocha" />
                <div className="h-[1.5px] w-[48px] bg-patina-clay opacity-70" />
                <div className="h-[1.5px] w-[36px] bg-patina-clay opacity-35" />
              </div>

              {/* Metrics row */}
              <div className="flex flex-wrap items-baseline gap-10">
                <div>
                  <p className="type-meta-small">Curated by</p>
                  <p className="font-heading text-lg font-medium text-[var(--text-primary)] mt-0.5">{activeMaterialsBoard.curatedBy}</p>
                </div>
                <div className="h-6 w-px bg-patina-pearl" />
                <div>
                  <p className="type-meta-small">ETA</p>
                  <p className="font-heading text-lg font-medium text-[var(--text-primary)] mt-0.5">{activeMaterialsBoard.eta}</p>
                </div>
                <div className="h-6 w-px bg-patina-pearl" />
                <div>
                  <p className="type-meta-small">Budget</p>
                  <p className="type-data-large mt-0.5">{formatCurrency(activeMaterialsBoard.totalEstimate, activeMaterialsBoard.currency)}</p>
                </div>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-y-auto px-[clamp(1.5rem,4vw,3rem)] pb-6">
              {/* Material items */}
              <div className="border-t border-[var(--border-default)] pt-6">
                <p className="type-meta mb-4">Selections · {activeMaterialsBoard.items.length} items</p>
                {activeMaterialsBoard.items.map((item) => (
                  <div key={item.id} className="border-b border-[var(--border-subtle)] py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="type-item-name text-base">{item.name}</p>
                        <p className="type-meta-small mt-0.5">{item.vendor} · {item.category} · {item.finish}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`type-meta-small font-medium ${materialStatusClass[item.status]}`}>
                          {formatStatus(item.status)}
                        </span>
                        <p className="type-meta-small mt-0.5">Qty {item.quantity}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Logistics */}
              <div className="border-t border-[var(--border-default)] pt-6 mt-6">
                <p className="type-meta mb-4">Logistics · {activeMaterialsBoard.shipments.length} shipments</p>
                {activeMaterialsBoard.shipments.map((shipment) => (
                  <div key={shipment.id} className="border-b border-[var(--border-subtle)] py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{shipment.label}</p>
                        {shipment.notes && <p className="type-meta-small mt-0.5">{shipment.notes}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`type-meta-small font-medium ${shipmentStatusClass[shipment.status]}`}>
                          {formatStatus(shipment.status)}
                        </span>
                        <p className="type-meta-small mt-0.5">ETA {shipment.eta}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer — hairline top, no bg */}
            <div className="flex items-center justify-end gap-3 border-t border-[var(--border-default)] px-[clamp(1.5rem,4vw,3rem)] py-4">
              <button
                type="button"
                onClick={() => setActiveMaterialsBoard(null)}
                className="type-meta text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                className="rounded-[3px] bg-patina-charcoal px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Share Board
              </button>
            </div>
          </ModalContent>
        </Modal>
      )}

      {/* Communications Modal — typography-forward */}
      {activeThread && (
        <Modal
          open={Boolean(activeThread)}
          onOpenChange={(open) => { if (!open) setActiveThread(null) }}
        >
          <ModalContent
            size="full"
            className="max-h-[92vh] max-w-[min(900px,94vw)] overflow-hidden border-0 bg-[var(--bg-primary)] shadow-none rounded-none sm:rounded-[3px] p-0"
          >
            <div className="px-[clamp(1.5rem,4vw,3rem)] pt-8 pb-4">
              <p className="type-meta mb-2">Thread</p>
              <h2 className="type-section-head">{activeThread.subject}</h2>
              <p className="type-body mt-2">{activeThread.summary}</p>
              <p className="type-meta-small mt-2">Updated {activeThread.lastUpdated}</p>

              {/* Strata mini */}
              <div className="flex flex-col gap-1 py-6">
                <div className="h-[1.5px] w-[60px] bg-patina-mocha" />
                <div className="h-[1.5px] w-[48px] bg-patina-clay opacity-70" />
                <div className="h-[1.5px] w-[36px] bg-patina-clay opacity-35" />
              </div>
            </div>

            <div className="max-h-[55vh] overflow-y-auto px-[clamp(1.5rem,4vw,3rem)] pb-6">
              {activeThread.messages.map((message, idx) => {
                const roleColor = message.role === 'designer'
                  ? 'text-patina-clay'
                  : message.role === 'client'
                    ? 'text-patina-sage'
                    : 'text-patina-dusty-blue'

                return (
                  <div key={message.id} className="border-b border-[var(--border-subtle)] py-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-heading text-base font-medium text-[var(--text-primary)]">{message.author}</span>
                        <span className={`type-meta-small font-medium ${roleColor}`}>{message.role}</span>
                      </div>
                      <span className="type-meta-small">{message.timestamp}</span>
                    </div>
                    <p className="type-body mt-2" style={{ maxWidth: 'none' }}>{message.body}</p>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[var(--border-default)] px-[clamp(1.5rem,4vw,3rem)] py-4">
              <button
                type="button"
                onClick={() => setActiveThread(null)}
                className="type-meta text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                className="rounded-[3px] bg-patina-charcoal px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Jump to discussion
              </button>
            </div>
          </ModalContent>
        </Modal>
      )}
    </div>
  )
}

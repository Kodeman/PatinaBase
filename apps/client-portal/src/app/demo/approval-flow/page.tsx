'use client'

import { useMemo, useState } from 'react'
import {
  ApprovalCelebration,
  ApprovalDiscussion,
  type DiscussionMessage,
  ApprovalTheater,
  type ApprovalItem,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ChangeRequestForm,
  type ChangeRequestFormData,
  CostVisualizer,
  type CostBreakdownItem,
  type PaymentSchedule,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type NextStep,
} from '@patina/design-system'
import { ArrowRight, Calendar, CheckCircle2, Clock, FileText, Layers, MessageSquare, Sparkles, Users } from 'lucide-react'

const approvalOptions: ApprovalItem[] = [
  {
    id: 'concept-package',
    title: 'Living Room Concept Package',
    description: 'Final concept boards, digital walkthrough, and curated sourcing list for the Oak Street residence.',
    type: 'design',
    status: 'pending',
    beforeImage: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=900',
    afterImage: 'https://images.unsplash.com/photo-1493666438817-866a91353ca9?w=900',
    costImpact: {
      amount: 24500,
      currency: 'USD',
      breakdown: [
        { label: 'Custom millwork', amount: 9800 },
        { label: 'Furnishings', amount: 11200 },
        { label: 'Styling', amount: 3500 },
      ],
    },
    timelineImpact: {
      days: 4,
      newDeadline: new Date('2025-03-18'),
      affectedMilestones: ['Procurement kickoff', 'Lighting installation'],
    },
    alternatives: [
      {
        id: 'concept-alt-1',
        title: 'Warm Minimalist',
        description: 'Keeps the plaster finish but swaps in brass hardware.',
        costDifference: -1800,
        timelineDifference: 0,
      },
      {
        id: 'concept-alt-2',
        title: 'Gallery Wall',
        description: 'Adds sculptural lighting and art curation.',
        costDifference: 2200,
        timelineDifference: 2,
      },
    ],
    designerNote: 'Concept keeps the architectural arches you loved while brightening the palette for more daylight bounce.',
    recommendedAction: 'approve',
  },
  {
    id: 'lighting-suite',
    title: 'Sculptural Lighting Suite',
    description: 'Layered lighting plan with Ketra scenes, dining pendant, and hallway gallery track.',
    type: 'material',
    status: 'discussion',
    images: [
      'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=900',
      'https://images.unsplash.com/photo-1505692794400-3cc0611fe257?w=900',
    ],
    costImpact: {
      amount: 12800,
      currency: 'USD',
      breakdown: [
        { label: 'Dining pendant', amount: 5200 },
        { label: 'Hallway track', amount: 3400 },
        { label: 'Ketra scenes', amount: 4200 },
      ],
    },
    timelineImpact: {
      days: 2,
      newDeadline: new Date('2025-03-22'),
      affectedMilestones: ['Electrical rough-in'],
    },
    alternatives: [
      {
        id: 'lighting-alt-1',
        title: 'Glass Pendant',
        description: 'Softer lines and shorter lead time.',
        costDifference: -900,
        timelineDifference: -1,
      },
    ],
    designerNote: 'Lead time is excellent this season—if we approve by Friday, we stay ahead of procurement windows.',
    recommendedAction: 'discuss',
  },
  {
    id: 'contractor-adjustment',
    title: 'Millwork Elevation Revision',
    description: 'Updated fireplace surround depth to integrate hidden storage and wiring chase.',
    type: 'change-order',
    status: 'approved',
    costImpact: {
      amount: 6200,
      currency: 'USD',
      breakdown: [
        { label: 'Carpentry', amount: 3600 },
        { label: 'Stone fabrication', amount: 2600 },
      ],
    },
    timelineImpact: {
      days: 0,
      newDeadline: new Date('2025-03-10'),
      affectedMilestones: ['Fireplace installation'],
    },
    designerNote: 'Approved yesterday—team already coordinated delivery sequencing.',
    recommendedAction: 'approve',
  },
]

const costBreakdownData: CostBreakdownItem[] = [
  { id: 'materials', label: 'Materials', amount: 62000, percentage: 52, category: 'materials' },
  { id: 'labor', label: 'Labor & Trades', amount: 34000, percentage: 29, category: 'labor' },
  { id: 'design', label: 'Design Fees', amount: 18000, percentage: 15, category: 'design' },
  { id: 'logistics', label: 'Logistics', amount: 5200, percentage: 4, category: 'shipping' },
]

const paymentScheduleData: PaymentSchedule[] = [
  { id: 'dep-1', label: 'Concept Sign-off', amount: 12500, dueDate: new Date('2025-02-28'), status: 'paid' },
  { id: 'dep-2', label: 'Materials Order', amount: 18000, dueDate: new Date('2025-03-20'), status: 'pending' },
  { id: 'dep-3', label: 'Installation', amount: 22000, dueDate: new Date('2025-04-18'), status: 'upcoming' },
]

const discussionSeedMessages: DiscussionMessage[] = [
  {
    id: 'msg-1',
    senderId: 'designer-1',
    senderName: 'Leah Kochaver',
    senderRole: 'designer',
    content: 'Hi! Dropped two pendant options in the folder—one with a smoked glass diffuser and one sculptural brass.',
    type: 'text',
    timestamp: new Date('2025-02-18T09:12:00'),
    isRead: true,
  },
  {
    id: 'msg-2',
    senderId: 'client-1',
    senderName: 'You',
    senderRole: 'client',
    content: 'Love the brass option. How much taller is it? Trying to picture sight lines to the courtyard.',
    type: 'text',
    timestamp: new Date('2025-02-18T09:20:00'),
    isRead: true,
  },
  {
    id: 'msg-3',
    senderId: 'designer-1',
    senderName: 'Leah Kochaver',
    senderRole: 'designer',
    content: 'Only 3” taller. I can mock up a quick visualization if you’d like to see it in context.',
    type: 'text',
    timestamp: new Date('2025-02-18T09:26:00'),
    isRead: true,
  },
  {
    id: 'msg-4',
    senderId: 'designer-1',
    senderName: 'Leah Kochaver',
    senderRole: 'designer',
    content: 'Uploading the rendering now 🎨',
    type: 'file',
    timestamp: new Date('2025-02-18T09:40:00'),
    attachments: [
      {
        id: 'file-1',
        name: 'Dining_Pendant_Render.pdf',
        url: '#',
        type: 'application/pdf',
        size: 1.2,
      },
    ],
    isRead: true,
  },
]

const celebrationNextSteps: NextStep[] = [
  {
    id: 'procurement',
    title: 'Procurement Kickoff',
    description: 'Our sourcing team orders custom pieces and confirms ship windows.',
    icon: <Layers className="h-4 w-4" />,
    estimatedTime: 'Today',
  },
  {
    id: 'scheduling',
    title: 'Trade Scheduling',
    description: 'We reserve the electrical and millwork teams for coordinated install.',
    icon: <Calendar className="h-4 w-4" />,
    estimatedTime: 'Within 3 days',
  },
  {
    id: 'celebration',
    title: 'Client Preview',
    description: 'You’ll receive a private link to a VR walkthrough before install.',
    icon: <Sparkles className="h-4 w-4" />,
    estimatedTime: 'Next week',
  },
]

const celebrationTimelineUpdate = {
  previousDate: new Date('2025-03-22'),
  newDate: new Date('2025-03-18'),
  daysAhead: 4,
}

const celebrationReceipt = {
  receiptNumber: 'APR-4521',
  timestamp: new Date('2025-02-18T10:05:00'),
}

const designerStatus = {
  isOnline: true,
  isTyping: false,
  lastSeen: new Date('2025-02-18T10:01:00'),
  averageResponseTime: 18,
}

const statusMeta: Record<
  ApprovalItem['status'],
  { label: string; color: 'warning' | 'success' | 'info' | 'neutral' }
> = {
  pending: { label: 'Awaiting decision', color: 'warning' },
  discussion: { label: 'In discussion', color: 'info' },
  approved: { label: 'Approved', color: 'success' },
  rejected: { label: 'Changes requested', color: 'neutral' },
}

export default function ApprovalFlowDemoPage() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>(approvalOptions)
  const [selectedApprovalId, setSelectedApprovalId] = useState<string>(approvalOptions[0].id)
  const [activeTab, setActiveTab] = useState<'review' | 'discuss' | 'approve'>('review')
  const [theaterOpen, setTheaterOpen] = useState(false)
  const [celebrationOpen, setCelebrationOpen] = useState(false)
  const [messages, setMessages] = useState<DiscussionMessage[]>(discussionSeedMessages)
  const [lastChangeRequest, setLastChangeRequest] = useState<ChangeRequestFormData | null>(null)

  const selectedApproval = useMemo(
    () => approvals.find((approval) => approval.id === selectedApprovalId) ?? approvals[0],
    [approvals, selectedApprovalId]
  )

  const pendingApprovals = approvals.filter(
    (approval) => approval.status === 'pending' || approval.status === 'discussion'
  )
  const approvedApprovals = approvals.filter((approval) => approval.status === 'approved')
  const totalPendingValue = pendingApprovals.reduce(
    (total, approval) => total + (approval.costImpact?.amount ?? 0),
    0
  )

  const openTheater = (approval: ApprovalItem) => {
    setSelectedApprovalId(approval.id)
    setTheaterOpen(true)
  }

  const updateApprovalStatus = (approvalId: string, status: ApprovalItem['status']) => {
    setApprovals((prev) =>
      prev.map((approval) =>
        approval.id === approvalId
          ? {
              ...approval,
              status,
            }
          : approval
      )
    )
  }

  const handleApprove = (approvalId: string) => {
    updateApprovalStatus(approvalId, 'approved')
    setTheaterOpen(false)
    setCelebrationOpen(true)
    setActiveTab('approve')
  }

  const handleRequestChanges = (approvalId: string, changes?: any) => {
    updateApprovalStatus(approvalId, 'discussion')
    setTheaterOpen(false)
    setActiveTab('discuss')
    if (changes) {
      console.info('Requested changes', changes)
    }
  }

  const handleSendMessage = (
    message: Omit<DiscussionMessage, 'id' | 'timestamp' | 'isRead'>
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        ...message,
        id: `msg-${prev.length + 1}`,
        timestamp: new Date(),
        isRead: true,
      },
    ])
  }

  const handleChangeRequest = (data: ChangeRequestFormData) => {
    setLastChangeRequest(data)
    setActiveTab('approve')
  }

  const readyForCelebration = approvedApprovals.length > 0

  return (
    <div className="min-h-screen bg-[#F7F3EE] text-[#1F1B16]">
      <header className="border-b border-black/5 bg-gradient-to-b from-white to-[#F7F3EE]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <Badge variant="subtle" color="neutral">
              Client Portal · Demo Surface
            </Badge>
            <div>
              <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#1B1205] sm:text-5xl">
                Approval flow preview
              </h1>
              <p className="mt-3 max-w-2xl text-lg text-[#5B4F43]">
                Walk clients through how reviews, discussions, signatures, and celebrations live inside the
                Patina portal—no more scattered threads or mystery status updates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-[#5B4F43]">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Immersive review theater
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-4 w-4 text-indigo-500" /> Real-time designer chat
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-amber-500" /> Celebration + next steps
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">Featured approval</p>
            <p className="mt-1 text-2xl font-semibold">{selectedApproval.title}</p>
            <p className="text-sm text-muted-foreground">{selectedApproval.description}</p>
            <Button
              className="mt-4 w-full"
              onClick={() => openTheater(selectedApproval)}
            >
              Open immersive review
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Approvals awaiting you',
              value: pendingApprovals.length,
              caption: 'Avg. turnaround 1.3 days',
            },
            {
              label: 'Total decision value',
              value: totalPendingValue
                ? `$${totalPendingValue.toLocaleString()}`
                : '$0',
              caption: 'All costs disclosed',
            },
            {
              label: 'Approvals shipped this month',
              value: approvedApprovals.length,
              caption: 'Keeps the build on track',
            },
            {
              label: 'Live collaborators',
              value: '4 team members',
              caption: 'Designer, PM, GC, client',
            },
          ].map((stat) => (
            <Card key={stat.label} className="bg-white/80 shadow-sm">
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{stat.caption}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as typeof activeTab)}
          variant="enclosed"
          className="rounded-2xl border border-black/5 bg-white/70 p-1 shadow-sm"
        >
          <TabsList className="grid gap-1 md:grid-cols-3" variant="enclosed">
            <TabsTrigger value="review" variant="enclosed" icon={<FileText className="h-4 w-4" />}>
              Review packages
            </TabsTrigger>
            <TabsTrigger value="discuss" variant="enclosed" icon={<MessageSquare className="h-4 w-4" />}>
              Discuss & iterate
            </TabsTrigger>
            <TabsTrigger value="approve" variant="enclosed" icon={<CheckCircle2 className="h-4 w-4" />}>
              Approve & celebrate
            </TabsTrigger>
          </TabsList>

          <TabsContent value="review" variant="enclosed" className="mt-4 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.7fr,1fr]">
              <Card className="bg-white/90">
                <CardHeader>
                  <CardTitle>Budget & impact at a glance</CardTitle>
                  <CardDescription>See how each approval affects investment, scheduling, and payment pacing.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <CostVisualizer
                    totalBudget={150000}
                    currentCost={126500}
                    projectedCost={132800}
                    currency="$"
                    breakdown={costBreakdownData}
                    paymentSchedule={paymentScheduleData}
                    savings={4500}
                    className="space-y-6"
                  />
                </CardContent>
              </Card>

              <div className="space-y-4">
                {approvals.map((approval) => {
                  const meta = statusMeta[approval.status]
                  return (
                    <Card key={approval.id} className="bg-white/90">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <CardTitle className="text-xl">{approval.title}</CardTitle>
                            <CardDescription>{approval.description}</CardDescription>
                          </div>
                          <Badge variant="subtle" color={meta.color}>
                            {meta.label}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {approval.costImpact?.amount && (
                          <p className="text-sm text-muted-foreground">
                            Investment impact:{' '}
                            <span className="font-medium text-foreground">
                              ${approval.costImpact.amount.toLocaleString()}
                            </span>
                          </p>
                        )}
                        {approval.timelineImpact?.newDeadline && (
                          <p className="text-sm text-muted-foreground">
                            Moves milestone to{' '}
                            <span className="font-medium text-foreground">
                              {approval.timelineImpact.newDeadline.toLocaleDateString()}
                            </span>
                          </p>
                        )}
                      </CardContent>
                      <CardFooter className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          className="w-full"
                          onClick={() => openTheater(approval)}
                        >
                          Review in theater
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setSelectedApprovalId(approval.id)
                            setActiveTab('discuss')
                          }}
                        >
                          Discuss adjustments
                        </Button>
                      </CardFooter>
                    </Card>
                  )
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="discuss" variant="enclosed" className="mt-4 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
              <ApprovalDiscussion
                approvalId={selectedApproval.id}
                approvalTitle={selectedApproval.title}
                messages={messages}
                currentUserId="client-1"
                designerStatus={designerStatus}
                onSendMessage={handleSendMessage}
                className="h-[32rem]"
              />

              <Card className="bg-white/90">
                <CardHeader>
                  <CardTitle>Request precise tweaks</CardTitle>
                  <CardDescription>Structured form routes feedback directly to the designer and PM.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ChangeRequestForm
                    approvalId={selectedApproval.id}
                    approvalTitle={selectedApproval.title}
                    onSubmit={handleChangeRequest}
                    onCancel={() => setLastChangeRequest(null)}
                    className="space-y-6"
                  />

                  {lastChangeRequest && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                      <p className="font-semibold">Request logged</p>
                      <p className="mt-1">
                        {lastChangeRequest.title} · {lastChangeRequest.priority} priority
                      </p>
                      <p className="mt-1 text-emerald-800">
                        Expect a designer response in {lastChangeRequest.expectedResponse}.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="approve" variant="enclosed" className="mt-4 space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-white/90">
                <CardHeader>
                  <CardTitle>Ready to approve?</CardTitle>
                  <CardDescription>All docs, pricing, and next steps stay bundled with the approval.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-dashed border-black/10 bg-[#F9F6F1] p-4">
                    <p className="text-sm text-muted-foreground">Approval selected</p>
                    <p className="text-lg font-semibold">{selectedApproval.title}</p>
                    <p className="text-sm text-muted-foreground">{selectedApproval.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {selectedApproval.timelineImpact?.affectedMilestones?.map((milestone) => (
                        <Badge key={milestone} variant="subtle" color="neutral">
                          {milestone}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-4 w-4" /> Designer + PM notified instantly
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-4 w-4" /> Timeline auto-refreshes
                    </span>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3 md:flex-row">
                  <Button className="w-full" onClick={() => openTheater(selectedApproval)}>
                    Reopen review
                  </Button>
                  <Button
                    className="w-full"
                    variant="secondary"
                    disabled={!readyForCelebration}
                    onClick={() => setCelebrationOpen(true)}
                  >
                    Celebrate approval
                  </Button>
                </CardFooter>
              </Card>

              <Card className="bg-white/90">
                <CardHeader>
                  <CardTitle>How the portal responds</CardTitle>
                  <CardDescription>Approving launches a clear sequence so everyone keeps moving.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-black/10 p-4">
                    <p className="text-sm text-muted-foreground">Timeline update</p>
                    <p className="mt-2 text-lg font-semibold">
                      Installation now scheduled for{' '}
                      {celebrationTimelineUpdate.newDate.toLocaleDateString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Pulled forward by {celebrationTimelineUpdate.daysAhead} days thanks to your fast approval.
                    </p>
                  </div>
                  <div className="rounded-lg border border-black/10 p-4">
                    <p className="text-sm text-muted-foreground">Receipt + documentation</p>
                    <p className="mt-2 text-lg font-semibold">#{celebrationReceipt.receiptNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      Issued {celebrationReceipt.timestamp.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-black/10 p-4">
                    <p className="text-sm text-muted-foreground">What happens next</p>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-primary" /> Procurement requests signatures for custom orders
                      </li>
                      <li className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-primary" /> Trade partners receive updated drawings
                      </li>
                      <li className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-primary" /> Celebration modal recaps savings + receipts
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <ApprovalTheater
        open={theaterOpen}
        onOpenChange={setTheaterOpen}
        approval={selectedApproval}
        mode="fullscreen"
        backdrop="blur"
        onApprove={(approvalId) => handleApprove(approvalId)}
        onRequestChanges={(approvalId, changes) => handleRequestChanges(approvalId, changes)}
      />

      <ApprovalCelebration
        open={celebrationOpen}
        onOpenChange={setCelebrationOpen}
        approvalTitle={selectedApproval.title}
        approvalType={selectedApproval.type}
        celebration={{ type: 'confetti', intensity: 'high' }}
        nextSteps={celebrationNextSteps}
        timelineUpdate={celebrationTimelineUpdate}
        confirmationReceipt={celebrationReceipt}
        onContinue={() => setCelebrationOpen(false)}
      />
    </div>
  )
}

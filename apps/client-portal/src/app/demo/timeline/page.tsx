'use client'

import { useState } from 'react'
import { StoryTimeline } from '@patina/design-system'
import type { MilestoneDetail } from '@patina/design-system'

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
      {
        id: 'm2',
        authorId: 'client-1',
        authorName: 'You',
        authorRole: 'client',
        body: 'So excited to get started! The mood board looks perfect.',
        createdAt: new Date('2025-01-15T15:00:00'),
      },
    ],
    documents: [
      {
        id: 'd1',
        title: 'Project Scope Document',
        description: 'Full project scope and timeline',
        url: '#',
        fileType: 'pdf',
        uploadedAt: new Date('2025-01-15'),
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
    checklist: [
      { id: 'c4', title: 'Floor plan drafted', completed: true },
      { id: 'c5', title: 'Color palette selected', completed: true },
      { id: 'c6', title: 'Furniture sourced', completed: true },
      { id: 'c7', title: 'Materials selected', completed: true },
    ],
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
    documents: [
      {
        id: 'd2',
        title: 'Floor Plan v1',
        url: '#',
        fileType: 'pdf',
        uploadedAt: new Date('2025-02-01'),
      },
      {
        id: 'd3',
        title: 'Material Specifications',
        url: '#',
        fileType: 'pdf',
        uploadedAt: new Date('2025-02-01'),
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
      description: 'Please review the final design concepts, floor plans, and material selections. Approving will allow us to begin ordering materials and scheduling contractors.',
      status: 'pending',
      value: 12500,
      currency: 'USD',
      documents: [
        {
          id: 'd4',
          title: 'Final Design Package',
          url: '#',
          fileType: 'pdf',
        },
      ],
    },
    checklist: [
      { id: 'c8', title: 'Review floor plan', completed: true },
      { id: 'c9', title: 'Approve color selections', completed: true },
      { id: 'c10', title: 'Sign off on furniture', completed: false },
    ],
    media: [
      {
        id: 'img3',
        url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
        type: 'image',
        caption: 'Final living room rendering',
      },
    ],
    messages: [
      {
        id: 'm3',
        authorId: 'designer-1',
        authorName: 'Leah Kochaver',
        authorRole: 'designer',
        body: 'The final design package is ready for your review. I think you\'re going to love it!',
        createdAt: new Date('2025-02-14T10:00:00'),
      },
    ],
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
    checklist: [
      { id: 'c11', title: 'Order furniture', completed: false },
      { id: 'c12', title: 'Order fixtures', completed: false },
      { id: 'c13', title: 'Schedule deliveries', completed: false },
    ],
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

export default function TimelineDemoPage() {
  const [activeMilestoneId, setActiveMilestoneId] = useState<string>('')

  const handleApprove = async (comment?: string) => {
    console.log('Approved with comment:', comment)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))
    alert('Milestone approved! ✅')
  }

  const handleRequestChanges = async (reason: string) => {
    console.log('Changes requested:', reason)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))
    alert('Change request submitted! 📝')
  }

  const handleSendMessage = async (message: string) => {
    console.log('Message sent:', message)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return (
    <div className="min-h-screen bg-[#EDE9E4]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="font-serif text-3xl font-bold">Oak Street Residence</h1>
          <p className="mt-1 text-muted-foreground">
            Interior Design & Furnishing Project
          </p>
        </div>
      </header>

      {/* Project Overview Banner */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Overall Progress
              </p>
              <p className="text-2xl font-serif font-bold">62% Complete</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-muted-foreground">
                Next Milestone
              </p>
              <p className="text-lg font-semibold">Design Approval</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-gradient-to-r from-[#D1C7B7] to-[#F59E0B] transition-all duration-500"
              style={{ width: '62%' }}
            />
          </div>
        </div>
      </div>

      {/* Timeline */}
      <StoryTimeline
        milestones={sampleMilestones.map((milestone) => ({
          ...milestone,
          onApprove: milestone.approval ? handleApprove : undefined,
          onRequestChanges: milestone.approval ? handleRequestChanges : undefined,
          onSendMessage: handleSendMessage,
        }))}
        activeMilestoneId={activeMilestoneId}
        onMilestoneChange={setActiveMilestoneId}
        showProgress
        enableKeyboardNav
      />

      {/* Footer hint */}
      <div className="bg-white border-t border-gray-200 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          🎨 Demo page showcasing new timeline components
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Click milestones to expand • Use ↑↓ or J/K to navigate
        </p>
      </div>
    </div>
  )
}

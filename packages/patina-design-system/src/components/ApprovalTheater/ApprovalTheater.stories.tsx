import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { ApprovalTheater, ApprovalItem } from './ApprovalTheater'
import { Button } from '../Button'

const meta: Meta<typeof ApprovalTheater> = {
  title: 'Client Portal/ApprovalTheater',
  component: ApprovalTheater,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof ApprovalTheater>

const mockApproval: ApprovalItem = {
  id: 'approval-1',
  title: 'Living Room Design Proposal',
  description: 'Review and approve the updated living room design featuring new furniture layout and color palette',
  type: 'design',
  status: 'pending',
  beforeImage: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
  afterImage: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800',
  images: [
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400',
    'https://images.unsplash.com/photo-1600210492493-0946911123ea?w=400',
  ],
  costImpact: {
    amount: 12500,
    currency: '$',
    breakdown: [
      { label: 'Furniture', amount: 8000 },
      { label: 'Materials', amount: 3000 },
      { label: 'Installation', amount: 1500 },
    ],
  },
  timelineImpact: {
    days: 5,
    newDeadline: new Date('2025-11-15'),
    affectedMilestones: ['Installation', 'Final Review'],
  },
  alternatives: [
    {
      id: 'alt-1',
      title: 'Budget-Friendly Option',
      description: 'Similar design with cost-effective materials',
      costDifference: -3000,
      timelineDifference: -2,
    },
  ],
  designerNote: 'This updated design incorporates your feedback on maximizing natural light while maintaining the cozy atmosphere you requested.',
  recommendedAction: 'approve',
}

const InteractiveTemplate = () => {
  const [open, setOpen] = useState(false)

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>Open Approval Theater</Button>

      <ApprovalTheater
        open={open}
        onOpenChange={setOpen}
        approval={mockApproval}
        onApprove={(id) => {
          console.log('Approved:', id)
          setOpen(false)
        }}
        onRequestChanges={(id, changes) => {
          console.log('Changes requested:', id, changes)
        }}
        onStartDiscussion={(id) => {
          console.log('Discussion started:', id)
        }}
        onSaveForLater={(id) => {
          console.log('Saved for later:', id)
        }}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <InteractiveTemplate />,
}

export const FullscreenMode: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <ApprovalTheater
        open={open}
        onOpenChange={setOpen}
        approval={mockApproval}
        mode="fullscreen"
        backdrop="blur"
      />
    )
  },
}

export const ModalMode: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <ApprovalTheater
        open={open}
        onOpenChange={setOpen}
        approval={mockApproval}
        mode="modal"
        backdrop="dim"
      />
    )
  },
}

export const WithDiscussionSuggested: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <ApprovalTheater
        open={open}
        onOpenChange={setOpen}
        approval={{
          ...mockApproval,
          recommendedAction: 'discuss',
        }}
      />
    )
  },
}

export const WithAlternative: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <ApprovalTheater
        open={open}
        onOpenChange={setOpen}
        approval={{
          ...mockApproval,
          recommendedAction: 'consider-alternative',
        }}
      />
    )
  },
}

import type { Meta, StoryObj } from '@storybook/react'
import { MilestoneCard } from './MilestoneCard'
import { Sparkles, Calendar, Users, DollarSign } from 'lucide-react'
import { Confetti } from '../Confetti/Confetti'

const meta: Meta<typeof MilestoneCard> = {
  title: 'Client Portal/MilestoneCard',
  component: MilestoneCard,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['compact', 'standard', 'hero'],
    },
    elevation: {
      control: 'select',
      options: ['subtle', 'elevated', 'floating'],
    },
    status: {
      control: 'select',
      options: ['completed', 'active', 'upcoming', 'blocked'],
    },
    celebrationType: {
      control: 'select',
      options: ['confetti', 'sparkle', 'pulse', 'none'],
    },
  },
}

export default meta
type Story = StoryObj<typeof MilestoneCard>

const mockPhotos = [
  {
    id: '1',
    url: 'https://images.unsplash.com/photo-1615873968403-89e068629265?w=400',
    alt: 'Progress photo 1',
  },
  {
    id: '2',
    url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400',
    alt: 'Progress photo 2',
  },
  {
    id: '3',
    url: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=400',
    alt: 'Progress photo 3',
  },
  {
    id: '4',
    url: 'https://images.unsplash.com/photo-1615875221248-e9a0e9d5a20c?w=400',
    alt: 'Progress photo 4',
  },
]

export const Default: Story = {
  args: {
    title: 'Design Concept Review',
    description: 'Review initial design concepts and provide feedback on the selected direction.',
    date: new Date('2024-10-15'),
    status: 'active',
    size: 'standard',
    elevation: 'elevated',
    icon: <Sparkles className="h-5 w-5" />,
  },
}

export const CompletedMilestone: Story = {
  args: {
    title: 'Initial Consultation Complete',
    description: 'Successfully completed the initial consultation and style quiz.',
    date: new Date('2024-10-01'),
    status: 'completed',
    statusText: 'Completed',
    size: 'standard',
    elevation: 'elevated',
    icon: <Calendar className="h-5 w-5" />,
    celebrationType: 'sparkle',
  },
}

export const ActiveWithProgress: Story = {
  args: {
    title: 'Space Planning in Progress',
    description: 'Your designer is creating detailed floor plans and furniture layouts.',
    date: new Date('2024-10-10'),
    status: 'active',
    size: 'standard',
    elevation: 'elevated',
    completionPercentage: 65,
    metrics: [
      { label: 'Days Active', value: '12', icon: <Calendar className="h-4 w-4" /> },
      { label: 'Team Members', value: '3', icon: <Users className="h-4 w-4" /> },
    ],
  },
}

export const WithProgressPhotos: Story = {
  args: {
    title: 'Installation Progress',
    description: 'Your furniture has arrived and installation is underway.',
    date: new Date('2024-10-20'),
    status: 'active',
    size: 'standard',
    elevation: 'elevated',
    progressPhotos: mockPhotos,
    completionPercentage: 45,
  },
}

export const WithDesignerNote: Story = {
  args: {
    title: 'Material Selection',
    description: 'Review and approve the selected materials and finishes.',
    date: new Date('2024-10-12'),
    status: 'active',
    size: 'standard',
    elevation: 'floating',
    designerNote: {
      author: 'Sarah Johnson',
      avatar: 'https://i.pravatar.cc/150?img=1',
      message: "I'm so excited about the direction we're taking with the natural materials! The oak flooring will complement the cream walls beautifully.",
      timestamp: new Date('2024-10-11'),
    },
  },
}

export const WithActions: Story = {
  args: {
    title: 'Design Approval Required',
    description: 'Review the final design package and approve to move forward.',
    date: new Date('2024-10-18'),
    status: 'active',
    size: 'standard',
    elevation: 'elevated',
    icon: <Sparkles className="h-5 w-5" />,
    primaryAction: {
      label: 'Approve Design',
      onClick: () => alert('Design approved!'),
    },
    secondaryActions: [
      {
        label: 'Request Changes',
        variant: 'outline',
        onClick: () => alert('Opening change request...'),
      },
      {
        label: 'Start Discussion',
        variant: 'ghost',
        onClick: () => alert('Opening discussion...'),
      },
    ],
  },
}

export const HeroSize: Story = {
  args: {
    title: 'Project Kickoff',
    description: 'Welcome to your interior design journey! We\'re thrilled to transform your space into something extraordinary.',
    date: new Date('2024-10-01'),
    status: 'completed',
    size: 'hero',
    elevation: 'floating',
    icon: <Sparkles className="h-6 w-6" />,
    metrics: [
      { label: 'Project Duration', value: '90 days', icon: <Calendar className="h-5 w-5" /> },
      { label: 'Team Size', value: '4', icon: <Users className="h-5 w-5" /> },
      { label: 'Budget', value: '$50,000', icon: <DollarSign className="h-5 w-5" /> },
    ],
    progressPhotos: mockPhotos,
    designerNote: {
      author: 'Sarah Johnson',
      avatar: 'https://i.pravatar.cc/150?img=1',
      message: 'Looking forward to creating your dream space!',
      timestamp: new Date('2024-10-01'),
    },
  },
}

export const CompactSize: Story = {
  args: {
    title: 'Color Palette Approved',
    description: 'Your selected color palette is ready.',
    date: new Date('2024-10-08'),
    status: 'completed',
    size: 'compact',
    elevation: 'subtle',
  },
}

export const UpcomingMilestone: Story = {
  args: {
    title: 'Final Walkthrough',
    description: 'Schedule the final walkthrough and project handoff.',
    date: new Date('2024-11-15'),
    status: 'upcoming',
    statusText: 'Coming Soon',
    size: 'standard',
    elevation: 'subtle',
  },
}

export const BlockedMilestone: Story = {
  args: {
    title: 'Budget Approval Needed',
    description: 'Additional budget approval required before proceeding.',
    date: new Date('2024-10-14'),
    status: 'blocked',
    statusText: 'Blocked',
    size: 'standard',
    elevation: 'elevated',
    primaryAction: {
      label: 'Review Budget',
      onClick: () => alert('Opening budget review...'),
    },
  },
}

export const WithConfettiCelebration: Story = {
  args: {
    title: 'Project Milestone Achieved!',
    description: 'Congratulations on completing the design phase!',
    date: new Date(),
    status: 'completed',
    size: 'hero',
    elevation: 'floating',
    celebrationType: 'confetti',
    celebrationComponent: <Confetti count={50} duration={3000} />,
  },
}

export const FullFeature: Story = {
  args: {
    title: 'Design Package Review',
    description: 'Review your complete design package including floor plans, mood boards, and product specifications.',
    date: new Date('2024-10-16'),
    status: 'active',
    size: 'hero',
    elevation: 'floating',
    icon: <Sparkles className="h-6 w-6" />,
    completionPercentage: 85,
    metrics: [
      { label: 'Days to Complete', value: '5', icon: <Calendar className="h-5 w-5" /> },
      { label: 'Items Selected', value: '47', icon: <Sparkles className="h-5 w-5" /> },
      { label: 'Budget Used', value: '78%', icon: <DollarSign className="h-5 w-5" /> },
    ],
    progressPhotos: mockPhotos,
    designerNote: {
      author: 'Sarah Johnson',
      avatar: 'https://i.pravatar.cc/150?img=1',
      message: 'I\'ve curated every detail to match your style preferences. Can\'t wait to hear your thoughts!',
      timestamp: new Date('2024-10-15'),
    },
    primaryAction: {
      label: 'View Full Package',
      onClick: () => alert('Opening design package...'),
    },
    secondaryActions: [
      {
        label: 'Download PDF',
        variant: 'outline',
        onClick: () => alert('Downloading...'),
      },
      {
        label: 'Schedule Call',
        variant: 'ghost',
        onClick: () => alert('Opening calendar...'),
      },
    ],
  },
}

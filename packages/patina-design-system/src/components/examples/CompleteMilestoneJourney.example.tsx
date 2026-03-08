'use client'

/**
 * Complete Milestone Journey Example
 *
 * This example demonstrates a full client journey through their interior design project,
 * showcasing all Team Charlie milestone and celebration components working together.
 *
 * @example
 * Use this as a reference for implementing the complete milestone experience
 * in your client portal.
 */

import React, { useState } from 'react'
import {
  MilestoneCard,
  CelebrationSequence,
  ProgressPhotography,
  ComparisonSlider,
  MediaCarousel,
  AchievementBadge,
  DesignerMessage,
  ProjectCompletionCelebration,
  Sparkles,
  type ProgressPhoto,
  type MediaItem,
  type MilestoneAction,
  type ProjectStats,
  type TeamMember,
} from '@patina/design-system'
import { Calendar, Users, Clock, CheckCircle, Sparkles as SparklesIcon } from 'lucide-react'

// Types
type MilestoneStatus = 'completed' | 'active' | 'upcoming' | 'blocked'
type CelebrationType = 'none' | 'approval' | 'completion' | 'achievement'

interface Milestone {
  id: number
  title: string
  description: string
  status: MilestoneStatus
  date: Date
  completionPercentage?: number
  photos?: ProgressPhoto[]
  designerNote?: {
    author: string
    avatar: string
    message: string
    timestamp: Date
  }
  actions?: {
    primary?: MilestoneAction
    secondary?: MilestoneAction[]
  }
}

/**
 * Complete Project Timeline Component
 * Demonstrates the full milestone journey with celebrations
 */
export const CompleteMilestoneJourney: React.FC = () => {
  // State management
  const [activeMilestoneId, setActiveMilestoneId] = useState<number>(2)
  const [celebrationType, setCelebrationType] = useState<CelebrationType>('none')
  const [showProjectCompletion, setShowProjectCompletion] = useState(false)
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>(['first-approval'])

  // Sample data
  const progressPhotos: ProgressPhoto[] = [
    {
      id: '1',
      url: 'https://images.unsplash.com/photo-1615873968403-89e068629265?w=800',
      alt: 'Living room before renovation',
      caption: 'Initial space assessment',
      timestamp: new Date('2024-09-01'),
      category: 'before',
    },
    {
      id: '2',
      url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800',
      alt: 'Design concepts on table',
      caption: 'Design mood board',
      timestamp: new Date('2024-09-15'),
      category: 'during',
    },
    {
      id: '3',
      url: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800',
      alt: 'Furniture being installed',
      caption: 'Installation day',
      timestamp: new Date('2024-10-01'),
      category: 'during',
    },
    {
      id: '4',
      url: 'https://images.unsplash.com/photo-1615875221248-e9a0e9d5a20c?w=800',
      alt: 'Completed living room',
      caption: 'Final result',
      timestamp: new Date('2024-10-15'),
      category: 'after',
    },
  ]

  const mediaItems: MediaItem[] = [
    {
      id: '1',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1615873968403-89e068629265?w=1200',
      alt: 'Design concept 1',
      caption: 'Modern minimalist approach',
    },
    {
      id: '2',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200',
      alt: 'Design concept 2',
      caption: 'Warm contemporary style',
    },
  ]

  const teamMembers: TeamMember[] = [
    { name: 'Sarah Johnson', role: 'Lead Designer', avatar: 'https://i.pravatar.cc/150?img=1' },
    { name: 'Mike Chen', role: 'Project Manager', avatar: 'https://i.pravatar.cc/150?img=2' },
    { name: 'Emily Rodriguez', role: 'Interior Stylist', avatar: 'https://i.pravatar.cc/150?img=3' },
  ]

  const projectStats: ProjectStats = {
    duration: 45,
    milestonesCompleted: 8,
    approvalsReceived: 6,
    photosShared: 47,
  }

  // Milestone data
  const milestones: Milestone[] = [
    {
      id: 1,
      title: 'Initial Consultation',
      description: 'Met with Sarah to discuss vision, budget, and timeline.',
      status: 'completed',
      date: new Date('2024-09-01'),
      photos: [progressPhotos[0]],
      designerNote: {
        author: 'Sarah Johnson',
        avatar: 'https://i.pravatar.cc/150?img=1',
        message: 'So excited to start this journey with you! Your vision for a modern, cozy space is inspiring.',
        timestamp: new Date('2024-09-01'),
      },
    },
    {
      id: 2,
      title: 'Design Development',
      description: 'Review mood boards, color palettes, and furniture selections.',
      status: 'active',
      date: new Date('2024-09-20'),
      completionPercentage: 75,
      photos: progressPhotos.slice(1, 3),
      designerNote: {
        author: 'Sarah Johnson',
        avatar: 'https://i.pravatar.cc/150?img=1',
        message: "I've curated some beautiful pieces that perfectly match your style. Can't wait for your feedback!",
        timestamp: new Date('2024-09-19'),
      },
      actions: {
        primary: {
          label: 'Approve Design',
          onClick: () => handleMilestoneApproval(2),
        },
        secondary: [
          {
            label: 'Request Changes',
            variant: 'outline',
            onClick: () => console.log('Request changes'),
          },
          {
            label: 'Schedule Call',
            variant: 'ghost',
            onClick: () => console.log('Schedule call'),
          },
        ],
      },
    },
    {
      id: 3,
      title: 'Final Approval',
      description: 'Review complete design package and give final approval.',
      status: 'upcoming',
      date: new Date('2024-10-05'),
    },
    {
      id: 4,
      title: 'Installation',
      description: 'Professional installation of all furniture and decor.',
      status: 'upcoming',
      date: new Date('2024-10-15'),
    },
  ]

  // Event handlers
  const handleMilestoneApproval = (milestoneId: number) => {
    setCelebrationType('approval')

    // Update milestone status after celebration
    setTimeout(() => {
      setActiveMilestoneId(milestoneId + 1)
      setCelebrationType('none')

      // Unlock achievement
      if (!unlockedAchievements.includes('quick-responder')) {
        setUnlockedAchievements([...unlockedAchievements, 'quick-responder'])
      }
    }, 4000)
  }

  const handleProjectComplete = () => {
    setShowProjectCompletion(true)
  }

  const handleShare = () => {
    console.log('Share project')
  }

  const handleTestimonial = () => {
    console.log('Leave testimonial')
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <Sparkles count={15} size="lg" continuous>
          <h1 className="text-4xl md:text-5xl font-bold">Your Design Journey</h1>
        </Sparkles>
        <p className="text-xl text-muted-foreground">Living Room Transformation</p>
      </div>

      {/* Active Milestones */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Project Milestones</h2>
        {milestones.map((milestone) => (
          <MilestoneCard
            key={milestone.id}
            title={milestone.title}
            description={milestone.description}
            status={milestone.status}
            size={milestone.id === activeMilestoneId ? 'hero' : 'standard'}
            elevation={milestone.id === activeMilestoneId ? 'floating' : 'elevated'}
            date={milestone.date}
            icon={
              milestone.status === 'completed' ? (
                <CheckCircle className="h-5 w-5" />
              ) : milestone.status === 'active' ? (
                <Clock className="h-5 w-5" />
              ) : (
                <SparklesIcon className="h-5 w-5" />
              )
            }
            completionPercentage={milestone.completionPercentage}
            progressPhotos={milestone.photos}
            designerNote={milestone.designerNote}
            primaryAction={milestone.actions?.primary}
            secondaryActions={milestone.actions?.secondary}
            celebrationType={milestone.status === 'completed' ? 'sparkle' : 'none'}
            celebrateOnView={milestone.status === 'completed'}
          />
        ))}
      </section>

      {/* Progress Photography */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Progress Gallery</h2>
        <ProgressPhotography
          photos={progressPhotos}
          defaultView="timeline"
          enableLightbox
          enableFiltering
          showTimestamps
        />
      </section>

      {/* Before/After Comparison */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Before & After</h2>
        <ComparisonSlider
          beforeImage="https://images.unsplash.com/photo-1615873968403-89e068629265?w=1200"
          afterImage="https://images.unsplash.com/photo-1615875221248-e9a0e9d5a20c?w=1200"
          beforeLabel="Before"
          afterLabel="After"
          aspectRatio="wide"
        />
      </section>

      {/* Design Concepts Gallery */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Design Concepts</h2>
        <MediaCarousel
          items={mediaItems}
          showNavigation
          showPagination
          showThumbnails
          aspectRatio="wide"
        />
      </section>

      {/* Designer Messages */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Designer Updates</h2>
        <div className="space-y-4">
          <DesignerMessage
            designerName="Sarah Johnson"
            designerAvatar="https://i.pravatar.cc/150?img=1"
            designerRole="Lead Designer"
            type="text"
            message="I'm thrilled with how the design is coming together! The combination of textures and colors creates such a warm, inviting atmosphere while maintaining that modern aesthetic you love."
            timestamp={new Date('2024-09-25')}
          />
          <DesignerMessage
            designerName="Mike Chen"
            designerAvatar="https://i.pravatar.cc/150?img=2"
            designerRole="Project Manager"
            type="text"
            message="Quick update: All furniture has been ordered and we're on track for the October 15th installation date!"
            timestamp={new Date('2024-09-28')}
          />
        </div>
      </section>

      {/* Achievements */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Your Achievements</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AchievementBadge
            title="First Approval"
            description="Approved your first design milestone"
            type="approval"
            tier="gold"
            unlocked={unlockedAchievements.includes('first-approval')}
            showSparkles={unlockedAchievements.includes('first-approval')}
            earnedDate={new Date('2024-09-15')}
          />
          <AchievementBadge
            title="Quick Responder"
            description="Responded to designer within 24 hours"
            type="speed"
            tier="silver"
            unlocked={unlockedAchievements.includes('quick-responder')}
            showSparkles={unlockedAchievements.includes('quick-responder')}
            earnedDate={unlockedAchievements.includes('quick-responder') ? new Date() : undefined}
          />
          <AchievementBadge
            title="Design Enthusiast"
            description="Complete all design reviews"
            type="excellence"
            tier="platinum"
            unlocked={false}
            progress={60}
          />
          <AchievementBadge
            title="Collaboration Master"
            description="Work seamlessly with your team"
            type="collaboration"
            tier="gold"
            unlocked={false}
            progress={75}
          />
          <AchievementBadge
            title="Project Champion"
            description="Complete your first project"
            type="completion"
            tier="platinum"
            unlocked={false}
            progress={85}
          />
          <AchievementBadge
            title="Trendsetter"
            description="Choose cutting-edge design elements"
            type="milestone"
            tier="bronze"
            unlocked={false}
            progress={40}
          />
        </div>
      </section>

      {/* Project Stats */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Project Progress</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-lg border p-6 text-center">
            <Calendar className="h-8 w-8 mx-auto mb-2 text-primary" />
            <div className="text-3xl font-bold">{projectStats.duration}</div>
            <div className="text-sm text-muted-foreground">Days Active</div>
          </div>
          <div className="bg-card rounded-lg border p-6 text-center">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <div className="text-3xl font-bold">{projectStats.milestonesCompleted}</div>
            <div className="text-sm text-muted-foreground">Milestones</div>
          </div>
          <div className="bg-card rounded-lg border p-6 text-center">
            <SparklesIcon className="h-8 w-8 mx-auto mb-2 text-amber-500" />
            <div className="text-3xl font-bold">{projectStats.approvalsReceived}</div>
            <div className="text-sm text-muted-foreground">Approvals</div>
          </div>
          <div className="bg-card rounded-lg border p-6 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-indigo-500" />
            <div className="text-3xl font-bold">{projectStats.photosShared}</div>
            <div className="text-sm text-muted-foreground">Photos</div>
          </div>
        </div>
      </section>

      {/* Approval Celebration */}
      <CelebrationSequence
        type="approval"
        isActive={celebrationType === 'approval'}
        message="Design Approved!"
        subtitle="Great choice! Moving to the next phase of your project."
        duration={4000}
        showConfetti
        showSparkles
        onComplete={() => setCelebrationType('none')}
      />

      {/* Project Completion Celebration */}
      <ProjectCompletionCelebration
        isActive={showProjectCompletion}
        projectName="Living Room Redesign"
        beforeImage="https://images.unsplash.com/photo-1615873968403-89e068629265?w=1200"
        afterImage="https://images.unsplash.com/photo-1615875221248-e9a0e9d5a20c?w=1200"
        stats={projectStats}
        team={teamMembers}
        duration={8000}
        onComplete={() => setShowProjectCompletion(false)}
        onShare={handleShare}
        onTestimonial={handleTestimonial}
      />

      {/* Complete Project Button (for demo) */}
      {milestones.every(m => m.status === 'completed') && !showProjectCompletion && (
        <div className="text-center">
          <button
            onClick={handleProjectComplete}
            className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all"
          >
            🎉 View Project Completion Celebration
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Usage Example:
 *
 * ```tsx
 * import { CompleteMilestoneJourney } from '@patina/design-system/examples'
 *
 * function ClientPortal() {
 *   return (
 *     <div className="min-h-screen bg-background">
 *       <CompleteMilestoneJourney />
 *     </div>
 *   )
 * }
 * ```
 */

export default CompleteMilestoneJourney

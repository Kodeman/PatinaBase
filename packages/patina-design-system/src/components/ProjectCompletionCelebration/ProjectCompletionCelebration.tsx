'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { CelebrationSequence } from '../CelebrationSequence/CelebrationSequence'
import { ComparisonSlider } from '../ComparisonSlider/ComparisonSlider'
import { AchievementBadge } from '../AchievementBadge/AchievementBadge'
import { Button } from '../Button/Button'
import { Share2, Download, MessageCircle } from 'lucide-react'

export interface ProjectStats {
  duration: number // in days
  milestonesCompleted: number
  approvalsReceived: number
  photosShared: number
}

export interface TeamMember {
  name: string
  role: string
  avatar?: string
}

export interface ProjectCompletionCelebrationProps {
  /** Show celebration */
  isActive: boolean
  /** Project name */
  projectName: string
  /** Before image */
  beforeImage?: string
  /** After image */
  afterImage?: string
  /** Project statistics */
  stats?: ProjectStats
  /** Team members */
  team?: TeamMember[]
  /** Callback when celebration completes */
  onComplete?: () => void
  /** Callback when share is clicked */
  onShare?: () => void
  /** Callback when testimonial is requested */
  onTestimonial?: () => void
  /** Custom duration in ms */
  duration?: number
}

/**
 * ProjectCompletionCelebration - Epic celebration sequence for project completion
 * Includes before/after showcase, stats, team credits, and sharing options
 *
 * @example
 * ```tsx
 * <ProjectCompletionCelebration
 *   isActive={showCelebration}
 *   projectName="Living Room Redesign"
 *   beforeImage="/before.jpg"
 *   afterImage="/after.jpg"
 *   stats={projectStats}
 *   team={teamMembers}
 *   onComplete={() => setShowCelebration(false)}
 * />
 * ```
 */
export const ProjectCompletionCelebration: React.FC<ProjectCompletionCelebrationProps> = ({
  isActive,
  projectName,
  beforeImage,
  afterImage,
  stats,
  team,
  onComplete,
  onShare,
  onTestimonial,
  duration = 8000,
}) => {
  const [stage, setStage] = React.useState<'celebration' | 'showcase' | 'complete'>('celebration')

  React.useEffect(() => {
    if (!isActive) {
      setStage('celebration')
      return
    }

    const showcaseTimer = setTimeout(() => {
      setStage('showcase')
    }, 3000)

    const completeTimer = setTimeout(() => {
      setStage('complete')
      onComplete?.()
    }, duration)

    return () => {
      clearTimeout(showcaseTimer)
      clearTimeout(completeTimer)
    }
  }, [isActive, duration, onComplete])

  if (!isActive && stage === 'complete') return null

  // Initial celebration
  if (stage === 'celebration') {
    return (
      <CelebrationSequence
        type="completion"
        isActive={isActive}
        message="Project Complete!"
        subtitle={`Congratulations on completing ${projectName}!`}
        duration={3000}
        showConfetti
        showSparkles
        showBackdrop
      />
    )
  }

  // Showcase stage
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-6xl mx-auto p-6 space-y-8">
        {/* Before/After Showcase */}
        {beforeImage && afterImage && (
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold text-white text-center">
              Your Transformation
            </h2>
            <ComparisonSlider
              beforeImage={beforeImage}
              afterImage={afterImage}
              beforeLabel="Before"
              afterLabel="After"
              aspectRatio="wide"
            />
          </div>
        )}

        {/* Project Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-white mb-2">{stats.duration}</div>
              <div className="text-sm text-white/70">Days</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-white mb-2">{stats.milestonesCompleted}</div>
              <div className="text-sm text-white/70">Milestones</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-white mb-2">{stats.approvalsReceived}</div>
              <div className="text-sm text-white/70">Approvals</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-white mb-2">{stats.photosShared}</div>
              <div className="text-sm text-white/70">Photos</div>
            </div>
          </div>
        )}

        {/* Achievements */}
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold text-white text-center">Achievements Unlocked</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <AchievementBadge
              title="Project Champion"
              description="Successfully completed your first project"
              type="completion"
              tier="gold"
              unlocked
              showSparkles
            />
            <AchievementBadge
              title="Collaboration Master"
              description="Worked seamlessly with your design team"
              type="collaboration"
              tier="platinum"
              unlocked
              showSparkles
            />
          </div>
        </div>

        {/* Team Credits */}
        {team && team.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold text-white text-center">Your Design Team</h3>
            <div className="flex flex-wrap justify-center gap-6">
              {team.map((member, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                  {member.avatar ? (
                    <img
                      src={member.avatar}
                      alt={member.name}
                      className="w-16 h-16 rounded-full border-2 border-white/50"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold">
                      {member.name[0]}
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-white font-medium">{member.name}</p>
                    <p className="text-white/60 text-sm">{member.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap justify-center gap-4">
          <Button
            size="lg"
            onClick={onShare}
            className="gap-2 bg-white text-black hover:bg-white/90"
          >
            <Share2 className="h-5 w-5" />
            Share Your Success
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={onTestimonial}
            className="gap-2 border-white text-white hover:bg-white/10"
          >
            <MessageCircle className="h-5 w-5" />
            Leave a Testimonial
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="gap-2 border-white text-white hover:bg-white/10"
          >
            <Download className="h-5 w-5" />
            Download Photos
          </Button>
        </div>

        {/* Close button */}
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onComplete}
            className="text-white/60 hover:text-white hover:bg-white/10"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}

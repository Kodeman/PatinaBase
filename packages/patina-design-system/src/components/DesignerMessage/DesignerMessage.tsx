'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { Play, Pause, Volume2, VolumeX, MessageSquare } from 'lucide-react'
import { Button } from '../Button/Button'
import { Avatar } from '../Avatar/Avatar'

export interface DesignerMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Designer name */
  designerName: string
  /** Designer avatar URL */
  designerAvatar?: string
  /** Designer role/title */
  designerRole?: string
  /** Message type */
  type: 'text' | 'voice' | 'video'
  /** Text message content */
  message?: string
  /** Media URL (for voice/video) */
  mediaUrl?: string
  /** Timestamp */
  timestamp: Date
  /** Show full message initially */
  expanded?: boolean
  /** Callback when media is played */
  onPlay?: () => void
}

/**
 * DesignerMessage - Display designer communications (text, voice, video)
 *
 * @example
 * ```tsx
 * <DesignerMessage
 *   designerName="Sarah Johnson"
 *   designerAvatar="/avatar.jpg"
 *   designerRole="Lead Designer"
 *   type="text"
 *   message="I'm so excited about this design direction!"
 *   timestamp={new Date()}
 * />
 * ```
 */
export const DesignerMessage: React.FC<DesignerMessageProps> = ({
  className,
  designerName,
  designerAvatar,
  designerRole,
  type,
  message,
  mediaUrl,
  timestamp,
  expanded = false,
  onPlay,
  ...props
}) => {
  const [isExpanded, setIsExpanded] = React.useState(expanded)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [isMuted, setIsMuted] = React.useState(false)
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const videoRef = React.useRef<HTMLVideoElement>(null)

  const togglePlay = () => {
    if (type === 'voice' && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
        onPlay?.()
      }
      setIsPlaying(!isPlaying)
    } else if (type === 'video' && videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
        onPlay?.()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const toggleMute = () => {
    if (type === 'voice' && audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    } else if (type === 'video' && videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 p-4',
        className
      )}
      {...props}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <Avatar
          src={designerAvatar}
          alt={designerName}
          name={designerName[0]}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm">{designerName}</h4>
            <MessageSquare className="h-3 w-3 text-muted-foreground" />
          </div>
          {designerRole && (
            <p className="text-xs text-muted-foreground">{designerRole}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {timestamp.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>

      {/* Text message */}
      {type === 'text' && message && (
        <div className="prose prose-sm max-w-none">
          <p className={cn(
            'text-sm',
            !isExpanded && message.length > 150 && 'line-clamp-3'
          )}>
            {message}
          </p>
          {message.length > 150 && (
            <Button
              variant="link"
              size="sm"
              className="mt-2 p-0 h-auto text-xs"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </Button>
          )}
        </div>
      )}

      {/* Voice note */}
      {type === 'voice' && mediaUrl && (
        <div className="flex items-center gap-3 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-full flex-shrink-0"
            onClick={togglePlay}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </Button>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 w-1/3 transition-all" />
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 flex-shrink-0"
            onClick={toggleMute}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <audio
            ref={audioRef}
            src={mediaUrl}
            onEnded={() => setIsPlaying(false)}
          />
        </div>
      )}

      {/* Video message */}
      {type === 'video' && mediaUrl && (
        <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
          <video
            ref={videoRef}
            src={mediaUrl}
            className="w-full h-full object-cover"
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Button
                size="icon"
                className="h-14 w-14 rounded-full bg-white/90 hover:bg-white text-black"
                onClick={togglePlay}
              >
                <Play className="h-7 w-7 ml-1" />
              </Button>
            </div>
          )}
          <div className="absolute bottom-2 right-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={toggleMute}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Text message for voice/video */}
      {(type === 'voice' || type === 'video') && message && (
        <p className="text-sm text-muted-foreground mt-3 italic">
          "{message}"
        </p>
      )}
    </div>
  )
}

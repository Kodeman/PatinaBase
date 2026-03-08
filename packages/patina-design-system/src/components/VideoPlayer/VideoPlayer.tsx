'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react'
import { Button } from '../Button/Button'

export interface VideoPlayerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Video source URL */
  src: string
  /** Poster image URL */
  poster?: string
  /** Auto play */
  autoPlay?: boolean
  /** Loop video */
  loop?: boolean
  /** Muted by default */
  muted?: boolean
  /** Show controls */
  showControls?: boolean
  /** Aspect ratio */
  aspectRatio?: 'video' | 'square' | 'wide'
  /** Callback when video ends */
  onEnd?: () => void
}

/**
 * VideoPlayer - Custom video player with controls
 *
 * @example
 * ```tsx
 * <VideoPlayer
 *   src="/video.mp4"
 *   poster="/thumbnail.jpg"
 *   showControls
 *   aspectRatio="video"
 * />
 * ```
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  className,
  src,
  poster,
  autoPlay = false,
  loop = false,
  muted = false,
  showControls = true,
  aspectRatio = 'video',
  onEnd,
  ...props
}) => {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = React.useState(autoPlay)
  const [isMuted, setIsMuted] = React.useState(muted)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [showControlsOverlay, setShowControlsOverlay] = React.useState(true)
  const controlsTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined)

  const aspectRatioClasses = {
    video: 'aspect-video',
    square: 'aspect-square',
    wide: 'aspect-[21/9]',
  }

  const togglePlay = React.useCallback(() => {
    if (!videoRef.current) return

    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const toggleMute = React.useCallback(() => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }, [isMuted])

  const toggleFullscreen = React.useCallback(async () => {
    if (!videoRef.current?.parentElement) return

    try {
      if (!isFullscreen) {
        await videoRef.current.parentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.error('Fullscreen error:', error)
    }
  }, [isFullscreen])

  const handleTimeUpdate = React.useCallback(() => {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime)
  }, [])

  const handleLoadedMetadata = React.useCallback(() => {
    if (!videoRef.current) return
    setDuration(videoRef.current.duration)
  }, [])

  const handleSeek = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return
    const time = parseFloat(e.target.value)
    videoRef.current.currentTime = time
    setCurrentTime(time)
  }, [])

  const handleMouseMove = React.useCallback(() => {
    setShowControlsOverlay(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControlsOverlay(false)
      }
    }, 2000)
  }, [isPlaying])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleEnded = () => {
      setIsPlaying(false)
      onEnd?.()
    }

    video.addEventListener('ended', handleEnded)
    return () => video.removeEventListener('ended', handleEnded)
  }, [onEnd])

  return (
    <div
      className={cn(
        'relative rounded-lg overflow-hidden bg-black group',
        aspectRatioClasses[aspectRatio],
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControlsOverlay(false)}
      {...props}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onClick={togglePlay}
      />

      {showControls && (
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent transition-opacity duration-300',
            showControlsOverlay ? 'opacity-100' : 'opacity-0'
          )}
        >
          {/* Play button overlay */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button
                size="icon"
                className="h-16 w-16 rounded-full bg-white/90 hover:bg-white text-black"
                onClick={togglePlay}
              >
                <Play className="h-8 w-8 ml-1" />
              </Button>
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            {/* Progress bar */}
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 mb-3 appearance-none bg-white/30 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
            />

            {/* Control buttons */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={togglePlay}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
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
                <span className="text-white text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

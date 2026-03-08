'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { ChevronLeft, ChevronRight, X, ZoomIn, Calendar } from 'lucide-react'
import { Button } from '../Button/Button'
import { Badge } from '../Badge/Badge'

export interface ProgressPhoto {
  id: string
  url: string
  alt: string
  caption?: string
  timestamp: Date
  category?: 'before' | 'during' | 'after'
  photographer?: string
}

export interface ProgressPhotographyProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Array of progress photos */
  photos: ProgressPhoto[]
  /** Initial view mode */
  defaultView?: 'grid' | 'carousel' | 'timeline'
  /** Enable lightbox on click */
  enableLightbox?: boolean
  /** Enable category filtering */
  enableFiltering?: boolean
  /** Show timestamps */
  showTimestamps?: boolean
  /** Number of columns in grid view */
  columns?: 2 | 3 | 4
  /** Callback when photo is clicked */
  onPhotoClick?: (photo: ProgressPhoto) => void
}

/**
 * ProgressPhotography - Gallery component for displaying project progress photos
 * with before/during/after views and timeline indicators
 *
 * @example
 * ```tsx
 * <ProgressPhotography
 *   photos={progressPhotos}
 *   defaultView="timeline"
 *   enableLightbox
 *   enableFiltering
 * />
 * ```
 */
export const ProgressPhotography: React.FC<ProgressPhotographyProps> = ({
  className,
  photos,
  defaultView = 'grid',
  enableLightbox = true,
  enableFiltering = true,
  showTimestamps = true,
  columns = 3,
  onPhotoClick,
  ...props
}) => {
  const [view, setView] = React.useState(defaultView)
  const [filter, setFilter] = React.useState<ProgressPhoto['category'] | 'all'>('all')
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
  const [touchStart, setTouchStart] = React.useState(0)
  const [touchEnd, setTouchEnd] = React.useState(0)

  const filteredPhotos = React.useMemo(() => {
    if (filter === 'all') return photos
    return photos.filter((photo) => photo.category === filter)
  }, [photos, filter])

  const handlePhotoClick = (photo: ProgressPhoto, index: number) => {
    onPhotoClick?.(photo)
    if (enableLightbox) {
      setLightboxIndex(index)
    }
  }

  const handlePrevious = () => {
    if (lightboxIndex === null) return
    setLightboxIndex(lightboxIndex > 0 ? lightboxIndex - 1 : filteredPhotos.length - 1)
  }

  const handleNext = () => {
    if (lightboxIndex === null) return
    setLightboxIndex(lightboxIndex < filteredPhotos.length - 1 ? lightboxIndex + 1 : 0)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (touchStart - touchEnd > 75) {
      handleNext()
    }
    if (touchStart - touchEnd < -75) {
      handlePrevious()
    }
  }

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowLeft') handlePrevious()
      if (e.key === 'ArrowRight') handleNext()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex])

  const categoryColors = {
    before: 'neutral',
    during: 'info',
    after: 'success',
  } as const

  return (
    <div className={cn('space-y-4', className)} {...props}>
      {/* Filters */}
      {enableFiltering && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Photos
          </Button>
          <Button
            variant={filter === 'before' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('before')}
          >
            Before
          </Button>
          <Button
            variant={filter === 'during' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('during')}
          >
            During
          </Button>
          <Button
            variant={filter === 'after' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('after')}
          >
            After
          </Button>
        </div>
      )}

      {/* Grid View */}
      {view === 'grid' && (
        <div className={cn(
          'grid gap-4',
          columns === 2 && 'grid-cols-2',
          columns === 3 && 'grid-cols-2 md:grid-cols-3',
          columns === 4 && 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
        )}>
          {filteredPhotos.map((photo, index) => (
            <div
              key={photo.id}
              className="group relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer transition-transform hover:scale-105"
              onClick={() => handlePhotoClick(photo, index)}
            >
              <img
                src={photo.url}
                alt={photo.alt}
                className="object-cover w-full h-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                  {photo.category && (
                    <Badge
                      variant="subtle"
                      color={categoryColors[photo.category]}
                      size="sm"
                      className="mb-2"
                    >
                      {photo.category}
                    </Badge>
                  )}
                  {photo.caption && (
                    <p className="text-sm font-medium truncate">{photo.caption}</p>
                  )}
                  {showTimestamps && (
                    <p className="text-xs opacity-80 flex items-center gap-1 mt-1">
                      <Calendar className="h-3 w-3" />
                      {photo.timestamp.toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-white/90 dark:bg-black/90 rounded-full p-2">
                  <ZoomIn className="h-4 w-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline View */}
      {view === 'timeline' && (
        <div className="relative">
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-300 via-indigo-500 to-green-500" />
          <div className="space-y-8">
            {filteredPhotos.map((photo, index) => (
              <div key={photo.id} className="relative flex gap-6 items-start">
                <div className="flex-shrink-0 w-16 flex flex-col items-center">
                  <div className={cn(
                    'w-4 h-4 rounded-full border-4 border-background z-10',
                    photo.category === 'before' && 'bg-slate-400',
                    photo.category === 'during' && 'bg-indigo-500',
                    photo.category === 'after' && 'bg-green-500',
                    !photo.category && 'bg-slate-400'
                  )} />
                  <div className="text-xs text-muted-foreground mt-2 text-center">
                    {photo.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div
                  className="flex-1 cursor-pointer group"
                  onClick={() => handlePhotoClick(photo, index)}
                >
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    <img
                      src={photo.url}
                      alt={photo.alt}
                      className="object-cover w-full h-full transition-transform group-hover:scale-105"
                    />
                  </div>
                  {photo.caption && (
                    <p className="mt-2 text-sm font-medium">{photo.caption}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {enableLightbox && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation()
              setLightboxIndex(null)
            }}
          >
            <X className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation()
              handlePrevious()
            }}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation()
              handleNext()
            }}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>

          <div
            className="max-w-6xl max-h-[90vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={filteredPhotos[lightboxIndex].url}
              alt={filteredPhotos[lightboxIndex].alt}
              className="w-full h-full object-contain"
            />
            <div className="mt-4 text-center text-white">
              {filteredPhotos[lightboxIndex].category && (
                <Badge
                  variant="subtle"
                  color={categoryColors[filteredPhotos[lightboxIndex].category!]}
                  className="mb-2"
                >
                  {filteredPhotos[lightboxIndex].category}
                </Badge>
              )}
              {filteredPhotos[lightboxIndex].caption && (
                <p className="text-lg font-medium">{filteredPhotos[lightboxIndex].caption}</p>
              )}
              <p className="text-sm text-white/60 mt-1">
                {filteredPhotos[lightboxIndex].timestamp.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <p className="text-xs text-white/40 mt-2">
                {lightboxIndex + 1} / {filteredPhotos.length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { cn } from '../../utils/cn'

type StatusDotStatus = 'completed' | 'active' | 'in_progress' | 'blocked' | 'attention' | 'pending' | 'delayed' | 'upcoming'

const statusColorMap: Record<StatusDotStatus, string> = {
  completed: 'bg-[var(--color-sage,#A8B5A0)]',
  active: 'bg-[var(--color-clay,#C4A57B)]',
  in_progress: 'bg-[var(--color-clay,#C4A57B)]',
  blocked: 'bg-[var(--color-terracotta,#D4A090)]',
  attention: 'bg-[var(--color-terracotta,#D4A090)]',
  delayed: 'bg-[var(--color-terracotta,#D4A090)]',
  pending: 'bg-[var(--color-pearl,#E5E2DD)]',
  upcoming: 'bg-[var(--color-pearl,#E5E2DD)]',
}

const statusTextColorMap: Record<StatusDotStatus, string> = {
  completed: 'text-[var(--color-sage,#A8B5A0)]',
  active: 'text-[var(--color-clay,#C4A57B)]',
  in_progress: 'text-[var(--color-clay,#C4A57B)]',
  blocked: 'text-[var(--color-terracotta,#D4A090)]',
  attention: 'text-[var(--color-terracotta,#D4A090)]',
  delayed: 'text-[var(--color-terracotta,#D4A090)]',
  pending: 'text-[var(--color-pearl,#E5E2DD)]',
  upcoming: 'text-[var(--color-pearl,#E5E2DD)]',
}

const sizeMap = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
} as const

export interface StatusDotProps {
  status: StatusDotStatus
  size?: keyof typeof sizeMap
  pulse?: boolean
  className?: string
}

export function StatusDot({ status, size = 'md', pulse = false, className }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block shrink-0 rounded-full',
        sizeMap[size],
        statusColorMap[status],
        pulse && status === 'active' && 'animate-pulse',
        className,
      )}
    />
  )
}

export function statusDotColor(status: StatusDotStatus) {
  return statusColorMap[status]
}

export function statusTextColor(status: StatusDotStatus) {
  return statusTextColorMap[status]
}

export type { StatusDotStatus }

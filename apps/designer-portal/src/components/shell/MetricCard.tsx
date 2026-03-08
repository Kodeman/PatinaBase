import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: ReactNode
  delta?: string
  className?: string
}

export function MetricCard({ label, value, delta, className }: MetricCardProps) {
  return (
    <div className={cn('rounded-xl border bg-card p-5 shadow-sm', className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-3 flex items-baseline gap-2 text-2xl font-semibold text-foreground">
        {value}
        {delta ? <span className="text-sm font-medium text-primary">{delta}</span> : null}
      </div>
    </div>
  )
}

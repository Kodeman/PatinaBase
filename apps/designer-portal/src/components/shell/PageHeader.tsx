import type { ReactNode } from 'react'

import { Badge } from '@patina/design-system'

interface PageHeaderProps {
  title: string
  description?: string
  meta?: ReactNode
}

export function PageHeader({ title, description, meta }: PageHeaderProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {meta}
      </div>
      {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">OCI synced</Badge>
        <span>Last updated {new Date().toLocaleDateString()}</span>
      </div>
    </section>
  )
}

'use client'

import { useState } from 'react'

import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@patina/design-system'

const workstreams = {
  overview: [
    { id: 'brief', title: 'Client brief review', owner: 'Polly', status: 'Due tomorrow' },
    { id: 'samples', title: 'Material samples ready for shoot', owner: 'Jordan', status: 'Blocked' }
  ],
  catalog: [
    { id: 'lighting', title: 'Lighting presets for 3D renders', owner: 'Chris', status: 'In progress' }
  ],
  analytics: [
    { id: 'report', title: 'SLO compliance audit', owner: 'Morgan', status: 'Ready for QA' }
  ]
} satisfies Record<string, Array<{ id: string; title: string; owner: string; status: string }>>

export function WorkstreamBoard() {
  const [activeTab, setActiveTab] = useState<keyof typeof workstreams>('overview')
  const handleTabChange = (value: string) => {
    if (value in workstreams) {
      setActiveTab(value as keyof typeof workstreams)
    }
  }

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Workstreams</h2>
          <p className="text-sm text-muted-foreground">Cross-team health pulled from the OCI backlog.</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Assign owner</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="space-y-3">
            <p className="text-sm font-medium">Invite collaborator</p>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Slack and email notifications will be triggered automatically.</p>
              <Button size="sm">Open roster</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        {Object.entries(workstreams).map(([key, items]) => (
          <TabsContent key={key} value={key} className="space-y-3">
            {items.map(item => (
              <article key={item.id} className="flex items-center justify-between rounded-lg border bg-background px-4 py-3 shadow-sm">
                <div>
                  <h3 className="text-sm font-medium">{item.title}</h3>
                  <p className="text-xs text-muted-foreground">Owner: {item.owner}</p>
                </div>
                <Badge variant="secondary">{item.status}</Badge>
              </article>
            ))}
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items yet for this track.</p>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Layers, Palette, ShoppingBag, Sparkles, Users } from 'lucide-react'

import { Button, ScrollArea } from '@patina/design-system'

import { cn } from '@/lib/utils'

const sections = [
  {
    title: 'Workspace',
    items: [
      { href: '/overview', label: 'Overview', icon: Layers },
      { href: '/projects', label: 'Projects', icon: ShoppingBag },
      { href: '/catalog', label: 'Catalog', icon: Palette },
      { href: '/catalog/demo', label: 'Catalog demo', icon: Sparkles }
    ]
  },
  {
    title: 'People',
    items: [
      { href: '/clients', label: 'Client roster', icon: Users },
      { href: '/clients/demo', label: 'Client demo', icon: Sparkles }
    ]
  }
]

interface SidebarNavProps {
  collapsed: boolean
}

export function SidebarNav({ collapsed }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'relative hidden border-r bg-card/40 transition-all duration-150 ease-out md:block',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <ScrollArea className="h-full px-3 py-6">
        <div className="flex flex-col gap-6">
          {sections.map(section => (
            <div key={section.title}>
              {!collapsed && (
                <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map(item => {
                  const active = pathname.startsWith(item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                        active && 'bg-muted text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
          <Button variant="ghost" className="mt-auto justify-start" asChild>
            <Link href="/projects/new">{collapsed ? '+' : 'Create project'}</Link>
          </Button>
        </div>
      </ScrollArea>
    </aside>
  )
}

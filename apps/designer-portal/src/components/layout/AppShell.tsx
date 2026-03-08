'use client'

import { useState, type ReactNode } from 'react'

import { PrimaryNav } from '@/components/navigation/PrimaryNav'
import { SidebarNav } from '@/components/navigation/SidebarNav'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PrimaryNav onToggleSidebar={() => setSidebarCollapsed(prev => !prev)} />
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 md:grid-cols-[auto,1fr]">
        <SidebarNav collapsed={sidebarCollapsed} />
        <main className="flex flex-col gap-6 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  )
}

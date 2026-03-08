'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, Search } from 'lucide-react'
import { useState } from 'react'

import {
  Badge,
  Button,
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@patina/design-system'

import { cn } from '@/lib/utils'

interface PrimaryNavProps {
  onToggleSidebar(): void
}

const navItems = [
  { href: '/overview', label: 'Overview' },
  { href: '/projects', label: 'Projects' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/clients', label: 'Clients' },
  { href: '/clients/demo', label: 'Clients Demo' }
]

export function PrimaryNav({ onToggleSidebar }: PrimaryNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 grid grid-cols-[auto,1fr,auto] items-center gap-4 border-b bg-background/80 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Toggle navigation" onClick={onToggleSidebar}>
          <Menu className="h-4 w-4" />
        </Button>
        <Link href="/overview" className="flex items-center gap-2 font-serif text-xl font-semibold">
          Patina Portal
        </Link>
      </div>

      <nav className="hidden md:flex items-center gap-3">
        {navItems.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-foreground',
                active ? 'bg-muted text-foreground' : 'text-muted-foreground'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex items-center justify-end gap-3">
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="hidden md:inline-flex" aria-expanded={searchOpen}>
              <Search className="mr-2 h-4 w-4" />Quick search
              <Badge variant="secondary" className="ml-3 hidden lg:inline-flex">
                Cmd+K
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-0" sideOffset={12}>
            <Command className="w-80">
              <CommandInput placeholder="Jump to..." />
              <CommandList>
                <CommandGroup heading="Navigation">
                  {navItems.map(item => (
                  <CommandItem
                    key={item.href}
                    onSelect={() => {
                      setSearchOpen(false)
                      router.push(item.href)
                    }}
                  >
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button>New project</Button>
      </div>
    </header>
  )
}

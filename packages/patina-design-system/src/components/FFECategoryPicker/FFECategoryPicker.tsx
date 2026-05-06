'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Command as CommandPrimitive } from 'cmdk'
import { ChevronDown, X, Plus, Check } from 'lucide-react'
import { cn } from '../../utils/cn'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FFECategoryOption {
  /** Unique slug — what gets persisted to proposal_scope_rooms.ffe_categories[]. */
  slug: string
  /** Human-readable label rendered in chips and the dropdown. */
  label: string
  /** Optional lucide icon name. Purely decorative — the picker doesn't render the icon itself. */
  icon?: string
  /** True for designer- and proposal-scoped customs. False for the system taxonomy. */
  isCustom: boolean
}

export interface FFECategoryPickerProps {
  /** Selected slugs. Preserves selection order. */
  value: string[]
  /** Called whenever the selection changes. */
  onChange: (slugs: string[]) => void
  /** All categories the user can pick from. The component does NOT filter by scope. */
  categories: FFECategoryOption[]
  /** Show the "+ Add custom" affordance at the bottom of the dropdown. */
  allowCustom?: boolean
  /** Async create handler. Required when allowCustom is true. Returns the slug to select. */
  onCreateCustom?: (label: string) => Promise<{ slug: string }>
  /** Label for the create scope hint shown next to the input. */
  scope?: 'global' | 'proposal'
  /** Placeholder shown when no categories are selected. */
  placeholder?: string
  /** Disables all interaction. */
  disabled?: boolean
  /** Optional className applied to the trigger. */
  className?: string
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function FFECategoryPicker({
  value,
  onChange,
  categories,
  allowCustom = false,
  onCreateCustom,
  scope,
  placeholder = 'Select categories…',
  disabled = false,
  className,
}: FFECategoryPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)

  // Map slug → option for O(1) lookup when rendering selected chips.
  const optionBySlug = React.useMemo(() => {
    const map = new Map<string, FFECategoryOption>()
    for (const c of categories) map.set(c.slug, c)
    return map
  }, [categories])

  const selectedOptions = React.useMemo(
    () => value.map((slug) => optionBySlug.get(slug)).filter(Boolean) as FFECategoryOption[],
    [value, optionBySlug]
  )

  const toggle = (slug: string) => {
    if (disabled) return
    const next = value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug]
    onChange(next)
  }

  const remove = (slug: string) => {
    if (disabled) return
    onChange(value.filter((s) => s !== slug))
  }

  // Treat the search as the seed label for "+ Add custom". Trim once.
  const trimmedSearch = search.trim()
  const matchesExistingLabel = React.useMemo(
    () => categories.some((c) => c.label.toLowerCase() === trimmedSearch.toLowerCase()),
    [categories, trimmedSearch]
  )
  const canCreateCustom =
    allowCustom && !!onCreateCustom && trimmedSearch.length > 0 && !matchesExistingLabel

  const handleCreateCustom = async () => {
    if (!onCreateCustom || !canCreateCustom || disabled) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await onCreateCustom(trimmedSearch)
      onChange([...value, created.slug])
      setSearch('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Selected chips */}
      {selectedOptions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedOptions.map((opt) => (
            <span
              key={opt.slug}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
                opt.isCustom
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800'
                  : 'border-border bg-secondary text-secondary-foreground'
              )}
            >
              <span>{opt.label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(opt.slug)}
                  className="rounded-sm opacity-60 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
                  aria-label={`Remove ${opt.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild disabled={disabled}>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground transition-colors',
              'hover:bg-accent/40',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <span className={cn('truncate', selectedOptions.length > 0 && 'text-foreground')}>
              {selectedOptions.length > 0
                ? `${selectedOptions.length} selected`
                : placeholder}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className={cn(
              'z-50 w-[var(--radix-popover-trigger-width)] min-w-[280px] rounded-md border bg-popover text-popover-foreground shadow-md outline-none',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
            )}
          >
            <CommandPrimitive shouldFilter={false} className="flex flex-col overflow-hidden">
              <div className="flex items-center border-b border-border px-3">
                <CommandPrimitive.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder={
                    scope === 'proposal'
                      ? 'Search or add for this proposal…'
                      : scope === 'global'
                        ? 'Search or add for your studio…'
                        : 'Search categories…'
                  }
                  className={cn(
                    'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none',
                    'placeholder:text-muted-foreground'
                  )}
                />
              </div>

              <CommandPrimitive.List className="max-h-[260px] overflow-y-auto p-1">
                {categories.length === 0 && (
                  <CommandPrimitive.Empty className="py-4 text-center text-sm text-muted-foreground">
                    No categories available.
                  </CommandPrimitive.Empty>
                )}

                {categories
                  .filter((c) =>
                    trimmedSearch.length === 0
                      ? true
                      : c.label.toLowerCase().includes(trimmedSearch.toLowerCase())
                  )
                  .map((c) => {
                    const isSelected = value.includes(c.slug)
                    return (
                      <CommandPrimitive.Item
                        key={c.slug}
                        value={c.slug}
                        onSelect={() => toggle(c.slug)}
                        className={cn(
                          'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors',
                          'aria-selected:bg-accent aria-selected:text-accent-foreground'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input'
                          )}
                          aria-hidden
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex-1 truncate">{c.label}</span>
                        {c.isCustom && (
                          <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                            Custom
                          </span>
                        )}
                      </CommandPrimitive.Item>
                    )
                  })}

                {/* "+ Add custom" affordance pinned to the bottom */}
                {allowCustom && (
                  <>
                    <div className="-mx-1 my-1 h-px bg-border" aria-hidden />
                    <button
                      type="button"
                      disabled={!canCreateCustom || creating || disabled}
                      onClick={handleCreateCustom}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors',
                        canCreateCustom && !creating
                          ? 'hover:bg-accent hover:text-accent-foreground'
                          : 'cursor-not-allowed opacity-50'
                      )}
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">
                        {creating
                          ? 'Creating…'
                          : trimmedSearch.length > 0
                            ? `Add "${trimmedSearch}"${
                                scope === 'proposal'
                                  ? ' for this proposal'
                                  : scope === 'global'
                                    ? ' to your studio'
                                    : ''
                              }`
                            : 'Type a name to add a custom category'}
                      </span>
                    </button>
                    {createError && (
                      <div className="px-2 pb-1 text-xs text-destructive">{createError}</div>
                    )}
                  </>
                )}
              </CommandPrimitive.List>
            </CommandPrimitive>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}

FFECategoryPicker.displayName = 'FFECategoryPicker'

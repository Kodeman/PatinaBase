'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Command as CommandPrimitive } from 'cmdk'
import { cn } from '../../utils/cn'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaintColorBrand =
  | 'sherwin_williams'
  | 'benjamin_moore'
  | 'farrow_ball'
  | 'pantone_tpg'

export interface PaintColorOption {
  id: string
  brand: string
  code: string
  name: string
  hex: string
}

export interface PaintColorPickerProps {
  /** Currently-selected paint color, or null. */
  value: PaintColorOption | null
  /** Called whenever the user picks (or clears) a color. */
  onChange: (color: PaintColorOption | null) => void
  /** Brand chips shown above the search input. Defaults to all four. */
  brands?: PaintColorBrand[]
  /**
   * Search callback. The component manages debouncing internally. Returning
   * an empty array is a valid "no matches" response.
   */
  onSearch: (
    query: string,
    brand?: PaintColorBrand
  ) => Promise<PaintColorOption[]>
  /** Disable the trigger. */
  disabled?: boolean
  /** Optional className applied to the trigger button. */
  triggerClassName?: string
  /** Placeholder for the trigger when no value is selected. */
  placeholder?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_BRANDS: PaintColorBrand[] = [
  'sherwin_williams',
  'benjamin_moore',
  'farrow_ball',
  'pantone_tpg',
]

const BRAND_LABEL: Record<PaintColorBrand, string> = {
  sherwin_williams: 'Sherwin-Williams',
  benjamin_moore: 'Benjamin Moore',
  farrow_ball: 'Farrow & Ball',
  pantone_tpg: 'Pantone TPG',
}

function brandLabel(brand: string): string {
  return (BRAND_LABEL as Record<string, string>)[brand] ?? brand
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PaintColorPicker — searchable combobox over a paint catalog with brand
 * filter chips. The host is responsible for the actual search (typically
 * by passing `useSearchPaintColors`-driven async search).
 */
export const PaintColorPicker = React.forwardRef<
  HTMLButtonElement,
  PaintColorPickerProps
>(
  (
    {
      value,
      onChange,
      brands = ALL_BRANDS,
      onSearch,
      disabled = false,
      triggerClassName,
      placeholder = 'Pick a paint color',
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState('')
    const [activeBrand, setActiveBrand] = React.useState<PaintColorBrand | undefined>(undefined)
    const [results, setResults] = React.useState<PaintColorOption[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    // Debounced search — 200ms is short enough to feel snappy and long
    // enough to avoid thrashing the catalog on every keystroke.
    React.useEffect(() => {
      if (!open) return
      let cancelled = false
      const handle = window.setTimeout(async () => {
        setLoading(true)
        setError(null)
        try {
          const data = await onSearch(query, activeBrand)
          if (!cancelled) setResults(data)
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Search failed')
            setResults([])
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      }, 200)

      return () => {
        cancelled = true
        window.clearTimeout(handle)
      }
    }, [open, query, activeBrand, onSearch])

    const handleSelect = (option: PaintColorOption) => {
      onChange(option)
      setOpen(false)
    }

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            className={cn(
              'inline-flex w-full items-center gap-3 rounded-md border border-input bg-background px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
              triggerClassName
            )}
          >
            {value ? (
              <>
                <span
                  className="h-6 w-6 shrink-0 rounded border border-border"
                  style={{ backgroundColor: value.hex }}
                  aria-hidden
                />
                <span className="flex-1 truncate text-sm">
                  <span className="font-medium">{value.name}</span>{' '}
                  <span className="text-muted-foreground">
                    {brandLabel(value.brand)} · {value.code}
                  </span>
                </span>
              </>
            ) : (
              <>
                <span
                  className="h-6 w-6 shrink-0 rounded border border-dashed border-border bg-muted"
                  aria-hidden
                />
                <span className="flex-1 truncate text-sm text-muted-foreground">{placeholder}</span>
              </>
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="opacity-50"
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="z-50 w-[360px] rounded-md border bg-popover text-popover-foreground shadow-md outline-none"
          >
            <CommandPrimitive shouldFilter={false} className="flex w-full flex-col">
              {/* Brand chips */}
              <div className="flex flex-wrap gap-1 border-b border-border p-2">
                <button
                  type="button"
                  onClick={() => setActiveBrand(undefined)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    activeBrand === undefined
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  )}
                >
                  All
                </button>
                {brands.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setActiveBrand(b)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      activeBrand === b
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {brandLabel(b)}
                  </button>
                ))}
              </div>

              <div className="flex items-center border-b px-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2 h-4 w-4 shrink-0 opacity-50"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <CommandPrimitive.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search paint colors…"
                  className="flex h-10 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <CommandPrimitive.List className="max-h-[260px] overflow-y-auto p-1">
                {loading && (
                  <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
                )}
                {error && (
                  <div className="py-6 text-center text-sm text-destructive">{error}</div>
                )}
                {!loading && !error && results.length === 0 && (
                  <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
                    No matches.
                  </CommandPrimitive.Empty>
                )}

                {!loading && results.length > 0 && (
                  <CommandPrimitive.Group className="overflow-hidden p-1 text-foreground">
                    {results.map((c) => (
                      <CommandPrimitive.Item
                        key={c.id}
                        value={`${c.brand}-${c.code}-${c.name}`}
                        onSelect={() => handleSelect(c)}
                        className="relative flex cursor-default select-none items-center gap-3 rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground"
                      >
                        <span
                          className="h-6 w-6 shrink-0 rounded border border-border"
                          style={{ backgroundColor: c.hex }}
                          aria-hidden
                        />
                        <span className="flex flex-1 flex-col overflow-hidden">
                          <span className="truncate text-sm font-medium">{c.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {brandLabel(c.brand)} · {c.code} · {c.hex.toUpperCase()}
                          </span>
                        </span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}
              </CommandPrimitive.List>

              {value && (
                <div className="border-t border-border p-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null)
                      setOpen(false)
                    }}
                    className="w-full rounded-sm px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </CommandPrimitive>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }
)
PaintColorPicker.displayName = 'PaintColorPicker'

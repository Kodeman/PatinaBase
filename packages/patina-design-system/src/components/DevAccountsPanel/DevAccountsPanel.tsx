'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../Accordion'
import { Spinner } from '../Spinner'

export interface DevAccount {
  id: string
  email: string
  password: string
  name: string
  roles: string[]
  description: string
}

export interface DevAccountsPanelProps {
  /** List of dev accounts to display */
  accounts: DevAccount[]
  /** Callback when user clicks one-click login */
  onLogin: (email: string, password: string) => Promise<void>
  /** Whether a login is currently in progress */
  isLoading?: boolean
  /** Error message to display */
  error?: string | null
  /** Whether the dev auth service is available */
  serviceAvailable?: boolean
  /** Custom class name */
  className?: string
  /** Whether the panel should be collapsed by default */
  defaultCollapsed?: boolean
}

/**
 * DevAccountsPanel - A collapsible panel showing dev test accounts with one-click login
 * Only renders in development mode (NODE_ENV !== 'production')
 *
 * It sits directly under the auth surface, so it speaks the same material: a
 * square warm sheet on oak hairlines, mono for anything that is a label rather
 * than a sentence, and no chrome — a scaffold should read as a scaffold.
 */
export const DevAccountsPanel = React.forwardRef<HTMLDivElement, DevAccountsPanelProps>(
  (
    {
      accounts,
      onLogin,
      isLoading = false,
      error,
      serviceAvailable = true,
      className,
      defaultCollapsed = true,
    },
    ref
  ) => {
    const [loadingAccountId, setLoadingAccountId] = React.useState<string | null>(null)

    // Only render in development
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      return null
    }

    const handleLogin = async (account: DevAccount) => {
      setLoadingAccountId(account.id)
      try {
        await onLogin(account.email, account.password)
      } finally {
        setLoadingAccountId(null)
      }
    }

    if (!serviceAvailable) {
      return (
        <div ref={ref} className={cn('mt-4', className)}>
          <div
            role="alert"
            className="grid gap-[5px] border-t-2 border-t-[#9C3D31] pt-[15px] text-[14px] leading-[1.5] text-[#65594E]"
          >
            <p className="font-semibold text-[#2C2926]">Dev Authentication Unavailable</p>
            <div>
              The user-management service is not responding. Please ensure it is running
              (pnpm run dev:minimal) and try again.
            </div>
          </div>
        </div>
      )
    }

    return (
      <div ref={ref} className={cn('mt-4', className)}>
        <Accordion
          type="single"
          collapsible
          defaultValue={defaultCollapsed ? undefined : 'dev-accounts'}
        >
          <AccordionItem
            value="dev-accounts"
            variant="bordered"
            className="rounded-none border-[#8B7355] bg-[#FCFAF6] px-0"
          >
            <AccordionTrigger className="px-[16px] py-[12px] hover:no-underline">
              <div className="flex items-center gap-[10px]">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#65594E]">
                  Dev Accounts
                </span>
                <span className="border border-[#8B7355] px-[6px] py-[2px] font-mono text-[10px] uppercase tracking-[0.14em] text-[#65594E]">
                  {accounts.length} available
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-[12px] px-[16px] pb-[16px]">
                {error && (
                  <div
                    role="alert"
                    className="grid gap-[5px] border-t-2 border-t-[#9C3D31] pt-[15px] text-[14px] leading-[1.5] text-[#65594E]"
                  >
                    <p className="font-semibold text-[#2C2926]">Login Failed</p>
                    <div>{error}</div>
                  </div>
                )}

                <p className="text-[13px] leading-[1.5] text-[#65594E]">
                  Click any account to sign in instantly. These accounts are pre-seeded in
                  the development database.
                </p>

                <div className="grid gap-[8px]">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between gap-[12px] border border-[#E2DACA] bg-[#EFE9DD] p-[12px]"
                    >
                      <div className="flex min-w-0 flex-col gap-[3px]">
                        <div className="flex flex-wrap items-center gap-[8px]">
                          <span className="text-[14px] font-semibold text-[#2C2926]">{account.name}</span>
                          {account.roles.map((role) => (
                            <span
                              key={role}
                              className="border border-[#8B7355] px-[5px] py-px font-mono text-[9px] uppercase tracking-[0.16em] text-[#65594E]"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                        <span className="truncate font-mono text-[11px] text-[#7A6A5B]">{account.email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLogin(account)}
                        disabled={isLoading}
                        className="inline-flex min-h-[36px] flex-none items-center justify-center border border-[#8B7355] bg-[#FCFAF6] px-[12px] text-[13px] font-semibold text-[#2C2926] transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:border-[#2C2926] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none"
                      >
                        {loadingAccountId === account.id ? <Spinner size="sm" /> : 'Sign In'}
                      </button>
                    </div>
                  ))}
                </div>

                <p className="border-t border-[#E2DACA] pt-[10px] text-[12px] leading-[1.5] text-[#7A6A5B]">
                  <strong className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#65594E]">Development Only:</strong> This panel is not visible in production
                  builds.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    )
  }
)

DevAccountsPanel.displayName = 'DevAccountsPanel'

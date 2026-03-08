'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../Accordion'
import { Button } from '../Button'
import { Badge } from '../Badge'
import { Alert } from '../Alert'
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

    const getRoleBadgeColor = (role: string): 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' => {
      switch (role) {
        case 'admin':
          return 'error'
        case 'designer':
        case 'studio_manager':
          return 'primary'
        case 'client':
          return 'success'
        case 'manufacturer':
          return 'info'
        default:
          return 'neutral'
      }
    }

    if (!serviceAvailable) {
      return (
        <div ref={ref} className={cn('mt-4', className)}>
          <Alert
            variant="error"
            title="Dev Authentication Unavailable"
          >
            The user-management service is not responding. Please ensure it is running
            (pnpm run dev:minimal) and try again.
          </Alert>
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
          <AccordionItem value="dev-accounts" variant="bordered">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-2 text-sm">
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
                  className="text-yellow-500"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span className="font-medium">Dev Accounts</span>
                <Badge variant="outline" className="ml-2 text-xs">
                  {accounts.length} available
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 px-4 pb-4">
                {error && (
                  <Alert variant="error" title="Login Failed">
                    {error}
                  </Alert>
                )}

                <p className="text-xs text-muted-foreground">
                  Click any account to sign in instantly. These accounts are pre-seeded in
                  the development database.
                </p>

                <div className="grid gap-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
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
                            className="text-muted-foreground"
                          >
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{account.name}</span>
                            {account.roles.map((role) => (
                              <Badge
                                key={role}
                                variant="subtle"
                                color={getRoleBadgeColor(role)}
                                size="sm"
                              >
                                {role}
                              </Badge>
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">{account.email}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleLogin(account)}
                        disabled={isLoading}
                      >
                        {loadingAccountId === account.id ? (
                          <Spinner size="sm" />
                        ) : (
                          'Sign In'
                        )}
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-2 rounded-md border border-yellow-200 bg-yellow-50 p-2 dark:border-yellow-900 dark:bg-yellow-950">
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    <strong>Development Only:</strong> This panel is not visible in production
                    builds.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    )
  }
)

DevAccountsPanel.displayName = 'DevAccountsPanel'

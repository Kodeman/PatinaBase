'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command as CommandPrimitive } from 'cmdk';
import { ChevronDown, Plus, Check } from 'lucide-react';
import {
  useClients,
  useAddClient,
  useInviteAndLinkClient,
  type DesignerClient,
} from '@/hooks/use-clients';
import { cn } from '@/lib/utils';

export interface ClientPickerProps {
  /** Selected client — a profiles.id (designer_clients.client_id), or null when unlinked. */
  value: string | null;
  /** Called with the selected profiles.id, or null to clear. */
  onChange: (clientId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Render the trigger compactly (for inline chip contexts). */
  inlineChip?: boolean;
  /**
   * Controlled open state. When provided, the popover is driven by the parent
   * (pair with `onOpenChange`) and the built-in combobox trigger is suppressed
   * — the parent owns the affordance that opens it. Leave undefined for the
   * default self-contained (uncontrolled) behavior.
   */
  open?: boolean;
  /** Notified when the popover wants to open/close (controlled mode). */
  onOpenChange?: (open: boolean) => void;
  /** Optional caller-normalized rows. The hook still supplies the default. */
  clientOptions?: DesignerClient[];
}

export function ClientPicker({
  value,
  onChange,
  placeholder = 'Select a client…',
  disabled = false,
  className,
  inlineChip = false,
  open: openProp,
  onOpenChange,
  clientOptions,
}: ClientPickerProps) {
  const [openState, setOpenState] = React.useState(false);
  // Controlled when an `open` prop is supplied; otherwise own the state.
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setOpenState(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  const [search, setSearch] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  // R73 invite-on-send: which not-yet-linkable row is mid-invite, and the
  // inline (R83) failure reason for the row that last failed.
  const [invitingId, setInvitingId] = React.useState<string | null>(null);
  const [inviteError, setInviteError] = React.useState<{ id: string; message: string } | null>(
    null,
  );

  const { data: queriedClients, isLoading } = useClients();
  const clients = clientOptions ?? queriedClients;
  const addClient = useAddClient();
  const inviteAndLink = useInviteAndLinkClient();

  // Only contacts that are linkable carry a non-null client_id (a profiles.id).
  const labelFor = React.useCallback((dc: DesignerClient) => {
    return (
      dc.client?.full_name ??
      dc.client_name ??
      dc.client_email ??
      'Unknown'
    );
  }, []);

  const subtitleFor = React.useCallback((dc: DesignerClient) => {
    return dc.client?.email ?? dc.client_email ?? null;
  }, []);

  const selected = React.useMemo(
    () => (clients ?? []).find((dc) => dc.client_id && dc.client_id === value) ?? null,
    [clients, value]
  );

  const trimmedSearch = search.trim();

  const filtered = React.useMemo(() => {
    const list = clients ?? [];
    if (trimmedSearch.length === 0) return list;
    const q = trimmedSearch.toLowerCase();
    return list.filter((dc) => {
      const label = labelFor(dc).toLowerCase();
      const sub = (subtitleFor(dc) ?? '').toLowerCase();
      return label.includes(q) || sub.includes(q);
    });
  }, [clients, trimmedSearch, labelFor, subtitleFor]);

  // Treat the search text as a candidate email for "+ Add new client".
  const canAdd = trimmedSearch.length > 0;
  const isEmail = /.+@.+\..+/.test(trimmedSearch);

  const handleAdd = async () => {
    if (!canAdd || adding || disabled) return;
    setAdding(true);
    setAddError(null);
    try {
      const result = await addClient.mutateAsync({
        clientEmail: isEmail ? trimmedSearch : '',
        clientName: isEmail ? undefined : trimmedSearch,
        invite: false,
      });
      if (result.profileId) {
        onChange(result.profileId);
        setSearch('');
        setOpen(false);
      } else {
        setAddError('Invite the client first to link them.');
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add client.');
    } finally {
      setAdding(false);
    }
  };

  // R73 — invite-on-send. A captured household (client_id NULL, client_email
  // set) can't be linked directly; selecting its row invites the email on file
  // (create-and-link the Patina account via useInviteAndLinkClient → the
  // /api/clients/invite designerClientId path) and then proceeds exactly like
  // a normal selection with the new profile id. Failures render inline at the
  // row (R83) — the mutation carries meta.errorSurface='inline', so the global
  // toast stays quiet; re-selecting the row is the retry act.
  const handleInviteAndLink = async (dc: DesignerClient) => {
    if (disabled || invitingId || !dc.client_email) return;
    setInvitingId(dc.id);
    setInviteError(null);
    try {
      const result = await inviteAndLink.mutateAsync({
        designerClientId: dc.id,
        clientEmail: dc.client_email,
        clientName: dc.client_name ?? undefined,
      });
      if (result.profileId) {
        onChange(result.profileId);
        setSearch('');
        setOpen(false);
      } else {
        setInviteError({
          id: dc.id,
          message: 'The invite went out but no account came back.',
        });
      }
    } catch (err) {
      setInviteError({
        id: dc.id,
        message: err instanceof Error ? err.message : 'Could not invite this client.',
      });
    } finally {
      setInvitingId(null);
    }
  };

  const triggerLabel = selected
    ? labelFor(selected)
    : isLoading
      ? 'Loading…'
      : placeholder;

  return (
    <div className={cn('w-full', className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        {/* The built-in combobox trigger renders in BOTH modes — in controlled
            mode a parent affordance can also toggle `open`, but the trigger
            chip stays visible and clickable (and keeps the
            `client-picker-trigger` testid that e2e relies on). Radix routes
            trigger clicks through onOpenChange, so controlled state works
            either way. */}
        <PopoverPrimitive.Trigger asChild disabled={disabled}>
          <button
            type="button"
            role="combobox"
            data-testid="client-picker-trigger"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'flex w-full items-center justify-between rounded border border-[var(--color-pearl)] bg-white text-[0.85rem] outline-none transition-colors',
              'focus:border-[var(--accent-primary)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              inlineChip ? 'px-2.5 py-1' : 'px-3 py-2'
            )}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <span
              className={cn('truncate', !selected && 'text-[var(--text-muted)]')}
              style={selected ? { color: 'var(--text-primary)' } : undefined}
            >
              {triggerLabel}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[260px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] outline-none"
          >
            <CommandPrimitive shouldFilter={false} className="flex flex-col overflow-hidden">
              <div className="flex items-center border-b border-[var(--border-subtle)] px-3">
                <CommandPrimitive.Input
                  value={search}
                  onValueChange={setSearch}
                  data-testid="client-picker-search"
                  placeholder="Search or add a client…"
                  className="flex h-10 w-full bg-transparent py-3 text-[0.85rem] outline-none placeholder:text-[var(--text-muted)]"
                  style={{ fontFamily: 'var(--font-body)' }}
                />
              </div>

              <CommandPrimitive.List className="max-h-[260px] overflow-y-auto p-1">
                {(clients ?? []).length === 0 && (
                  <CommandPrimitive.Empty className="py-4 text-center text-[0.82rem] text-[var(--text-muted)]">
                    {isLoading ? 'Loading clients…' : 'No clients yet.'}
                  </CommandPrimitive.Empty>
                )}

                {/* "Unlink" option when a client is selected */}
                {selected && (
                  <CommandPrimitive.Item
                    value="__unlink__"
                    onSelect={() => {
                      if (disabled) return;
                      onChange(null);
                      setOpen(false);
                    }}
                    className="relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[0.82rem] italic text-[var(--text-muted)] outline-none transition-colors aria-selected:bg-[var(--bg-hover)]"
                  >
                    Clear selection
                  </CommandPrimitive.Item>
                )}

                {filtered.map((dc) => {
                  const linkable = !!dc.client_id;
                  // R73: a captured row with an email on file is invitable —
                  // selecting it invites & links, then proceeds like a normal
                  // selection. Only an email-less row stays truly disabled.
                  const invitable = !linkable && !!dc.client_email;
                  const isInviting = invitingId === dc.id;
                  const isSelected = linkable && dc.client_id === value;
                  const subtitle = subtitleFor(dc);
                  return (
                    <React.Fragment key={dc.id}>
                      <CommandPrimitive.Item
                        value={dc.id}
                        data-testid={`client-picker-option-${dc.client_id ?? dc.id}`}
                        disabled={!linkable && !invitable}
                        onSelect={() => {
                          if (disabled || invitingId) return;
                          if (linkable) {
                            onChange(dc.client_id);
                            setSearch('');
                            setOpen(false);
                          } else if (invitable) {
                            void handleInviteAndLink(dc);
                          }
                        }}
                        className={cn(
                          'group relative flex select-none items-center gap-2 rounded-md px-2 py-1.5 text-[0.85rem] outline-none transition-colors',
                          linkable || invitable
                            ? 'cursor-pointer aria-selected:bg-[var(--bg-hover)]'
                            : 'cursor-not-allowed opacity-60 data-[disabled=true]:opacity-60'
                        )}
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                            isSelected
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
                              : 'border-[var(--color-pearl)]'
                          )}
                          aria-hidden
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[var(--text-primary)]">{labelFor(dc)}</span>
                          {subtitle && (
                            <span className="truncate text-[0.7rem] text-[var(--text-muted)]">
                              {subtitle}
                            </span>
                          )}
                        </span>
                        {!linkable && (
                          <span
                            className={cn(
                              'shrink-0 rounded-sm bg-[var(--bg-hover)] px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wide',
                              isInviting ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                            )}
                          >
                            {isInviting ? (
                              'Inviting…'
                            ) : invitable ? (
                              // The tag reads "No Patina account" at rest and
                              // becomes the act — "Invite & link" — when the row
                              // is hovered/highlighted (cmdk sets aria-selected).
                              <>
                                <span className="group-aria-selected:hidden">No Patina account</span>
                                <span className="hidden text-[var(--accent-primary)] group-aria-selected:inline">
                                  Invite &amp; link
                                </span>
                              </>
                            ) : (
                              'No email on file'
                            )}
                          </span>
                        )}
                      </CommandPrimitive.Item>
                      {/* R83 — quiet inline reason at the act site; no toast. */}
                      {inviteError?.id === dc.id && !isInviting && (
                        <div
                          role="alert"
                          data-testid={`client-picker-invite-error-${dc.id}`}
                          className="px-2 pb-1 pt-0.5 text-[0.7rem] leading-snug text-[var(--color-terracotta)]"
                        >
                          {inviteError.message}
                          <span className="opacity-80"> Select the row again to retry.</span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* "+ Add new client" affordance pinned to the bottom */}
                <div className="-mx-1 my-1 h-px bg-[var(--border-subtle)]" aria-hidden />
                <button
                  type="button"
                  data-testid="client-picker-add"
                  disabled={!canAdd || adding || disabled}
                  onClick={handleAdd}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.85rem] outline-none transition-colors',
                    canAdd && !adding
                      ? 'cursor-pointer hover:bg-[var(--bg-hover)]'
                      : 'cursor-not-allowed opacity-50'
                  )}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">
                    {adding
                      ? 'Adding…'
                      : trimmedSearch.length > 0
                        ? `Add new client “${trimmedSearch}”`
                        : 'Type a name or email to add a client'}
                  </span>
                </button>
                {addError && (
                  <div className="px-2 pb-1 pt-0.5 text-[0.7rem] text-[var(--color-terracotta)]">
                    {addError}
                  </div>
                )}
              </CommandPrimitive.List>
            </CommandPrimitive>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}

ClientPicker.displayName = 'ClientPicker';

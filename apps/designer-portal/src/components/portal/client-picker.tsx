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
  /** Accessible name for the combobox trigger when nearby copy is not a label. */
  ariaLabel?: string;
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
  /**
   * When true, a household with no email on file (client_id null, not even
   * invitable) renders its explanatory hint framed around needing a client
   * login — for flows where the resulting document must reach a client who
   * can sign in (e.g. drafting a design agreement). Leave false for flows
   * that legitimately work with a not-yet-linked household (attaching a
   * household to a document, opening a project) — the generic "No email on
   * file" tag still applies there, and rows stay non-selectable either way.
   */
  requireClientLogin?: boolean;
}

export function ClientPicker({
  value,
  onChange,
  placeholder = 'Select a client…',
  disabled = false,
  className,
  ariaLabel,
  inlineChip = false,
  open: openProp,
  onOpenChange,
  clientOptions,
  requireClientLogin = false,
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
  // J2 — selecting an invitable row only ARMS it; sending the invite (a real
  // outbound email to the household) requires a separate explicit act via
  // the confirm block below. Already-linked rows are unaffected — see the
  // `linkable` branch in onSelect, which still selects immediately.
  const [armedInviteId, setArmedInviteId] = React.useState<string | null>(null);
  const armedRegionId = React.useId();
  const armedSendRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) setArmedInviteId(null);
  }, [open]);

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

  // Arming is a transient UI state, not a commitment — it drops whenever the
  // list RE-DERIVES for any reason (a search change, a background useClients
  // refetch, a new clientOptions prop), not just when the search narrows. A
  // row that briefly left the list and came back must be selected again before
  // it can send: nothing outside a fresh human act may leave a send armed.
  React.useEffect(() => {
    setArmedInviteId(null);
  }, [filtered]);

  const armedClient = React.useMemo(
    () => filtered.find((dc) => dc.id === armedInviteId) ?? null,
    [filtered, armedInviteId],
  );

  // Focus follows the act: arming moves the caret onto the affordance that
  // sends, so a keyboard-only designer's next keystroke is the decision rather
  // than a hunt through cmdk's roving-focus model for where the decision went.
  React.useEffect(() => {
    if (armedInviteId) armedSendRef.current?.focus();
  }, [armedInviteId]);

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

  // R73 — invite-on-send, J2 — consent first. A captured household (client_id
  // NULL, client_email set) can't be linked directly; it has to be invited
  // (create-and-link the Patina account via useInviteAndLinkClient → the
  // /api/clients/invite designerClientId path), after which the flow proceeds
  // exactly like a normal selection with the new profile id. Selecting the row
  // only ARMS that; this function runs from the confirm block's explicit
  // "Send invite" act and nowhere else. Failures render inline at the row
  // (R83) — the mutation carries meta.errorSurface='inline', so the global
  // toast stays quiet.
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
            aria-label={ariaLabel}
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
                  // Truly stuck (no client_id, no email to invite) — in a
                  // login-required flow this needs its own explanation, not
                  // just the generic tag.
                  const needsLoginHint = requireClientLogin && !linkable && !invitable;
                  const isArmed = armedInviteId === dc.id;
                  const confirmId = `${armedRegionId}-${dc.id}`;
                  return (
                    <React.Fragment key={dc.id}>
                      <CommandPrimitive.Item
                        value={dc.id}
                        data-testid={`client-picker-option-${dc.client_id ?? dc.id}`}
                        disabled={!linkable && !invitable}
                        aria-expanded={invitable ? isArmed : undefined}
                        aria-controls={isArmed ? confirmId : undefined}
                        onSelect={() => {
                          if (disabled || invitingId) return;
                          if (linkable) {
                            onChange(dc.client_id);
                            setSearch('');
                            setOpen(false);
                          } else if (invitable) {
                            // J2: selecting arms the row — it does not send.
                            // Sending is the confirm block's explicit act.
                            setArmedInviteId(dc.id);
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
                              // Three states, all readable without color: at
                              // rest "No Patina account"; highlighted (cmdk
                              // sets aria-selected) "Select to invite" —
                              // selecting only ARMS, so the copy must not read
                              // as an immediate action; armed "Confirm below",
                              // which is also what a screen reader gets off
                              // the row itself once aria-expanded flips.
                              isArmed ? (
                                <span className="text-[var(--accent-primary)]">Confirm below</span>
                              ) : (
                                <>
                                  <span className="group-aria-selected:hidden">No Patina account</span>
                                  <span className="hidden text-[var(--accent-primary)] group-aria-selected:inline">
                                    Select to invite
                                  </span>
                                </>
                              )
                            ) : (
                              'No email on file'
                            )}
                          </span>
                        )}
                      </CommandPrimitive.Item>
                      {/* J2 — arm-then-confirm: selecting an invitable row
                          only got us here. Sending the invite is a separate,
                          explicit consent affordance — the row's own act
                          never fires the outbound email. */}
                      {isArmed && (
                        <div
                          role="group"
                          id={confirmId}
                          aria-label={`Invite ${dc.client_email}`}
                          data-testid={`client-picker-invite-confirm-${dc.id}`}
                          onKeyDown={(event) => {
                            // cmdk's Command root preventDefault()s EVERY Enter
                            // that reaches it and re-dispatches SELECT on the
                            // highlighted row, so a button inside its subtree
                            // never receives the browser's activation click and
                            // the invite silently never fires. Intercept before
                            // the key climbs, and activate the focused control
                            // by hand. Space too, for parity.
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            const target = event.target as HTMLElement | null;
                            if (!(target instanceof HTMLButtonElement)) return;
                            event.preventDefault();
                            event.stopPropagation();
                            target.click();
                          }}
                          className="px-2 pb-1.5 pt-0.5 text-[0.7rem] leading-snug text-[var(--text-muted)]"
                        >
                          <p className="mb-1.5">
                            {dc.client_email} has no Patina account yet. Sending
                            an invite emails them a signup link and links this
                            record once they accept.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              ref={armedSendRef}
                              data-testid={`client-picker-invite-send-${dc.id}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setArmedInviteId(null);
                                void handleInviteAndLink(dc);
                              }}
                              className="rounded-sm bg-[var(--accent-primary)] px-2 py-1 text-[0.7rem] font-medium text-white"
                            >
                              Send invite
                            </button>
                            <button
                              type="button"
                              data-testid={`client-picker-invite-cancel-${dc.id}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setArmedInviteId(null);
                              }}
                              className="rounded-sm px-2 py-1 text-[0.7rem] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Login-required flow: explain why a no-email row is
                          stuck rather than leaving it a mystery greyed-out
                          row. */}
                      {needsLoginHint && (
                        <div
                          data-testid={`client-picker-login-required-${dc.id}`}
                          className="px-2 pb-1 pt-0.5 text-[0.7rem] leading-snug text-[var(--text-muted)]"
                        >
                          Needs a client login before an agreement can be sent — add their email first.
                        </div>
                      )}
                      {/* R83 — quiet inline reason at the act site; no toast. */}
                      {inviteError?.id === dc.id && !isInviting && (
                        <div
                          role="alert"
                          data-testid={`client-picker-invite-error-${dc.id}`}
                          className="px-2 pb-1 pt-0.5 text-[0.7rem] leading-snug text-[var(--color-terracotta-ink)]"
                        >
                          {inviteError.message}
                          <span className="opacity-80">
                            {' '}
                            Select the row again, then Send invite, to retry.
                          </span>
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
                  <div className="px-2 pb-1 pt-0.5 text-[0.7rem] text-[var(--color-terracotta-ink)]">
                    {addError}
                  </div>
                )}
              </CommandPrimitive.List>
            </CommandPrimitive>
            {/* J2 — the armed state has to be perceivable without sight. It
                lives OUTSIDE the cmdk listbox (buttons and live regions are
                not valid listbox children) and narrates the same three-state
                copy the row's tag shows. */}
            <p aria-live="polite" data-testid="client-picker-invite-status" className="sr-only">
              {armedClient
                ? `Invite armed for ${subtitleFor(armedClient) ?? labelFor(armedClient)}. Choose Send invite to email them, or Cancel.`
                : ''}
            </p>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}

ClientPicker.displayName = 'ClientPicker';

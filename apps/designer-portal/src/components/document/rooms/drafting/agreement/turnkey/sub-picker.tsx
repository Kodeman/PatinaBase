"use client";

/**
 * The studio's rolodex, narrowed to the people who do the work.
 *
 * Modeled on the roster's own list section and COPIED rather than imported:
 * `roster/rolodex-picker.tsx` belongs to the Call Sheet and is not this
 * wave's file to move. What this needs is a fraction of it — a search, a
 * list, a choice — and taking a dependency on the roster's picker would make
 * every future roster change a Contract Room change.
 */

import { useMemo, useState } from "react";
import { useStudioContacts } from "@patina/supabase";
import { Input } from "@/components/ui/controls";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]";

export interface SubChoice {
  contactId: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  trade: string | null;
}

/** The contact kinds that actually build something. A client or a lead is in
 *  the same book and is not a party to a Trade Agreement. */
const TRADE_KINDS = new Set(["sub", "gc", "installer", "vendor", "trade"]);

export function SubPicker({
  studioId,
  value,
  onChange,
  disabled = false,
}: {
  studioId: string | null;
  value: SubChoice | null;
  onChange: (choice: SubChoice | null) => void;
  disabled?: boolean;
}) {
  const contacts = useStudioContacts(studioId);
  const [search, setSearch] = useState("");

  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contacts.data ?? [])
      .filter((contact) => TRADE_KINDS.has(contact.contact_kind))
      .filter((contact) => {
        if (!term) return true;
        const haystack =
          `${contact.company_name ?? ""} ${contact.full_name ?? ""} ${contact.specialties.join(" ")}`.toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) =>
        (a.company_name ?? a.full_name ?? "").localeCompare(
          b.company_name ?? b.full_name ?? "",
        ),
      );
  }, [contacts.data, search]);

  return (
    <div className="space-y-2">
      <label className={LABEL}>
        Trade
        <Input
          className="mt-2"
          aria-label="Search the rolodex"
          disabled={disabled}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search the rolodex…"
        />
      </label>
      {contacts.isLoading ? (
        <p className="text-[11.5px] italic text-[var(--text-muted)]">
          Opening the rolodex…
        </p>
      ) : options.length === 0 ? (
        <p className="text-[11.5px] italic text-[var(--text-muted)]">
          No trades in the rolodex yet. Add one in People.
        </p>
      ) : (
        <ul className="max-h-56 overflow-y-auto border-t border-[var(--doc-ink-border)]">
          {options.map((contact) => {
            const displayName =
              contact.company_name || contact.full_name || "Unnamed";
            const chosen = value?.contactId === contact.id;
            return (
              <li
                key={contact.id}
                className="border-b border-[var(--doc-ink-border)]"
              >
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={chosen}
                  onClick={() =>
                    onChange(
                      chosen
                        ? null
                        : {
                            contactId: contact.id,
                            displayName,
                            companyName: contact.company_name ?? null,
                            email: contact.email ?? null,
                            trade: contact.specialties[0] ?? null,
                          },
                    )
                  }
                  className={`block w-full py-2 text-left text-[12.5px] ${
                    chosen
                      ? "text-[var(--color-charcoal)]"
                      : "text-[var(--color-mocha)]"
                  }`}
                >
                  {displayName}
                  {contact.specialties.length > 0 && (
                    <span className="ml-2 text-[11px] text-[var(--ink-subtle)]">
                      {contact.specialties.join(" · ")}
                    </span>
                  )}
                  {!contact.email && (
                    <span className="ml-2 text-[11px] italic text-[var(--text-faint)]">
                      no email on file
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

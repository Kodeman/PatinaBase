import type { ClientFurnishingsAuthorizationItem, FurnishingsAuthorizationBodyData } from '@patina/types';

function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function groupItemsByRoom(
  items: ClientFurnishingsAuthorizationItem[],
): Array<[string, ClientFurnishingsAuthorizationItem[]]> {
  const groups = new Map<string, ClientFurnishingsAuthorizationItem[]>();
  for (const item of items) {
    const key = item.roomName || 'General';
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries());
}

/** 30 → "30", 12.5 → "12.5". A deposit term is numeric in the DB. */
function percent(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function clientQuantityLabel(quantity: number, unit = 'each'): string {
  const count = quantity.toLocaleString('en-US');
  return unit === 'each' ? count : `${count} ${unit.replace('_', ' ')}`;
}

function clientRoomsLine(name: string, line: ClientFurnishingsAuthorizationItem): string | null {
  const rooms = line.rooms ?? [];
  if (rooms.length < 2) return null;
  return [name, clientQuantityLabel(line.quantity, line.unit), ...rooms.map(room => room.name)].join(' · ');
}

export function FurnishingsAuthorizationBody({ items, depositRequiredCents: executedDeposit, totalAmountCents, depositPercent }: FurnishingsAuthorizationBodyData & { depositRequiredCents?: number }) {
  // Only the executed client paper may substitute its invoice-backed amount.
  const depositRequiredCents = executedDeposit ?? Math.round(totalAmountCents * depositPercent / 100);
  // Allowance unit prices truncate: only frozen line totals reconcile.
  const total = items.reduce((sum, item) => sum + item.clientLineTotalCents, 0);
  const currency = items[0]?.currency ?? 'USD';
  const rooms = groupItemsByRoom(items);
  const statedTotal = totalAmountCents > 0 ? totalAmountCents : total;
  return (
      <section>
        <h2 className="type-section-head">Named furnishing lines</h2>
        <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {rooms.map(([roomName, items]) => (
            <div key={roomName} data-testid="authorization-room-group">
              <p
                className="type-meta pt-4 text-[var(--accent-primary)]"
                data-testid="authorization-room-heading"
              >
                {roomName}
              </p>
              <div className="divide-y divide-[var(--border-subtle)]">
                {items.map((item, index) => {
                  // A line in several rooms files under its primary room and
                  // names every room it is in; a one-room line reads as before.
                  const roomsLine = clientRoomsLine(item.description, item);
                  return (
                    <div
                      key={`${roomName}-${item.description}-${index}`}
                      className="grid grid-cols-[1fr_auto] gap-x-4 py-3"
                    >
                      <div>
                        <p className="type-body-small text-[var(--text-primary)]">{roomsLine ?? item.description}</p>
                        {roomsLine === null && (
                          <p className="type-meta-small mt-0.5">
                            Quantity {clientQuantityLabel(item.quantity, item.unit)}
                          </p>
                        )}
                      </div>
                      <p className="type-label text-right">
                        {/* An allowance prints Up to its ceiling, everywhere (F8). */}
                        {item.allowance ? 'Up to ' : ''}
                        {money(item.clientLineTotalCents, item.currency)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-baseline justify-between py-4">
            <span className="type-body-small font-medium">Authorized furnishings</span>
            <span className="type-data-large">{money(total, currency)}</span>
          </div>
        </div>
        {depositRequiredCents > 0 && (
          <p
            className="type-body-small mt-3 text-[var(--text-primary)]"
            data-testid="authorization-terms-strip"
          >
            {`Total ${money(statedTotal, currency)} · Deposit ${money(
              depositRequiredCents,
              currency,
            )} (${percent(depositPercent)}%) on signature`}
          </p>
        )}
        <p className="type-body-small mt-3 text-[var(--text-muted)]">
          This signature covers only the descriptions, quantities, and client prices shown here.
          It does not alter the design-services agreement.
        </p>
      </section>
  );
}

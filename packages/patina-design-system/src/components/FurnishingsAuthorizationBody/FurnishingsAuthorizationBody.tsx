'use client';

import { useState } from 'react';
import { authorizationClientImage, authorizationLeadTime, formatLeadTimeWeeks, type ClientFurnishingsAuthorizationItem, type FurnishingsAuthorizationBodyData } from '@patina/types';

function FrozenPhoto({ url, description }: { url: string | null; description: string }) {
  const [failed, setFailed] = useState(false);
  if (!url) return <p className="type-meta-small mt-2">No item photo saved.</p>;
  if (failed) return <p className="type-meta-small mt-2">Item photo unavailable.</p>;
  return <img src={url} alt={description + ' — item photo'} loading="lazy" decoding="async" referrerPolicy="no-referrer"
    className="mt-2 h-40 w-40 object-contain" style={{ maxHeight: 160, maxWidth: 160 }} onError={() => setFailed(true)} />;
}

function money(cents: number, currency = 'USD', preserveCents = false): string {
  const fractionDigits = preserveCents && cents % 100 !== 0 ? 2 : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
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

function clientUnitLine(item: ClientFurnishingsAuthorizationItem): string | null {
  if (!authorizationLeadTime(item.leadTime) || item.allowance || item.quantity <= 1 || item.quantity * item.clientUnitPriceCents !== item.clientLineTotalCents) return null;
  const unitPrice = money(item.clientUnitPriceCents, item.currency, true);
  return clientQuantityLabel(item.quantity, item.unit) + ' × ' + unitPrice;
}

function ItemMeta({ item, hasRoomsLine }: { item: ClientFurnishingsAuthorizationItem; hasRoomsLine: boolean }) {
  const leadTime = authorizationLeadTime(item.leadTime);
  const unitLine = clientUnitLine(item);
  return <>
    {unitLine ? <p className="type-meta-small mt-0.5">{unitLine}</p> : !hasRoomsLine && (
      <p className="type-meta-small mt-0.5">Quantity {clientQuantityLabel(item.quantity, item.unit)}</p>
    )}
    {leadTime && <p className="type-meta-small mt-0.5">{leadTime.weeks === null ? formatLeadTimeWeeks(null) : `Lead time · ${formatLeadTimeWeeks(leadTime.weeks)}`}</p>}
  </>;
}

function AuthorizationConsent({ hasLeadTime }: { hasLeadTime: boolean }) {
  return <p className="type-body-small mt-3 text-[var(--text-muted)]">
    This signature covers only the descriptions, quantities, and client prices shown here.
    It does not alter the design-services agreement.
    {hasLeadTime && " Lead times are the studio's current estimates, not delivery dates."}
  </p>;
}

export function FurnishingsAuthorizationBody({ items, depositRequiredCents: executedDeposit, totalAmountCents, depositPercent }: FurnishingsAuthorizationBodyData & { depositRequiredCents?: number }) {
  // Only the executed client paper may substitute its invoice-backed amount.
  const depositRequiredCents = executedDeposit ?? Math.round(totalAmountCents * depositPercent / 100);
  // Allowance unit prices truncate: only frozen line totals reconcile.
  const total = items.reduce((sum, item) => sum + item.clientLineTotalCents, 0);
  const currency = items[0]?.currency ?? 'USD';
  const hasLeadTime = items.some(item => authorizationLeadTime(item.leadTime) !== undefined);
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
                  const clientImage = authorizationClientImage(item.clientImage);
                  const hasItemLeadTime = authorizationLeadTime(item.leadTime) !== undefined;
                  const [rowClass, metaClass] = hasItemLeadTime
                    ? ["grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-3", "min-w-0 break-words"]
                    : ["grid grid-cols-[1fr_auto] gap-x-4 py-3", undefined];
                  return (
                    <div
                      key={`${roomName}-${item.description}-${index}`}
                      className={rowClass}
                    >
                      <div className={metaClass}>
                        <p className="type-body-small text-[var(--text-primary)]">{roomsLine ?? item.description}</p>
                        {clientImage && <FrozenPhoto key={clientImage.url} url={clientImage.url} description={item.description} />}
                        <ItemMeta item={item} hasRoomsLine={roomsLine !== null} />
                      </div>
                      <p className="type-label text-right">
                        {/* An allowance prints Up to its ceiling, everywhere (F8). */}
                        {item.allowance ? 'Up to ' : ''}
                        {money(item.clientLineTotalCents, item.currency, hasItemLeadTime)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-baseline justify-between py-4">
            <span className="type-body-small font-medium">Authorized furnishings</span>
            <span className="type-data-large">{money(total, currency, hasLeadTime)}</span>
          </div>
        </div>
        {depositRequiredCents > 0 && (
          <p
            className="type-body-small mt-3 text-[var(--text-primary)]"
            data-testid="authorization-terms-strip"
          >
            {`Total ${money(statedTotal, currency, hasLeadTime)} · Deposit ${money(
              depositRequiredCents,
              currency,
              hasLeadTime,
            )} (${percent(depositPercent)}%) on signature`}
          </p>
        )}
        <AuthorizationConsent hasLeadTime={hasLeadTime} />
      </section>
  );
}

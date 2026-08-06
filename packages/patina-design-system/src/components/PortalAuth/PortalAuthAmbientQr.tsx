'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { buildQrMatrix, PINNED_QR_MODULE_COUNT } from './qr-matrix'

/* ------------------------------------------------------------------ *
 * The badge's material.
 *
 * Every colour is a literal hex written onto the element, never a theme
 * token: this component is compiled by four independent Tailwind builds,
 * and only arbitrary-value utilities (plus `font-heading` / `font-mono`)
 * are guaranteed to exist in all four.
 * ------------------------------------------------------------------ */

/** The plate the modules sit on — solid, so the pane's raking light never washes them. */
const QR_PLATE = '#1A1816'
/** Dark modules render pearl: the symbol is inverted against the dark pane. */
const QR_PEARL = '#E5E2DD'
/** Finder marks, monogram, and countdown ring. */
const QR_GOLD = '#C4A265'

/** Four modules of quiet zone on every side, per the QR spec's minimum. */
const QR_QUIET_ZONE = 4
/** Finder patterns occupy a 7×7 block in three corners. */
const QR_FINDER_SPAN = 7
/**
 * Module dots, in module units. 0.42 keeps the dot-matrix airy while putting
 * enough ink in each cell for a camera to threshold it — an inverted, dotted
 * symbol has less contrast energy per module than a solid black-on-white one,
 * so the dots run fatter than the reference art's.
 */
const QR_MODULE_RADIUS = 0.42
/** The monogram disc, in module units — inside the ≤7×7 budget level Q can absorb. */
const QR_MONOGRAM_RADIUS = 3.6

export type PortalAuthQrPhase = 'live' | 'refreshing' | 'resting' | 'error'

export interface PortalAuthQrProps {
  /**
   * The `patina://auth?…` payload. The matrix is memoized on this string.
   *
   * `null` means "no code to draw yet" — before the first generate lands, or
   * after one fails. It is deliberately nullable: an empty string is a valid
   * QR payload, so a `?? ''` fallback would render a real, scannable code of
   * nothing at all.
   */
  url: string | null
  secondsRemaining: number
  totalSeconds: number
  phase: PortalAuthQrPhase
  /** Overrides the primary caption — e.g. "Approved — signing you in…". */
  statusMessage?: string
  /** Fired when a resting or failed badge is pressed for a fresh code. */
  onWake?: () => void
}

/** Module dimming per phase. Literal strings: an interpolated class compiles nowhere. */
const QR_PHASE_OPACITY: Record<PortalAuthQrPhase, string> = {
  live: 'opacity-100',
  refreshing: 'opacity-[0.55]',
  resting: 'opacity-[0.35]',
  error: 'opacity-[0.35]',
}

const QR_PHASE_CAPTION: Record<PortalAuthQrPhase, string> = {
  live: 'Scan with your signed-in phone',
  refreshing: 'Making a fresh code…',
  resting: 'Tap for a fresh code',
  error: 'QR is unavailable. Tap to try again.',
}

/**
 * What a spent badge says when there is nothing to tap — the transport is
 * inside its rate-limit backoff, so `onWake` is withheld. Promising a tap that
 * would be swallowed is worse than saying plainly that it will come back.
 */
const QR_UNTAPPABLE_CAPTION = 'QR is resting. It will retry in a moment.'

const QR_PHASE_LABEL: Record<PortalAuthQrPhase, string> = {
  live: 'Sign-in QR code. Scan it with your signed-in phone.',
  refreshing: 'Making a fresh sign-in QR code.',
  resting: 'A rested sign-in QR code.',
  error: 'The sign-in QR code is unavailable.',
}

/** m:ss, floored and zero-padded. 272 → "4:32". */
export function formatQrCountdown(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

function ringFraction(secondsRemaining: number, totalSeconds: number) {
  if (!Number.isFinite(secondsRemaining) || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return 0
  return Math.min(1, Math.max(0, secondsRemaining / totalSeconds))
}

function isFinderModule(row: number, column: number, size: number) {
  const inLeading = (value: number) => value < QR_FINDER_SPAN
  const inTrailing = (value: number) => value >= size - QR_FINDER_SPAN
  return (
    (inLeading(row) && inLeading(column)) ||
    (inLeading(row) && inTrailing(column)) ||
    (inTrailing(row) && inLeading(column))
  )
}

/**
 * The three corner marks, redrawn by hand.
 *
 * The ratio is the whole point. A detector crosses each finder along its centre
 * scanlines and checks the run lengths for 1:1:3:1:1 — ring, gap, core, gap,
 * ring. The core must therefore be SOLID: an earlier pass punched a pearl dot
 * through its middle, which reads as 1:1:1:1:1:1:1 on exactly the two lines the
 * detector measures and disqualifies the mark.
 *
 * All of the finder geometry lives here on purpose: if a real-device scan ever
 * rejects the rounded marks, swapping this one helper for plain squares is the
 * cheapest scannability lever available — nothing else in the badge knows how a
 * finder is shaped.
 */
function PortalAuthQrFinderMark({ x, y }: { x: number; y: number }) {
  return (
    <g data-testid="portal-auth-qr-finder">
      <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={2} ry={2} fill="none" stroke={QR_GOLD} strokeWidth={1} />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={1} ry={1} fill={QR_GOLD} />
    </g>
  )
}

/**
 * The ambient sign-in badge: a pearl dot-matrix QR on the dark pane, ringed by
 * a gold countdown that empties as the code ages.
 *
 * The component is presentation only — the transport (generate, poll, renew)
 * stays in the portal adapters. It draws whatever `phase`, `secondsRemaining`,
 * and `totalSeconds` it is handed, and calls `onWake` when a resting or failed
 * badge is pressed.
 */
export function PortalAuthAmbientQr({
  url,
  secondsRemaining,
  totalSeconds,
  phase,
  statusMessage,
  onWake,
  className,
}: PortalAuthQrProps & { className?: string }) {
  const matrix = React.useMemo(() => (url === null ? null : buildQrMatrix(url)), [url])

  /**
   * The dot field is ~1,200 nodes. Memoizing the *element* (not just the data)
   * means React skips reconciling the whole subtree on every countdown tick —
   * the ring is the only thing that changes once a second.
   *
   * With no url the same drawing runs without its data dots: plate, corner
   * marks, monogram. It is a placeholder, not a code — nothing scannable is
   * ever put on screen for a payload we do not have.
   */
  const artwork = React.useMemo(() => {
    const size = matrix?.size ?? PINNED_QR_MODULE_COUNT
    const side = size + QR_QUIET_ZONE * 2
    const centre = side / 2
    const dots: React.ReactNode[] = []
    matrix?.rows.forEach((cells, row) => {
      cells.forEach((dark, column) => {
        if (!dark || isFinderModule(row, column, size)) return
        dots.push(
          <circle
            key={`${row}-${column}`}
            cx={QR_QUIET_ZONE + column + 0.5}
            cy={QR_QUIET_ZONE + row + 0.5}
            r={QR_MODULE_RADIUS}
            fill={QR_PEARL}
          />
        )
      })
    })
    const finderOrigin = QR_QUIET_ZONE + size - QR_FINDER_SPAN
    return (
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${side} ${side}`}
        data-testid="portal-auth-qr-matrix"
        className="h-full w-full"
      >
        <g>{dots}</g>
        <PortalAuthQrFinderMark x={QR_QUIET_ZONE} y={QR_QUIET_ZONE} />
        <PortalAuthQrFinderMark x={finderOrigin} y={QR_QUIET_ZONE} />
        <PortalAuthQrFinderMark x={QR_QUIET_ZONE} y={finderOrigin} />
        {/* The monogram rides the level-Q recovery budget — no modules are
            excavated. It does cover version 9's central alignment pattern at
            (26,26): that pattern is a sampling-grid reference, and the
            ZXing-family detectors these phones ship sample from the
            bottom-right alignment pattern at (46,46) instead, so losing the
            centre one is expected-tolerable rather than free. The real-device
            scan is the gate; if it fails, dropping this disc is fallback lever
            #3 (after square finders and a bigger render). */}
        <circle cx={centre} cy={centre} r={QR_MONOGRAM_RADIUS} fill={QR_PLATE} />
        <text
          x={centre}
          y={centre}
          className="font-heading"
          fill={QR_GOLD}
          fontSize={5}
          textAnchor="middle"
          dominantBaseline="central"
        >
          P
        </text>
      </svg>
    )
  }, [matrix])

  const spent = phase === 'resting' || phase === 'error'
  /**
   * A spent badge is only a button when there is something a press can do.
   * Inside the rate-limit backoff the adapters withhold `onWake`, and a button
   * that swallows every press is a worse promise than no button at all.
   */
  const interactive = spent && typeof onWake === 'function'
  const dashOffset = 100 * (1 - (spent ? 0 : ringFraction(secondsRemaining, totalSeconds)))
  const caption =
    statusMessage ?? (spent && !interactive ? QR_UNTAPPABLE_CAPTION : QR_PHASE_CAPTION[phase])
  /**
   * A status message replaces the caption, never the invitation: a declined
   * request still has to tell the person how to ask for a fresh code.
   */
  const affordance = interactive && statusMessage ? QR_PHASE_CAPTION[phase] : null
  const showCountdown = phase === 'live' && !statusMessage && totalSeconds > 0 && url !== null

  const art = (
    <span
      {...(interactive
        ? { 'aria-hidden': true as const }
        : { role: 'img', 'aria-label': QR_PHASE_LABEL[phase] })}
      className="relative block h-[260px] w-[260px]"
    >
      {/* The ring is hung OUTSIDE the art box on purpose. Its radius has to
          clear the plate's rounded corners (√2·(100−14)+14 ≈ 135.6px for the
          200px plate below), which a circle inscribed in a 260px box cannot do
          at r=48. Sixteen pixels of negative inset buys ~140px of radius; the
          badge keeps its compact 260px layout box and the gold circle still
          encloses the whole plate. */}
      <span aria-hidden="true" className="pointer-events-none absolute -inset-[16px] block">
        <svg aria-hidden="true" viewBox="0 0 100 100" className="h-full w-full">
          <circle cx="50" cy="50" r="48" fill="none" stroke={QR_GOLD} strokeOpacity="0.16" strokeWidth="0.42" />
          <circle
            data-testid="portal-auth-qr-ring"
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke={QR_GOLD}
            strokeWidth="0.42"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={dashOffset}
            transform="rotate(-90 50 50)"
            className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
          />
        </svg>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-[30px] block overflow-hidden rounded-[14px] bg-[#1A1816] transition-opacity duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none',
          // A placeholder is never presented at full strength — there is no code
          // in it to scan, whatever the phase happens to be.
          url === null ? 'opacity-[0.35]' : QR_PHASE_OPACITY[phase]
        )}
      >
        {artwork}
      </span>
    </span>
  )

  const captions = (
    <>
      <span className="mt-[18px] block max-w-[26ch] text-center text-[12px] leading-[1.5] text-[#B8A999]">{caption}</span>
      {affordance && (
        <span className="mt-[6px] block max-w-[26ch] text-center text-[12px] leading-[1.5] text-[#B8A999]">
          {affordance}
        </span>
      )}
      {showCountdown && (
        <span className="mt-[6px] block text-center font-mono text-[11px] uppercase tabular-nums tracking-[0.18em] text-[#C4A265]">
          Refreshes in {formatQrCountdown(secondsRemaining)}
        </span>
      )}
    </>
  )

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onWake}
        data-testid="portal-auth-qr"
        className={cn(
          'hidden select-none flex-col items-center focus:outline-none focus:ring-2 focus:ring-[#C4A57B] focus:ring-offset-4 focus:ring-offset-[#1A1816] [@media(min-width:1024px)_and_(min-height:760px)]:flex',
          className
        )}
      >
        {art}
        {captions}
      </button>
    )
  }

  return (
    <div
      data-testid="portal-auth-qr"
      className={cn(
        'hidden flex-col items-center [@media(min-width:1024px)_and_(min-height:760px)]:flex',
        className
      )}
    >
      {art}
      {captions}
    </div>
  )
}

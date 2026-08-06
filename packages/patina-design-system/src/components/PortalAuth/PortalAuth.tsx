'use client'

import * as React from 'react'
import { Apple } from 'lucide-react'
import { cn } from '../../utils/cn'
import { StrataMark } from '../StrataMark'
import { PortalAuthAmbientQr } from './PortalAuthAmbientQr'
import type { PortalAuthQrProps } from './PortalAuthAmbientQr'

export type { PortalAuthQrPhase, PortalAuthQrProps } from './PortalAuthAmbientQr'

export const PORTAL_AUTH_TAGLINE = 'A workshop for interior designers, their clients, and the makers they trust.'

/** Canonical accessible colors used by the auth surface (documented for deterministic contrast tests). */
export const PORTAL_AUTH_A11Y_COLORS = {
  ink: '#2C2926',
  mutedInk: '#65594E',
  placeholder: '#7A6A5B',
  border: '#8B7355',
  surface: '#FCFAF6',
  focus: '#5C4A3C',
} as const

/** Canonical accessible colors used by the dark brand pane (documented for deterministic contrast tests). */
export const PORTAL_AUTH_A11Y_COLORS_BRAND = {
  surface: '#1A1816',
  text: '#E5E2DD',
  mutedText: '#B8A999',
  focus: '#C4A57B',
} as const

/* ------------------------------------------------------------------ *
 * Decorative material constants.
 *
 * These are inline background values rather than Tailwind utilities on
 * purpose: the component is compiled by four independent Tailwind builds,
 * so anything beyond arbitrary-value utilities has to be portable CSS.
 * ------------------------------------------------------------------ */

/** Four-layer raking light on the brand pane. Alphas ride CSS vars so state can shift them. */
const PORTAL_AUTH_BRAND_LIGHT =
  'radial-gradient(145% 130% at 118% 48%, rgba(0,0,0,var(--pa-gl-shade)) 0%, rgba(0,0,0,calc(var(--pa-gl-shade) * 0.62)) 34%, rgba(0,0,0,0) 82%),' +
  'radial-gradient(40% 28% at 4% var(--pa-gl-core-y), rgba(196,162,101,var(--pa-gl-core)), rgba(196,162,101,0) 70%),' +
  'radial-gradient(115% 82% at -10% 20%, rgba(196,162,101,var(--pa-gl-fall)) 0%, rgba(184,169,153,calc(var(--pa-gl-fall) * 0.53)) 34%, rgba(184,169,153,calc(var(--pa-gl-fall) * 0.125)) 62%, rgba(184,169,153,0) 100%),' +
  'radial-gradient(130% 40% at 18% 104%, rgba(196,162,101,var(--pa-gl-sill)), rgba(196,162,101,0) 70%)'

/** Film grain — the marketing site's feTurbulence, inlined so no external host is touched. */
const PORTAL_AUTH_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)'/%3E%3C/svg%3E\")"

/** The golden sill rule — light fading left to right. */
const PORTAL_AUTH_SILL_RULE =
  'linear-gradient(90deg, rgba(196,162,101,0.55) 0%, rgba(184,169,153,0.22) 62%, rgba(184,169,153,0) 100%)'

/** Gilded hairline used on the paper side wherever a section edge is drawn. */
const PORTAL_AUTH_GILDED_RULE =
  'linear-gradient(90deg, rgba(196,162,101,0.8) 0%, rgba(139,115,85,0.3) 52%, rgba(139,115,85,0) 100%)'

/** Low warm horizon pooled at the foot of the form pane. */
const PORTAL_AUTH_HORIZON =
  'linear-gradient(to top, rgba(196,162,101,0.13) 0%, rgba(196,162,101,0.05) 40%, rgba(196,162,101,0) 100%)'

/**
 * The sectioned ground under the sill: four beds that are value steps of the
 * same deep ink, plus one marker seam carrying the portal's own colour.
 * Transcribed from the approved mockup's generator — the geometry is
 * deterministic, so it ships as literals instead of runtime math.
 * Viewport is 600x260 with preserveAspectRatio="none": vertical scale is
 * exactly 1, so the relief is the same real pixels at every width.
 */
const PORTAL_AUTH_GROUND_BEDS: ReadonlyArray<{ d: string; fill: string }> = [
  {
    fill: '#25221E',
    d: 'M0.0,11.0 Q37.5,11.3 56.3,11.1 Q75.0,10.9 93.8,10.7 Q112.5,10.5 131.3,10.4 Q150.0,10.4 168.8,10.4 Q187.5,10.3 206.3,10.1 Q225.0,9.9 243.8,9.4 Q262.5,9.0 281.3,8.7 Q300.0,8.4 318.8,8.6 Q337.5,8.8 356.3,9.2 Q375.0,9.7 393.8,10.0 Q412.5,10.4 431.3,10.4 Q450.0,10.5 468.8,10.5 Q487.5,10.5 506.3,10.6 Q525.0,10.8 543.8,11.0 Q562.5,11.3 581.3,11.2 L600.0,11.1 L600.0,41.0 Q562.5,40.9 543.8,40.8 Q525.0,40.8 506.3,40.8 Q487.5,40.9 468.8,41.0 Q450.0,41.1 431.3,41.1 Q412.5,41.1 393.8,40.8 Q375.0,40.5 356.3,40.0 Q337.5,39.6 318.8,39.1 Q300.0,38.7 281.3,38.5 Q262.5,38.3 243.8,38.4 Q225.0,38.5 206.3,38.8 Q187.5,39.1 168.8,39.3 Q150.0,39.6 131.3,39.7 Q112.5,39.8 93.8,39.8 Q75.0,39.8 56.3,39.8 Q37.5,39.9 18.8,40.2 L0.0,40.4 Z',
  },
  {
    fill: 'url(#portal-auth-seam)',
    d: 'M0.0,40.4 Q37.5,39.9 56.3,39.8 Q75.0,39.8 93.8,39.8 Q112.5,39.8 131.3,39.7 Q150.0,39.6 168.8,39.3 Q187.5,39.1 206.3,38.8 Q225.0,38.5 243.8,38.4 Q262.5,38.3 281.3,38.5 Q300.0,38.7 318.8,39.1 Q337.5,39.6 356.3,40.0 Q375.0,40.5 393.8,40.8 Q412.5,41.1 431.3,41.1 Q450.0,41.1 468.8,41.0 Q487.5,40.9 506.3,40.8 Q525.0,40.8 543.8,40.8 Q562.5,40.9 581.3,41.0 L600.0,41.0 L600.0,44.0 Q562.5,43.9 543.8,43.8 Q525.0,43.8 506.3,43.8 Q487.5,43.9 468.8,44.0 Q450.0,44.1 431.3,44.1 Q412.5,44.1 393.8,43.8 Q375.0,43.5 356.3,43.0 Q337.5,42.6 318.8,42.1 Q300.0,41.7 281.3,41.5 Q262.5,41.3 243.8,41.4 Q225.0,41.5 206.3,41.8 Q187.5,42.1 168.8,42.3 Q150.0,42.6 131.3,42.7 Q112.5,42.8 93.8,42.8 Q75.0,42.8 56.3,42.8 Q37.5,42.9 18.8,43.2 L0.0,43.4 Z',
  },
  {
    fill: '#141311',
    d: 'M0.0,43.4 Q37.5,42.9 56.3,42.8 Q75.0,42.8 93.8,42.8 Q112.5,42.8 131.3,42.7 Q150.0,42.6 168.8,42.3 Q187.5,42.1 206.3,41.8 Q225.0,41.5 243.8,41.4 Q262.5,41.3 281.3,41.5 Q300.0,41.7 318.8,42.1 Q337.5,42.6 356.3,43.0 Q375.0,43.5 393.8,43.8 Q412.5,44.1 431.3,44.1 Q450.0,44.1 468.8,44.0 Q487.5,43.9 506.3,43.8 Q525.0,43.8 543.8,43.8 Q562.5,43.9 581.3,44.0 L600.0,44.0 L600.0,85.1 Q562.5,84.8 543.8,84.6 Q525.0,84.4 506.3,84.4 Q487.5,84.4 468.8,84.2 Q450.0,83.9 431.3,83.4 Q412.5,82.9 393.8,82.8 Q375.0,82.7 356.3,83.2 Q337.5,83.6 318.8,84.0 Q300.0,84.3 281.3,84.3 Q262.5,84.3 243.8,84.5 Q225.0,84.6 206.3,84.9 Q187.5,85.1 168.8,84.9 Q150.0,84.7 131.3,84.1 Q112.5,83.5 93.8,83.3 Q75.0,83.0 56.3,83.2 Q37.5,83.4 18.8,83.4 L0.0,83.5 Z',
  },
  {
    fill: '#1E1C19',
    d: 'M0.0,83.5 Q37.5,83.4 56.3,83.2 Q75.0,83.0 93.8,83.3 Q112.5,83.5 131.3,84.1 Q150.0,84.7 168.8,84.9 Q187.5,85.1 206.3,84.9 Q225.0,84.6 243.8,84.5 Q262.5,84.3 281.3,84.3 Q300.0,84.3 318.8,84.0 Q337.5,83.6 356.3,83.2 Q375.0,82.7 393.8,82.8 Q412.5,82.9 431.3,83.4 Q450.0,83.9 468.8,84.2 Q487.5,84.4 506.3,84.4 Q525.0,84.4 543.8,84.6 Q562.5,84.8 581.3,85.0 L600.0,85.1 L600.0,150.7 Q562.5,150.0 543.8,149.4 Q525.0,148.9 506.3,148.6 Q487.5,148.3 468.8,148.4 Q450.0,148.5 431.3,148.9 Q412.5,149.3 393.8,149.6 Q375.0,149.9 356.3,150.0 Q337.5,150.1 318.8,150.1 Q300.0,150.1 281.3,150.3 Q262.5,150.5 243.8,150.9 Q225.0,151.3 206.3,151.5 Q187.5,151.7 168.8,151.5 Q150.0,151.3 131.3,150.8 Q112.5,150.2 93.8,149.8 Q75.0,149.3 56.3,149.2 Q37.5,149.0 18.8,149.1 L0.0,149.2 Z',
  },
  {
    fill: '#121110',
    d: 'M0.0,149.2 Q37.5,149.0 56.3,149.2 Q75.0,149.3 93.8,149.8 Q112.5,150.2 131.3,150.8 Q150.0,151.3 168.8,151.5 Q187.5,151.7 206.3,151.5 Q225.0,151.3 243.8,150.9 Q262.5,150.5 281.3,150.3 Q300.0,150.1 318.8,150.1 Q337.5,150.1 356.3,150.0 Q375.0,149.9 393.8,149.6 Q412.5,149.3 431.3,148.9 Q450.0,148.5 468.8,148.4 Q487.5,148.3 506.3,148.6 Q525.0,148.9 543.8,149.4 Q562.5,150.0 581.3,150.3 L600.0,150.7 L600.0,260.0 L0.0,260.0 Z',
  },
]

const PORTAL_AUTH_GROUND_CONTACTS: ReadonlyArray<{ d: string; stroke: string }> = [
  {
    stroke: 'rgba(0,0,0,0.34)',
    d: 'M0.0,43.4 Q37.5,42.9 56.3,42.8 Q75.0,42.8 93.8,42.8 Q112.5,42.8 131.3,42.7 Q150.0,42.6 168.8,42.3 Q187.5,42.1 206.3,41.8 Q225.0,41.5 243.8,41.4 Q262.5,41.3 281.3,41.5 Q300.0,41.7 318.8,42.1 Q337.5,42.6 356.3,43.0 Q375.0,43.5 393.8,43.8 Q412.5,44.1 431.3,44.1 Q450.0,44.1 468.8,44.0 Q487.5,43.9 506.3,43.8 Q525.0,43.8 543.8,43.8 Q562.5,43.9 581.3,44.0 L600.0,44.0',
  },
  {
    stroke: 'rgba(0,0,0,0.24)',
    d: 'M0.0,83.5 Q37.5,83.4 56.3,83.2 Q75.0,83.0 93.8,83.3 Q112.5,83.5 131.3,84.1 Q150.0,84.7 168.8,84.9 Q187.5,85.1 206.3,84.9 Q225.0,84.6 243.8,84.5 Q262.5,84.3 281.3,84.3 Q300.0,84.3 318.8,84.0 Q337.5,83.6 356.3,83.2 Q375.0,82.7 393.8,82.8 Q412.5,82.9 431.3,83.4 Q450.0,83.9 468.8,84.2 Q487.5,84.4 506.3,84.4 Q525.0,84.4 543.8,84.6 Q562.5,84.8 581.3,85.0 L600.0,85.1',
  },
  {
    stroke: 'rgba(0,0,0,0.22)',
    d: 'M0.0,149.2 Q37.5,149.0 56.3,149.2 Q75.0,149.3 93.8,149.8 Q112.5,150.2 131.3,150.8 Q150.0,151.3 168.8,151.5 Q187.5,151.7 206.3,151.5 Q225.0,151.3 243.8,150.9 Q262.5,150.5 281.3,150.3 Q300.0,150.1 318.8,150.1 Q337.5,150.1 356.3,150.0 Q375.0,149.9 393.8,149.6 Q412.5,149.3 431.3,148.9 Q450.0,148.5 468.8,148.4 Q487.5,148.3 506.3,148.6 Q525.0,148.9 543.8,149.4 Q562.5,150.0 581.3,150.3 L600.0,150.7',
  },
]

/**
 * The only CSS this family cannot express as portable Tailwind utilities:
 * keyframes (arbitrary `animate-[…]` utilities still need a named source),
 * the StrataMark bar stagger (the mark owns its own children), the static
 * light constants, and the clipped-gradient headline (an `@supports` guard
 * cannot be written as a utility, and the fallback has to be the h1's own
 * solid clay).
 *
 * The light ships at its STATIC DEFAULT. The mockup shifted the raking light
 * and the ground seam per form state through `.pa-auth-card:has(…)`; that
 * selector breaks jsdom's `getComputedStyle`, so it is not shipped. The
 * `data-portal-auth-tone` attributes stay on Notice and Success — inert, and
 * ready for the day the state light returns behind a supports check.
 *
 * The only colour here is the headline gradient, which cannot leave this
 * block; every other colour on the surface is an arbitrary-value hex on the
 * element itself.
 */
const PORTAL_AUTH_STYLE = `
.pa-auth-card{--pa-gl-core:.22;--pa-gl-fall:.16;--pa-gl-sill:.24;--pa-gl-shade:.72;--pa-gl-core-y:10%;--pa-sa:.70;--pa-sb:1;--pa-sc:.80;--pa-sd:.52}
@supports ((-webkit-background-clip:text) or (background-clip:text)){
.pa-auth-display-fill{background-image:linear-gradient(135deg,#B8A999,#C4A265);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
}
@keyframes pa-auth-rise{from{opacity:0;transform:translate3d(0,30px,0)}to{opacity:1;transform:none}}
@keyframes pa-auth-reveal{from{transform:translate3d(0,108%,0)}to{transform:none}}
@keyframes pa-auth-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pa-auth-mark line{transform-box:view-box;transform-origin:1px 50%;animation:pa-auth-bar 700ms cubic-bezier(0.16,1,0.3,1) both}
.pa-auth-mark line:nth-child(1){animation-delay:0s}
.pa-auth-mark line:nth-child(2){animation-delay:.12s}
.pa-auth-mark line:nth-child(3){animation-delay:.24s}
@media (prefers-reduced-motion:reduce){
.pa-auth-mark line{animation:none}
}
`

/**
 * Fade-rise entrance, driven by the keyframes above.
 *
 * Every class string is written out in full: Tailwind extracts candidates from
 * source *text*, so an interpolated `animate-[…${delay}…]` would compile to a
 * class that no build ever generates. One literal per stagger step.
 */
const RISE = {
  notice: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.2s_both] motion-reduce:animate-none',
  eyebrow: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.16s_both] motion-reduce:animate-none',
  head: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.28s_both] motion-reduce:animate-none',
  field: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.36s_both] motion-reduce:animate-none',
  description: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.42s_both] motion-reduce:animate-none',
  action: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.44s_both] motion-reduce:animate-none',
  qr: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.48s_both] motion-reduce:animate-none',
  alt: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.52s_both] motion-reduce:animate-none',
  foot: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.54s_both] motion-reduce:animate-none',
  sill: 'animate-[pa-auth-rise_1s_cubic-bezier(0.16,1,0.3,1)_0.62s_both] motion-reduce:animate-none',
} as const

/** The clay seam that marks the live field. Decorative — focus stays mocha. */
function PortalAuthFieldSeam() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-[38%] bg-[var(--portal-auth-accent)] transition-[width] duration-[320ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-focus-within:w-full motion-reduce:transition-none"
    />
  )
}

/** A gilded hairline that fades as the light does. */
function PortalAuthRule({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block h-px', className)}
      style={{ backgroundImage: PORTAL_AUTH_GILDED_RULE }}
    />
  )
}

export type PortalLoginState =
  | 'email'
  | 'code'
  | 'apple-pending'
  | 'password'
  | 'success'

export interface PortalOAuthAction {
  id: 'apple' | 'google' | 'microsoft' | (string & {})
  label: string
  onSelect: () => void
  pending?: boolean
  available?: boolean
}

export interface PortalAuthShellProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow: string
  title: string
  description: string
  accent: string
  supportEmail: string
  children: React.ReactNode
  tagline?: string
  /** The ambient countdown QR badge. Omitted, the pane renders exactly as before. */
  qr?: PortalAuthQrProps
}

/** A flat, material-led frame shared by Patina portal sign-in experiences. */
export function PortalAuthShell({
  eyebrow,
  title,
  description,
  accent,
  supportEmail,
  tagline = PORTAL_AUTH_TAGLINE,
  qr,
  children,
  className,
  style,
  ...props
}: PortalAuthShellProps) {
  return (
    <main
      {...props}
      className={cn('min-h-screen bg-[#FAF7F2] px-[16px] py-[20px] text-[#2C2926] sm:p-[32px]', className)}
      style={{ ...style, '--portal-auth-accent': accent } as React.CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: PORTAL_AUTH_STYLE }} />
      {/* Page grain — the paper side is dressed too, the same feTurbulence the
          marketing site uses, multiplied over the whole sheet. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[80] opacity-[0.025] mix-blend-multiply"
        style={{ backgroundImage: PORTAL_AUTH_GRAIN }}
      />
      <div className="pa-auth-card mx-auto grid min-h-[calc(100vh-40px)] max-w-[1152px] border border-[#8B7355] bg-[#FCFAF6] sm:min-h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.78fr)]">
        <section className="relative z-0 flex min-h-[256px] flex-col justify-between overflow-hidden border-b border-[#8B7355] bg-[#1A1816] p-[28px] text-[#E5E2DD] [--pa-bpad:28px] sm:p-[40px] sm:[--pa-bpad:40px] lg:min-h-full lg:border-b-0 lg:border-r lg:p-[56px] lg:[--pa-bpad:56px]">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[4px] bg-[var(--portal-auth-accent)]" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: PORTAL_AUTH_BRAND_LIGHT }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-screen"
            style={{ backgroundImage: PORTAL_AUTH_GRAIN }}
          />
          <div className="relative">
            <div className="mb-[56px] flex items-center gap-[11px] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E5E2DD]">
              <StrataMark size={26} className="pa-auth-mark flex-none" />
              Patina
            </div>
            <p className={cn('font-mono text-[11px] uppercase tracking-[0.25em] text-[#C4A265]', RISE.eyebrow)}>{eyebrow}</p>
            {/* The h1 keeps the solid clay. The clipped gradient rides a class in
                the injected block behind an `@supports` guard, so an engine that
                cannot clip a gradient to text still renders the word. */}
            <h1 className="-mb-[0.14em] mt-[18px] block max-w-[19ch] overflow-hidden pb-[0.14em] font-heading text-[clamp(33px,3.3vw,48px)] font-medium leading-[1.03] tracking-[-0.04em] text-[#C4A57B] [text-wrap:balance]">
              <span
                className={cn(
                  'pa-auth-display-fill block',
                  'animate-[pa-auth-reveal_1.1s_cubic-bezier(0.16,1,0.3,1)_0.24s_both] motion-reduce:animate-none'
                )}
              >
                {title}
              </span>
            </h1>
            <p className={cn('mt-[20px] max-w-[34ch] text-[14px] leading-[1.6] text-[#B8A999]', RISE.description)}>{description}</p>
          </div>
          {/* The badge is a SIBLING of the sill block, never a wrapper around it:
              the ground SVG below hangs on z-index:-1, and a transformed ancestor
              (the entrance animation) would trap it inside this stacking context. */}
          {/* Width alone is not enough room: the badge is ~300px of circle plus
              two caption lines, and a short desktop window (a laptop with the
              browser chrome and a dock) crushes the pane. The gate is height as
              well as width, written as one literal arbitrary variant so all
              four Tailwind builds compile it. */}
          {qr && (
            <div
              className={cn(
                'relative mt-[40px] hidden [@media(min-width:1024px)_and_(min-height:760px)]:block',
                RISE.qr
              )}
            >
              <PortalAuthAmbientQr {...qr} />
            </div>
          )}
          {/* The sill row, and the bedded ground hung off it — the section opens the
              same 18px under the light's own line at every width. The animated wrapper
              is inside, so the ground's z-index:-1 is never trapped in a transform. */}
          <div aria-hidden="true" className="relative mt-auto pb-[22px] pt-[30px]">
            <div className={cn('flex items-center gap-[16px]', RISE.sill)}>
              <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.3em] text-[#C4A265]">
                Where time adds value
              </span>
              <span className="h-px flex-1" style={{ backgroundImage: PORTAL_AUTH_SILL_RULE }} />
            </div>
            <div className="pointer-events-none absolute left-[calc(-1*var(--pa-bpad))] right-[calc(-1*var(--pa-bpad))] top-[46px] z-[-1] h-[260px]">
              <svg viewBox="0 0 600 260" preserveAspectRatio="none" aria-hidden="true" className="h-full w-full">
                <defs>
                  <linearGradient id="portal-auth-seam" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" style={{ stopColor: 'var(--portal-auth-accent)', stopOpacity: 'var(--pa-sa)' }} />
                    <stop offset="0.19" style={{ stopColor: 'var(--portal-auth-accent)', stopOpacity: 'var(--pa-sb)' }} />
                    <stop offset="0.58" style={{ stopColor: 'var(--portal-auth-accent)', stopOpacity: 'var(--pa-sc)' }} />
                    <stop offset="1" style={{ stopColor: 'var(--portal-auth-accent)', stopOpacity: 'var(--pa-sd)' }} />
                  </linearGradient>
                </defs>
                {PORTAL_AUTH_GROUND_BEDS.map((bed) => <path key={bed.fill} d={bed.d} fill={bed.fill} />)}
                {PORTAL_AUTH_GROUND_CONTACTS.map((contact) => <path key={contact.stroke} d={contact.d} fill="none" stroke={contact.stroke} strokeWidth="1" />)}
              </svg>
            </div>
          </div>
          <div className={cn('relative mt-[46px]', RISE.foot)}>
            <p className="max-w-[36ch] text-[14px] leading-[1.6] text-[#B8A999]">{tagline}</p>
            <a className="mt-[14px] inline-block min-h-[44px] py-[11px] text-[14px] text-[#E5E2DD] underline decoration-[rgba(184,169,153,0.55)] underline-offset-4 transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:decoration-[#C4A265] focus:outline-none focus:ring-2 focus:ring-[#C4A57B] focus:ring-offset-2 focus:ring-offset-[#1A1816] motion-reduce:transition-none" href={`mailto:${supportEmail}`}>
              Need a hand? {supportEmail}
            </a>
          </div>
        </section>
        <section className="relative flex items-center justify-center p-[20px] sm:p-[40px] lg:p-[56px]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[54%]"
            style={{ backgroundImage: PORTAL_AUTH_HORIZON }}
          />
          <div className="relative z-[1] w-full max-w-[384px]">{children}</div>
        </section>
      </div>
    </main>
  )
}

export interface PortalAuthNoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'error' | 'info' | 'success'
  title?: string
  children: React.ReactNode
}

export function PortalAuthNotice({ tone = 'info', title, children, className, ...props }: PortalAuthNoticeProps) {
  const toneClasses = {
    error: 'border-t-[#9C3D31]',
    info: 'border-t-[#8B7355]',
    success: 'border-t-[#5E7059]',
  }
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      data-portal-auth-tone={tone}
      className={cn('grid gap-[5px] border-t-2 pt-[15px] text-[14px] leading-[1.5] text-[#65594E]', toneClasses[tone], className)}
      {...props}
    >
      {title && <p className="font-semibold text-[#2C2926]">{title}</p>}
      <div>{children}</div>
    </div>
  )
}

export interface PortalAuthSuccessProps {
  title?: string
  description?: string
  destinationLabel?: string
  /** A real destination for the no-script / redirect-delay fallback. */
  destinationHref: string
  onContinue?: () => void
}

export function PortalAuthSuccess({
  title = 'You’re signed in.',
  description = 'We’re taking you to your portal now.',
  destinationLabel = 'Continue to your portal',
  destinationHref,
  onContinue,
}: PortalAuthSuccessProps) {
  return (
    <div
      className={cn('grid border-t-2 border-t-[#5E7059] pt-[15px]', RISE.head)}
      role="status"
      aria-live="polite"
      data-portal-auth-tone="success"
    >
      <h2 className="font-heading text-[30px] font-medium leading-[1.1] tracking-[-0.03em] text-[#2C2926] [text-wrap:balance]">{title}</h2>
      <p className="mt-[8px] text-[14px] leading-[1.6] text-[#65594E]">{description}</p>
      <a href={destinationHref} onClick={onContinue} className="mt-[10px] inline-flex min-h-[44px] items-center text-[14px] font-semibold text-[#2C2926] underline decoration-[#8B7355] underline-offset-4 transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:decoration-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none">{destinationLabel}</a>
    </div>
  )
}

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  error?: boolean
  errorId?: string
}

function OtpInput({ value, onChange, onComplete, disabled, error, errorId }: OtpInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')
  const update = (nextValue: string) => {
    const normalized = nextValue.replace(/\D/g, '').slice(0, 6)
    onChange(normalized)
    if (normalized.length === 6) onComplete?.(normalized)
  }
  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])
  return (
    <div className={cn('group relative grid gap-[8px]', RISE.field)}>
      <label className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.15em] text-[#65594E]" htmlFor="portal-auth-code">Six-digit code</label>
      <div
        className={cn(
          'relative grid grid-cols-6 gap-[8px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-[5px]',
          error ? 'focus-within:outline-[#9C3D31]' : 'focus-within:outline-[#5C4A3C]'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {digits.map((digit, index) => <span key={index} aria-hidden="true" className={cn('flex h-[48px] items-center justify-center border bg-white font-mono text-[18px] tabular-nums text-[#2C2926]', error ? 'border-[#9C3D31]' : 'border-[#8B7355]', index === value.length && (error ? 'ring-1 ring-inset ring-[#9C3D31]' : 'border-[#5C4A3C] ring-1 ring-inset ring-[#5C4A3C]'))}>{digit.trim()}</span>)}
        <input
          ref={inputRef}
          id="portal-auth-code"
          aria-label="Six-digit code"
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(event) => update(event.target.value)}
          onPaste={(event) => {
            event.preventDefault()
            update(event.clipboardData.getData('text'))
          }}
          disabled={disabled}
          className="absolute inset-0 h-full w-full cursor-text opacity-0 focus:outline-none"
        />
      </div>
      <PortalAuthFieldSeam />
    </div>
  )
}

export interface PortalLoginProps {
  state: PortalLoginState
  email: string
  onEmailChange: (email: string) => void
  onSendCode: () => void
  onVerifyCode?: (code: string) => void
  code?: string
  onCodeChange?: (code: string) => void
  resendInSeconds?: number
  onResendCode?: () => void
  error?: string | null
  oauthActions?: PortalOAuthAction[]
  password?: string
  onPasswordChange?: (password: string) => void
  onPasswordSignIn?: () => void
  onForgotPassword?: () => void
  /** Controls the password disclosure independently; defaults to state === 'password'. */
  passwordExpanded?: boolean
  onPasswordExpandedChange?: (expanded: boolean) => void
  onChangeMethod?: () => void
  onContinue?: () => void
  /** Required redirect fallback rendered as a real link in the success state. */
  destinationHref: string
  isSubmitting?: boolean
}

/**
 * Controlled portal login form. Authentication, timers, and navigation stay in
 * portal adapters — and so does the QR, which now lives in the brand pane's
 * ambient badge rather than behind a disclosure on this side.
 */
export function PortalLogin({
  state,
  email,
  onEmailChange,
  onSendCode,
  onVerifyCode,
  code = '',
  onCodeChange,
  resendInSeconds = 0,
  onResendCode,
  error,
  oauthActions = [],
  password = '',
  onPasswordChange,
  onPasswordSignIn,
  onForgotPassword,
  passwordExpanded,
  onPasswordExpandedChange,
  onChangeMethod,
  onContinue,
  destinationHref,
  isSubmitting = false,
}: PortalLoginProps) {
  const codeSubmissionInFlight = React.useRef(false)
  const interactionLocked = isSubmitting || state === 'apple-pending'
  const passwordOpen = passwordExpanded ?? state === 'password'
  const visibleOAuthActions = oauthActions.filter((action) =>
    action.id === 'apple' ? action.available !== false : action.available === true
  )
  const errorTarget = state === 'code' ? 'code' : passwordOpen ? 'password' : 'email'
  const errorId = `portal-auth-${errorTarget}-error`
  const friendlyError = error && <PortalAuthNotice id={errorId} tone="error" title="Let’s try that again." className={cn('mb-[6px]', RISE.notice)}>{error}</PortalAuthNotice>

  React.useEffect(() => {
    if (!interactionLocked) codeSubmissionInFlight.current = false
  }, [error, interactionLocked])

  const submitCode = (nextCode: string) => {
    if (
      nextCode.length !== 6 ||
      interactionLocked ||
      codeSubmissionInFlight.current ||
      !onVerifyCode
    ) return
    codeSubmissionInFlight.current = true
    onVerifyCode(nextCode)
  }

  if (state === 'success') return <PortalAuthSuccess destinationHref={destinationHref} onContinue={onContinue} />

  return (
    <div className="space-y-[20px]">
      {state === 'apple-pending' && <PortalAuthNotice tone="info" title="Opening Apple sign in" className={RISE.notice}>Finish securely in the Apple window, then return here.</PortalAuthNotice>}
      {friendlyError}
      {state === 'code' ? (
        <form className="space-y-[20px]" onSubmit={(event) => { event.preventDefault(); submitCode(code) }}>
          <div className={cn('grid gap-[8px]', RISE.head)}>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#65594E]">Email passcode</p>
            <h2 className="font-heading text-[30px] font-medium leading-[1.1] tracking-[-0.03em] text-[#2C2926] [text-wrap:balance]">Check your inbox.</h2>
            <p className="text-[14px] leading-[1.6] text-[#65594E]">We sent a six-digit code to <strong className="font-semibold text-[#2C2926]">{email}</strong>.</p>
          </div>
          <OtpInput value={code} onChange={onCodeChange ?? (() => undefined)} onComplete={submitCode} disabled={interactionLocked} error={Boolean(error)} errorId={errorId} />
          <div className={cn('flex items-center justify-between gap-[16px] text-[14px]', RISE.action)}>
            <button type="button" onClick={onChangeMethod} disabled={interactionLocked} className="min-h-[44px] text-[#2C2926] underline decoration-[#8B7355] underline-offset-4 disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C]">Use a different email</button>
            {/* A countdown is not a link until it can be pressed — it reads as the quiet fact it is. */}
            <button type="button" disabled={resendInSeconds > 0 || interactionLocked} onClick={onResendCode} className={cn('min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C]', resendInSeconds > 0 ? 'cursor-default text-[#65594E]' : 'font-semibold text-[#2C2926] underline decoration-[#8B7355] underline-offset-4 disabled:cursor-not-allowed disabled:opacity-55')}>{resendInSeconds > 0 ? `Resend in ${resendInSeconds}s` : 'Resend code'}</button>
          </div>
        </form>
      ) : (
        <form className="space-y-[20px]" onSubmit={(event) => { event.preventDefault(); onSendCode() }}>
          <div className={cn('grid gap-[8px]', RISE.head)}>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#65594E]">Sign in</p>
            <h2 className="font-heading text-[30px] font-medium leading-[1.1] tracking-[-0.03em] text-[#2C2926] [text-wrap:balance]">Start with your email.</h2>
            <PortalAuthRule className="mt-[6px]" />
          </div>
          <div className={cn('group relative grid gap-[8px]', RISE.field)}>
            <label className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.15em] text-[#65594E]" htmlFor="portal-auth-email">Email address</label>
            <input id="portal-auth-email" type="email" autoComplete="email" value={email} onChange={(event) => onEmailChange(event.target.value)} aria-invalid={errorTarget === 'email' && Boolean(error) || undefined} aria-describedby={errorTarget === 'email' && error ? errorId : undefined} className="h-[48px] w-full border border-[#8B7355] bg-white px-[12px] text-[16px] text-[#2C2926] outline-none transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] placeholder:text-[#7A6A5B] focus-visible:border-[#5C4A3C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5C4A3C] motion-reduce:transition-none" placeholder="you@studio.com" disabled={interactionLocked} />
            <PortalAuthFieldSeam />
          </div>
          {/* The entrance rides a wrapper, never the button: an animation that
              settles opacity to 1 would outrank the button's own disabled dim. */}
          <div className={RISE.action}>
            <button type="submit" disabled={!email || interactionLocked} className="h-[48px] w-full bg-[#1A1816] px-[16px] text-[14px] font-semibold text-[#FAF7F2] transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-[#2C2926] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none">{interactionLocked ? 'Sending code…' : 'Email me a one-time code'}</button>
          </div>
        </form>
      )}

      {state !== 'code' && <div className={cn('space-y-[20px]', RISE.alt)}>
        <PortalAuthRule />
        {visibleOAuthActions.map((action) => {
          const pending = action.pending || (action.id === 'apple' && state === 'apple-pending')
          return <button key={action.id} type="button" onClick={action.onSelect} disabled={pending || interactionLocked} aria-busy={pending || undefined} className="flex min-h-[48px] w-full items-center justify-center gap-[9px] border border-[#8B7355] bg-white px-[16px] text-[14px] font-semibold text-[#2C2926] transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:border-[#2C2926] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] motion-reduce:transition-none">{action.id === 'apple' && <Apple aria-hidden="true" className="h-[16px] w-[16px]" strokeWidth={1.75} />}{pending ? `Connecting to ${action.label.replace(/^Continue with /, '')}…` : action.label}</button>
        })}
        <div>
          <PortalAuthRule />
          <button type="button" aria-expanded={passwordOpen} aria-controls="portal-auth-password-panel" onClick={() => onPasswordExpandedChange?.(!passwordOpen)} disabled={interactionLocked} className="flex min-h-[44px] w-full items-center justify-between gap-[12px] py-[12px] text-left text-[14px] font-semibold text-[#2C2926] transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none"><span>Use email and password instead</span><span aria-hidden="true" className="font-mono text-[15px] text-[#65594E]">{passwordOpen ? '−' : '+'}</span></button>
          {passwordOpen && <form id="portal-auth-password-panel" className="grid gap-[12px] pb-[4px] pt-[4px]" onSubmit={(event) => { event.preventDefault(); if (!interactionLocked) onPasswordSignIn?.() }}><div className="grid gap-[8px]"><label className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.15em] text-[#65594E]" htmlFor="portal-auth-password">Password</label><input id="portal-auth-password" type="password" autoComplete="current-password" value={password} onChange={(event) => onPasswordChange?.(event.target.value)} disabled={interactionLocked} aria-invalid={errorTarget === 'password' && Boolean(error) || undefined} aria-describedby={errorTarget === 'password' && error ? errorId : undefined} className="h-[48px] w-full border border-[#8B7355] bg-white px-[12px] text-[16px] text-[#2C2926] outline-none transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:border-[#5C4A3C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5C4A3C] motion-reduce:transition-none" /></div><div className="flex items-center justify-between gap-[12px]"><button type="button" onClick={onForgotPassword} disabled={interactionLocked} className="min-h-[44px] text-[14px] text-[#2C2926] underline decoration-[#8B7355] underline-offset-4 disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C]">Forgot password?</button><button type="submit" disabled={!email || !password || interactionLocked} className="min-h-[44px] border border-[#8B7355] px-[16px] py-[9px] text-[14px] font-semibold text-[#2C2926] transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:border-[#2C2926] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none">Sign in</button></div></form>}
        </div>
      </div>}
    </div>
  )
}

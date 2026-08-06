import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The encoder is spied through, not replaced: the pure-function assertions below
 * still exercise the real qrcode-generator, while the call count proves the
 * component memoizes the matrix on `url` instead of re-encoding every tick.
 */
vi.mock('./qr-matrix', async () => {
  const actual = await vi.importActual<typeof import('./qr-matrix')>('./qr-matrix')
  return { ...actual, buildQrMatrix: vi.fn(actual.buildQrMatrix) }
})

import { PortalAuthAmbientQr, formatQrCountdown } from './PortalAuthAmbientQr'
import { buildQrMatrix, PINNED_QR_MODULE_COUNT } from './qr-matrix'

/** A fixed 64-hex session payload — the matrix below is the same every run. */
const FIXED_URL = 'patina://auth?session=0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0'
const OTHER_URL = 'patina://auth?session=a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

const baseProps = {
  url: FIXED_URL,
  secondsRemaining: 300,
  totalSeconds: 300,
  phase: 'live' as const,
}

const encoder = vi.mocked(buildQrMatrix)

beforeEach(() => {
  encoder.mockClear()
})

describe('buildQrMatrix', () => {
  it('encodes the pinned 53×53 symbol and is deterministic', () => {
    const first = buildQrMatrix(FIXED_URL)
    const second = buildQrMatrix(FIXED_URL)
    expect(first.size).toBe(PINNED_QR_MODULE_COUNT)
    expect(first.size).toBe(53)
    expect(first.pinned).toBe(true)
    expect(first.rows).toHaveLength(53)
    expect(first.rows.every((row) => row.length === 53)).toBe(true)
    expect(second.rows).toEqual(first.rows)
    // Finder patterns: every corner block opens with a dark module.
    expect(first.rows[0][0]).toBe(true)
    expect(first.rows[0][52]).toBe(true)
    expect(first.rows[52][0]).toBe(true)
  })
})

describe('PortalAuthAmbientQr', () => {
  it('encodes once per url across re-renders', () => {
    const { rerender } = render(<PortalAuthAmbientQr {...baseProps} />)
    expect(encoder).toHaveBeenCalledTimes(1)
    rerender(<PortalAuthAmbientQr {...baseProps} secondsRemaining={299} />)
    rerender(<PortalAuthAmbientQr {...baseProps} secondsRemaining={298} />)
    expect(encoder).toHaveBeenCalledTimes(1)
    rerender(<PortalAuthAmbientQr {...baseProps} url={OTHER_URL} />)
    expect(encoder).toHaveBeenCalledTimes(2)
  })

  it('redraws the three corners as gold finder marks with solid cores', () => {
    render(<PortalAuthAmbientQr {...baseProps} />)
    const finders = screen.getAllByTestId('portal-auth-qr-finder')
    expect(finders).toHaveLength(3)
    const [outer, core] = Array.from(finders[0].querySelectorAll('rect'))
    expect(outer).toHaveAttribute('stroke', '#C4A265')
    expect(outer).toHaveAttribute('fill', 'none')
    // The 3×3 core is filled gold edge to edge. A dot punched through its
    // middle would break the 1:1:3:1:1 run lengths a detector measures along
    // the finder's centre scanlines, so nothing may be drawn inside it.
    expect(core).toHaveAttribute('fill', '#C4A265')
    expect(finders[0].querySelector('circle')).toBeNull()

    // A four-module quiet zone means every finder module would land below x=11;
    // no pearl dot — the centre included — may sit inside a finder block.
    const dots = Array.from(screen.getByTestId('portal-auth-qr-matrix').querySelectorAll('circle'))
    const inTopLeftFinder = dots.filter((dot) => {
      const cx = Number(dot.getAttribute('cx'))
      const cy = Number(dot.getAttribute('cy'))
      return dot.getAttribute('fill') === '#E5E2DD' && cx > 4 && cx < 11 && cy > 4 && cy < 11
    })
    expect(inTopLeftFinder).toHaveLength(0)
  })

  it('draws a placeholder — never a code of the empty string — with no url', () => {
    render(<PortalAuthAmbientQr {...baseProps} url={null} phase="refreshing" />)
    expect(encoder).not.toHaveBeenCalled()

    const matrix = screen.getByTestId('portal-auth-qr-matrix')
    const modules = Array.from(matrix.querySelectorAll('circle')).filter(
      (dot) => dot.getAttribute('fill') === '#E5E2DD'
    )
    expect(modules).toHaveLength(0)
    // The plate keeps its furniture: three corner marks and the monogram disc.
    expect(screen.getAllByTestId('portal-auth-qr-finder')).toHaveLength(3)
    expect(matrix.querySelector('text')?.textContent).toBe('P')
    expect(screen.queryByText(/Refreshes in/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Making a fresh sign-in QR code.' })
    ).toBeInTheDocument()
  })

  it('keeps a placeholder tappable when the phase is spent', () => {
    const onWake = vi.fn()
    render(<PortalAuthAmbientQr {...baseProps} url={null} phase="error" onWake={onWake} />)
    expect(encoder).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: /QR is unavailable\. Tap to try again\./ })
    ).toBeInTheDocument()
    expect(screen.queryByText(/Refreshes in/)).not.toBeInTheDocument()
  })

  it('suppresses the countdown for a live badge that has no code yet', () => {
    render(<PortalAuthAmbientQr {...baseProps} url={null} />)
    expect(screen.queryByText(/Refreshes in/)).not.toBeInTheDocument()
  })

  it('depletes the countdown ring from full to empty', () => {
    const { rerender } = render(<PortalAuthAmbientQr {...baseProps} secondsRemaining={300} totalSeconds={300} />)
    const ring = () => screen.getByTestId('portal-auth-qr-ring')
    expect(ring()).toHaveAttribute('pathLength', '100')
    expect(ring()).toHaveAttribute('stroke-dashoffset', '0')
    rerender(<PortalAuthAmbientQr {...baseProps} secondsRemaining={150} totalSeconds={300} />)
    expect(ring()).toHaveAttribute('stroke-dashoffset', '50')
    rerender(<PortalAuthAmbientQr {...baseProps} secondsRemaining={0} totalSeconds={300} />)
    expect(ring()).toHaveAttribute('stroke-dashoffset', '100')
    expect(ring()).toHaveAttribute('transform', 'rotate(-90 50 50)')
  })

  it('formats the countdown as m:ss', () => {
    expect(formatQrCountdown(272)).toBe('4:32')
    expect(formatQrCountdown(60)).toBe('1:00')
    expect(formatQrCountdown(9)).toBe('0:09')
    expect(formatQrCountdown(-5)).toBe('0:00')
    render(<PortalAuthAmbientQr {...baseProps} secondsRemaining={272} totalSeconds={300} />)
    expect(screen.getByText('Refreshes in 4:32')).toBeInTheDocument()
    expect(screen.getByText('Scan with your signed-in phone')).toBeInTheDocument()
  })

  it('replaces the caption with a status message and drops the countdown', () => {
    render(<PortalAuthAmbientQr {...baseProps} statusMessage="Approved — signing you in…" />)
    expect(screen.getByText('Approved — signing you in…')).toBeInTheDocument()
    expect(screen.queryByText(/Refreshes in/)).not.toBeInTheDocument()
  })

  it('keeps the tap affordance under a status message on a spent badge', () => {
    render(
      <PortalAuthAmbientQr
        {...baseProps}
        phase="resting"
        secondsRemaining={0}
        statusMessage="That request was declined."
        onWake={vi.fn()}
      />
    )
    // The status message never costs the person the way back: both lines show.
    expect(screen.getByText('That request was declined.')).toBeInTheDocument()
    expect(screen.getByText('Tap for a fresh code')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /That request was declined\..*Tap for a fresh code/ })
    ).toBeInTheDocument()
    expect(screen.queryByText(/Refreshes in/)).not.toBeInTheDocument()
  })

  it('stops being a button when there is no wake to offer', () => {
    render(<PortalAuthAmbientQr {...baseProps} phase="error" secondsRemaining={0} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByTestId('portal-auth-qr').tagName).toBe('DIV')
    expect(screen.getByText('QR is resting. It will retry in a moment.')).toBeInTheDocument()
    expect(screen.queryByText('QR is unavailable. Tap to try again.')).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'The sign-in QR code is unavailable.' })
    ).toBeInTheDocument()
  })

  it('shows a status message alone when a spent badge cannot be tapped', () => {
    render(
      <PortalAuthAmbientQr
        {...baseProps}
        phase="resting"
        secondsRemaining={0}
        statusMessage="That request was declined."
      />
    )
    expect(screen.getByText('That request was declined.')).toBeInTheDocument()
    expect(screen.queryByText('Tap for a fresh code')).not.toBeInTheDocument()
  })

  it('becomes a real button once the code is spent, and wakes exactly once per press', async () => {
    const user = userEvent.setup()
    const onWake = vi.fn()
    const { rerender } = render(<PortalAuthAmbientQr {...baseProps} phase="resting" secondsRemaining={0} onWake={onWake} />)
    const rested = screen.getByRole('button', { name: /Tap for a fresh code/ })
    expect(rested).toBe(screen.getByTestId('portal-auth-qr'))
    expect(screen.getByTestId('portal-auth-qr-ring')).toHaveAttribute('stroke-dashoffset', '100')
    await user.click(rested)
    expect(onWake).toHaveBeenCalledTimes(1)

    rerender(<PortalAuthAmbientQr {...baseProps} phase="error" secondsRemaining={120} onWake={onWake} />)
    expect(screen.getByRole('button', { name: /QR is unavailable\. Tap to try again\./ })).toBeInTheDocument()
    // A failed badge shows an empty ring no matter what the clock still says.
    expect(screen.getByTestId('portal-auth-qr-ring')).toHaveAttribute('stroke-dashoffset', '100')
  })

  it('labels the live badge and hides its drawings from assistive tech', () => {
    render(<PortalAuthAmbientQr {...baseProps} />)
    expect(screen.getByTestId('portal-auth-qr').tagName).toBe('DIV')
    expect(screen.getByRole('img', { name: 'Sign-in QR code. Scan it with your signed-in phone.' })).toBeInTheDocument()
    const svgs = Array.from(screen.getByTestId('portal-auth-qr').querySelectorAll('svg'))
    expect(svgs).toHaveLength(2)
    expect(svgs.every((svg) => svg.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

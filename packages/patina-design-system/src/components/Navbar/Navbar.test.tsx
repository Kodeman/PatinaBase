import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Navbar, NavbarContent, NavbarActions, NavbarLink } from './Navbar'

describe('Navbar', () => {
  it('renders correctly', () => {
    render(
      <Navbar logo={<div>Logo</div>}>
        <NavbarContent>
          <NavbarLink href="/home">Home</NavbarLink>
        </NavbarContent>
      </Navbar>
    )

    expect(screen.getByText('Logo')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('renders with sticky variant', () => {
    const { container } = render(<Navbar sticky />)
    const nav = container.querySelector('nav')
    expect(nav).toHaveClass('sticky')
  })

  it('renders NavbarLink with active state', () => {
    render(<NavbarLink href="/home" active>Home</NavbarLink>)
    const link = screen.getByText('Home')
    expect(link).toHaveClass('text-foreground')
  })

  it('renders NavbarActions', () => {
    render(
      <Navbar>
        <NavbarActions>
          <button>Sign In</button>
        </NavbarActions>
      </Navbar>
    )

    expect(screen.getByText('Sign In')).toBeInTheDocument()
  })
})

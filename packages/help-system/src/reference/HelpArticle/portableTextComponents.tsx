/**
 * portableTextComponents — minimal renderer map for `<HelpArticle />`.
 *
 * Keeps the surface intentionally small (spec §4.9): block headings, paragraphs,
 * lists, marks (strong / em / link), and Sanity inline images. Heavy styling
 * iteration is deferred until post-pilot — the goal here is a usable,
 * accessible default that respects the design system's typography classes.
 *
 * Each renderer returns a JSX node; @portabletext/react walks the portable-text
 * tree and invokes the right one. Unknown nodes fall through to the library's
 * defaults so authors don't see broken renders when a new block type ships.
 */

import * as React from 'react'
import type { PortableTextComponents } from '@portabletext/react'

// ─── Sanity image block shape ─────────────────────────────────────────────────
// Authors can drop an image into the body via the `image` schema field. The
// portable-text value holds the asset reference + (optional) alt text. The
// renderer below dereferences the asset on demand — production callers can
// override this slot to wire in `@sanity/image-url` for thumbnail generation.

interface SanityImageValue {
  _type: 'image'
  asset?: {
    _ref?: string
    url?: string
  } & Record<string, unknown>
  alt?: string
  caption?: string
}

interface SanityLinkMark {
  _type?: 'link'
  href?: string
  /**
   * When true (or omitted on external URLs), the renderer adds
   * target=_blank + rel=noopener for safety.
   */
  blank?: boolean
}

const isExternalHref = (href: string): boolean => /^https?:\/\//i.test(href)

export const portableTextComponents: PortableTextComponents = {
  // ─── Block-level (paragraphs, headings) ──────────────────────────────────
  block: {
    h2: ({ children }) => (
      <h2 className="mt-6 mb-2 text-xl font-semibold leading-snug text-foreground">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-5 mb-2 text-lg font-semibold leading-snug text-foreground">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="mt-4 mb-1.5 text-base font-semibold leading-snug text-foreground">
        {children}
      </h4>
    ),
    normal: ({ children }) => (
      <p className="my-3 text-sm leading-relaxed text-foreground/90">{children}</p>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-2 border-border pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
  },

  // ─── Lists ────────────────────────────────────────────────────────────────
  list: {
    bullet: ({ children }) => (
      <ul className="my-3 list-disc space-y-1 pl-6 text-sm leading-relaxed text-foreground/90">
        {children}
      </ul>
    ),
    number: ({ children }) => (
      <ol className="my-3 list-decimal space-y-1 pl-6 text-sm leading-relaxed text-foreground/90">
        {children}
      </ol>
    ),
  },

  listItem: {
    bullet: ({ children }) => <li>{children}</li>,
    number: ({ children }) => <li>{children}</li>,
  },

  // ─── Inline marks (bold, italic, link) ───────────────────────────────────
  marks: {
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    code: ({ children }) => (
      <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    ),
    link: ({ value, children }) => {
      const mark = (value ?? {}) as SanityLinkMark
      const href = typeof mark.href === 'string' ? mark.href : '#'
      const opensExternally = mark.blank === true || (mark.blank !== false && isExternalHref(href))
      return (
        <a
          href={href}
          target={opensExternally ? '_blank' : undefined}
          rel={opensExternally ? 'noopener noreferrer' : undefined}
          className="text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </a>
      )
    },
  },

  // ─── Custom types (Sanity image blocks) ───────────────────────────────────
  types: {
    image: ({ value }) => {
      const img = (value ?? {}) as SanityImageValue
      const src = img.asset?.url
      if (typeof src !== 'string' || src.length === 0) {
        // No URL resolved — common in tests / when image-url helper isn't
        // wired up. Render a tiny accessible placeholder rather than crashing.
        return (
          <figure
            className="my-4 rounded-sm border border-dashed border-border p-4 text-xs italic text-muted-foreground"
            role="img"
            aria-label={img.alt ?? 'Image (no source resolved)'}
          >
            {img.caption ?? 'Image'}
          </figure>
        )
      }
      return (
        <figure className="my-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- shared package, can't assume next/image */}
          <img
            src={src}
            alt={img.alt ?? ''}
            className="w-full rounded-sm border border-border"
            loading="lazy"
          />
          {img.caption ? (
            <figcaption className="mt-2 text-xs italic text-muted-foreground">
              {img.caption}
            </figcaption>
          ) : null}
        </figure>
      )
    },
  },
}

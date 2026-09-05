# Studio invoices — 2026-09-05

What it would take for a studio to draw an invoice with no house: a
consultation, a site visit, a retainer, a reimbursable — billed to a
household directly, not through a project. Asked for by Middle West
Studio (Leah). Research and design only. No repo code was changed.

## Files

- **`proposal.html`** — the deliverable. One self-contained page for Kody
  and Leah: the vision test, a ten-row map of every place an invoice
  assumes a project, the design in one paragraph ("the same invoice, no
  house"), seven working HTML mock panels in the Document's own idiom
  (composer, ledger, folio, receivables, the client letterbox, the email,
  the failure band), the migration and rail, three build waves, an
  eight-row risk register, and twelve rulings each with a recommendation.
  Opens in a browser; needs no server; loads only Google Fonts.
- **`discovery/01-data-model-and-rail.md`** — the `invoices` table, RLS,
  every RPC that creates or mutates an invoice, the five edge functions,
  earnings, the client roster and "the studio", cited to file and line.
- **`discovery/02-designer-portal-invoices.md`** — how invoices are drawn,
  read and sent in the designer portal today: the composer, folio, the
  Accounts book, the registry, flags, analytics, tests.
- **`discovery/03-client-pay-path-and-rulings.md`** — how a homeowner pays
  end to end, the houseless-order precedent, every prior ruling on
  invoices and studio money quoted verbatim, "Middle West" on disk, the
  surcharge, the proposal → project → invoice pipeline.
- **`discovery/04-blast-radius.md`** — what breaks when `project_id` goes
  nullable: SQL objects, edge functions, hooks, both portals, iOS, tests;
  the two blockers the first design missed; a wave-ordered change list.

## How it was produced

Three discovery surveys read the source directly and cited every claim to
a file and line. A fourth agent stress-tested the proposed design against
the code and found two load-bearing corrections (the studio trigger, not
the schema, is the real gate; the issue RPC the plan meant to patch is not
on the browser path). The orchestrator folded those into the plan at
`~/.claude/plans/middle-west-studio-would-snazzy-whisper.md` and wrote the
page from the plan and the four reports. Client-facing copy in the
mockups is written against `docs/vision/VISION.md` and the
`patina-brand-voice` skill. Claims the code could not settle are listed in
the appendix rather than smoothed over.

Prepared 5 September 2026.

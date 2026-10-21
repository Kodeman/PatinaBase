# Room Proof, in practice

A deeper HTML design presentation for Patina’s founding team, extending the approved Room Proof direction into representative workflows from the current designer portal.

Open **index.html** for the presentation or **mockup.html** for the interactive example. All assets and fonts are included. A local static server provides the most consistent browser storage and embedded-preview behavior:

```sh
python3 -m http.server 4176 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:4176/`.

## What is included

- 13 connected views: Studio overview, Room & brief, Services agreement, Resource library, Piece proof, Client approvals, Project flow, Financials & accounts, Purchase orders, Spec book, Studio contacts, Timesheets and Studio inbox.
- Three guided journeys: sourcing → decision; financials → orders → arrival; recorded time → invoice → receipt.
- A searchable map of 25 current capability groups, with source references and explicit interactive-versus-mapped scope.
- Local founder review notes, with a Markdown download.
- Shared sample state: selections and quantities affect totals and specifications; approval history tracks editions; service time follows its invoice; contact drafts appear in the inbox.

Use **Reset example** in the prototype to restore the shared starting state. Review notes use a separate browser key and are not cleared by that action. Saved sample state synchronizes between open previews and tabs. Use one active editing view at a time; unsaved form text is not synchronized.

## Review boundaries

This is a static design prototype, not an application release. Every person, maker, product, amount and conversation is fictional. Nothing calls Supabase, sends correspondence, charges a card, releases an order or changes the actual designer portal. The mockup displays an owner’s view where relevant; it does not implement production permissions.

Source audit baseline: `98c6baa69`, 21 October 2026. Source presence is not evidence of production rollout, live feature-flag values or runtime behavior. See [SOURCE-MAP.md](SOURCE-MAP.md), the three module evidence files, and [VERIFICATION.md](VERIFICATION.md).

Generated room and chair imagery carry forward the approved Room Proof concept. Other pieces use labelled outline studies. Finish shading is illustrative; it is not a color-accurate product rendering. Fonts are locally bundled; licenses are in `assets/FONT-LICENSES.txt`.

## Files

- `index.html`, `presentation.css`, `presentation.js`, `mapping.js`: founding team presentation.
- `mockup.html`, `app.js`, `base.css`, `boot.js`: shared prototype shell and state.
- `core-views.js`, `sourcing-views.js`, `studio-views.js` and their CSS: the working views.
- `*-evidence.md`: detailed current-source references and scope boundaries.
- `assets/`: imagery and fonts; no runtime CDN required.

The presentation’s source links point to the repository on GitHub and require repository access. Everything else works locally. No analytics or external fonts are loaded.

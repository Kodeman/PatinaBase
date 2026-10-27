Review only: I didn't modify or run anything. I found one real bug and one place where the F2 fix wasn't fully carried through. Neither is in the parts you just fixed, but both are inside the commerce.js lines you asked me to read. The rest are minor.

**1. A client reply is saved as an empty string.** High severity, high confidence.
At commerce.js:80, `input.value=''` runs before `Notes.addClientResponse(id,input.value.trim())`, so the reply text is always `''`. The reply is lost and an empty reply gets saved and logged. Fix: read the trimmed value into a variable first, then clear the input.

**2. The F2 fix isn't applied everywhere in Commerce.** Medium severity, high confidence on the code; the effect depends on the browser.
- `review-line` (line 78) still calls `rememberOrigin()` without the button. On Safari/macOS, clicking a button doesn't focus it, so the origin becomes `#pieces`/"room" when it should be the line's row or note.
- `openPurchasing` (line 68) still decides `fromNote` from `document.activeElement`. When it's opened from a note in Safari, no origin is saved, so Return goes to the wrong place.
- Fix: pass `b` into both, the way line 79 already does.

**3. The Return button can point at the section you're already in.** Low severity, medium confidence.
`returnButton()` (design.js:59) only checks whether there are saved visits, not which section they came from. For example: go from drawings to site, which saves a "room design" visit. Then use the design view buttons. The design header now shows "Return to room design ↑" inside room design. The same happens with "Return to site work" in the site header after any `renderSite()` call that follows a site-to-design jump. It works, but the label is confusing. Fix: hide the button when the last visit's section is the one being drawn.

**4. Only one revision request is remembered.** Low severity, high confidence.
`revisionRequest` holds a single observation ID (design.js:113). If two observations are reviewed with "Request a drawing revision" before D is filed:
- the callout only names the later one;
- after D, the earlier task shows "Further revision requested. Revisions beyond D…" even though it was requested before D.

The F7 boundary is correct for one request at a time.

**5. Saved-state guard gap.** Nit, low confidence that it matters.
At design.js:118, `typeof data().shared!=='object'` doesn't catch a saved `shared: null`. `typeof null` is `'object'`, so the share toggle would throw. This only matters if an older saved state ever stored `null`.

**No issues found in:**
- **F1:** commerce now looks for `[data-line]` only inside `#sheet-body`, and design uses `data-design-line`.
- **F3:** the route wrapper clears visits and calls `oldRoute` first; `show`/`showSite`/`returnVisit` clear commerce origins.
- **F4:** the client toggle is per sheet.
- **F5:** keeping the current print in the client folio as the sheet revises matches the copy and the source map. Only drafts freeze.
- **F6:** detail keys are restored. Focus restore using `[data-design=…]` isn't unique, but in practice every action that re-renders in place focuses its own target explicitly.
- **SVG and SOURCE-MAP:** the shared generic elevation, with depth shown only in captions and records, is described accurately and consistently.

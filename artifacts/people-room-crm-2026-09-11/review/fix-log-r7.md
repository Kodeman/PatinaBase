
---

## Round 7 — R-Y and R-Z (orchestrator rulings, 2026-09-11)

Scope: SPEC §5.1 #17 rewritten; R-Y and R-Z appended to `rulings.md` §3; C35 and C36 appended to `synthesis/direction.md` §3.9; `people-room-390.html` takes R-Z and R-Y; `people-room-1440.html` takes R-Y only.

### What changed

| File | Change |
|---|---|
| `specimens/SPEC.md` | §5.1 #17 rewritten per R-Y: the band is the sentence "These two cards share a phone." followed by the two names, Adaeze Okonkwo and Chidi Okonkwo, each a live open-person control; no "Compare & merge" act, no "Compare them?" question; both widths |
| `rulings.md` §3 | R-Y, R-Z appended after R-X |
| `synthesis/direction.md` §3.9 | C35 (duplicate band with a dead act → R-Y) and C36 (state ids collide with hash tokens → R-Z) appended after C34 |
| `specimens/people-room-1440.html` | Duplicate band only. `<p>These two cards share a phone.</p>` + a second `<p>` carrying `personLink(P['F-04'])` · `personLink(P['F-05'])` (the existing `button.link.link-act[data-person]` control, already served by the `[data-person]` delegation). The `act--secondary` "Compare & merge" button is gone; it had no handler to remove |
| `specimens/people-room-390.html` | R-Z: the seven `<section class="state" id="state-*">` become `id="face-*"`; a `FACES` hash-to-id map plus `faceOf(state)` added beside `STATES`; three `getElementById` call sites follow — `paint()`, `narrowRoster()`'s `state-roster` sheet handle, and `show()`'s per-state `hidden` loop. No `aria-controls` or `href` referenced the old ids. R-Y: `FACE.dupe` drops "Compare them?"; the act is replaced by two `button.linkline[data-open-person]` names (F-04, F-05), already served by the `[data-open-person]` delegation |

### R-Z verification

```
$ grep -c 'id="state-' specimens/people-room-390.html
0
```
Live DOM, all seven faces painted, both files (Playwright):

| File | ids | duplicate ids | ids equal to a `state-*` hash token | dangling `aria-controls` | `a[href^="#"]` | `<a>` inside `<button>` | `<h1>` | `role="status"` |
|---|---|---|---|---|---|---|---|---|
| 1440 | 78 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| 390 | 73 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |

The only JS-built ids in the 390 file are prefixed (`seats-`, `unfold-`, `pick-`, `f-`), so none can collide with a token.

### Tab order — first three accessible names, fresh load at each hash

Each state loaded in its own browser context (a same-document hash change does not reset the sequential focus starting point, so a shared page gives a false reading).

| File | State | 1st | 2nd | 3rd |
|---|---|---|---|---|
| 1440 | state-directory | Directory | Person card | Company card |
| 1440 | state-person | Directory | Person card | Company card |
| 1440 | state-company | Directory | Person card | Company card |
| 1440 | state-roster | Directory | Person card | Company card |
| 1440 | state-pick | Directory | Person card | Company card |
| 1440 | state-add | Directory | Person card | Company card |
| 1440 | state-access | Directory | Person card | Company card |
| 390 | state-directory | Directory | Person card | Company card |
| 390 | state-person | Directory | Person card | Company card |
| 390 | state-company | Directory | Person card | Company card |
| 390 | state-roster | Directory | Person card | Company card |
| 390 | state-pick | Directory | Person card | Company card |
| 390 | state-add | Directory | Person card | Company card |
| 390 | state-access | Directory | Person card | Company card |

14 of 14: the first Tab lands on the state bar's "Directory" button, and the visible face is the one the hash names (`visibleFace` matched `face-<state>` in every run). Zero page errors in every run.

### State bar — click a button, then Tab

| File | Clicked | Hash after | Focus after click | Next Tab | Expected |
|---|---|---|---|---|---|
| 1440 | Directory | #state-directory | Directory | Person card | Person card ✓ |
| 1440 | Person card | #state-person | Person card | Company card | Company card ✓ |
| 1440 | Company card | #state-company | Company card | Project roster | Project roster ✓ |
| 1440 | Project roster | #state-roster | Project roster | Bring forward | Bring forward ✓ |
| 1440 | Bring forward | #state-pick | Bring forward | Add sheet | Add sheet ✓ |
| 1440 | Add sheet | #state-add | Add sheet | Site access | Site access ✓ |
| 1440 | Site access | #state-access | Site access | `a` "(612) 555-0109" | end of bar — first control on the face ✓ |
| 390 | Directory | #state-directory | Directory | Person card | Person card ✓ |
| 390 | Person card | #state-person | Person card | Company card | Company card ✓ |
| 390 | Company card | #state-company | Company card | Project roster | Project roster ✓ |
| 390 | Project roster | #state-roster | Project roster | Bring forward | Bring forward ✓ |
| 390 | Bring forward | #state-pick | Bring forward | Add sheet | Add sheet ✓ |
| 390 | Add sheet | #state-add | Add sheet | Site access | Site access ✓ |
| 390 | Site access | #state-access | Site access | `a` "Luis Ochoa, superintendent, (612) 555-0109" | end of bar — first control on the face ✓ |

Focus stays on the clicked button through the re-render in both files; the next Tab is always the following bar button, and after the last one it is the first control on the face.

### Duplicate band — click each name

Band text, both widths: `These two cards share a phone. Adaeze Okonkwo · Chidi Okonkwo`

| File | Name clicked | Control | Hash after | `role="status"` | Card head |
|---|---|---|---|---|---|
| 1440 | Adaeze Okonkwo | `button.link.link-act` | #state-person | Person card | Adaeze Okonkwo |
| 1440 | Chidi Okonkwo | `button.link.link-act` | #state-person | Person card | Chidi Okonkwo |
| 390 | Adaeze Okonkwo | `button.linkline` | #state-person | Person card | Adaeze Okonkwo |
| 390 | Chidi Okonkwo | `button.linkline` | #state-person | Person card | Chidi Okonkwo |

Each name opens its own card. The status region announces the state name the specimen switcher uses for every state ("Person card"); the person is identified by the card's own head, not by the status line.

### Render

Both re-rendered after the edits.

```
people-room-1440-console.json: 9 captures, 9/9 "errors": [], 9/9 "warnings": [], horizontalOverflow true×0 / false×9
people-room-390-console.json:  9 captures, 9/9 "errors": [], 9/9 "warnings": [], horizontalOverflow true×0 / false×9
```

7 light plates per file plus 2 dark plates = 9 captures each; the fourteen §9 light plate names are all present.

### SPEC §10

| # | Check | 1440 | 390 |
|---|---|---|---|
| 1 | Last line exactly `<!-- specimen-complete -->` | PASS | PASS |
| 2 | `grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled'` = 0 | 0 PASS | 0 PASS |
| 3 | §5 acceptance strings on the face | 160 quoted strings pulled from §5; 145 found in the painted faces. The 15 not matched are attribute values (`group`, `true`, `status`, `tel:+16125550111`), the room head (outside the face sections), a template placeholder (`<Source> consent, <d Mon yyyy>, on the <project>.`), a state name (`Bring forward`), a forbidden-word reference (`Remove`), branch-conditional copy not on the open card (`No paper is held for this firm.`, the add sheet's second authority branch), and — the point of this round — `Compare & merge` and `Compare them?`, now absent by ruling | same, plus `Text only. No working email.` which at 390 sits in an `<input value>` rather than a `<textarea>`, so `textContent` cannot see it (pre-existing, not a face gap) |
| 4 | Every name, firm, phone in §3's JSON | PASS — the two band names are F-04 Adaeze Okonkwo and F-05 Chidi Okonkwo | PASS |
| 5 | Render clean, fourteen names, zero errors, zero warnings, no overflow | PASS | PASS |
| 6 | §2.1 token block and §2.2 class fragment byte for byte | PASS (2379 and 3479 bytes, both verbatim) | PASS (same two blocks verbatim) |

### Left standing, deliberately

- `people-room-390.html` still carries `.dupe .act { margin-top: 12px; }`. The rule is now dead (the band holds no `.act`), but removing it is outside R-Y's scope; flagging rather than editing.
- The fixture gives F-04 `(612) 555-0104` and F-05 `(612) 555-0105`, so "share a phone" is the band's claim, not a fact the §3 JSON encodes. R-Y did not ask for the fixture to change and it was not changed.

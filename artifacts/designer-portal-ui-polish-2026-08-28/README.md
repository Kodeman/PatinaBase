# Designer portal UI polish proposals

Open `presentation.html` directly in a browser. It is a single-file interactive presentation with keyboard navigation (`←`, `→`, Page Up/Down, Home, End).

The deck contains three grounded proposals:

1. Material Register — tactile stage/group depth.
2. Maker's Ledger — image and provenance for the FF&E piece in hand.
3. The Handled Desk — focus, disclosure, and pickup choreography.

The React source is retained for revisions. Build with:

```bash
pnpm install --ignore-workspace
pnpm build
```

The final bundle was produced with the `web-artifacts-builder` bundling script. It uses a structural reconstruction of the live Desk roster rather than a time-sensitive screenshot. The presentation has no runtime asset or font dependencies and works as a standalone file.

See `QA.md` for the final verification record.

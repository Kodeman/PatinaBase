# Patina — Common Ground, the paper editions

Founder design review, round two · October 20, 2026

Two closely related refinements of the selected Common Ground direction. Both preserve visual weight on the left and project flow on the right while using the current designer portal's typography and color system.

## Open the presentation

Open `index.html` in a browser. All images, fonts, styles, and scripts are included locally; keep the folder together. No build or dependency installation is required. The ZIP contains the complete folder.

The five sections explain the refinement, show the two source directions, present each edition, and compare them with a local feedback form. Use the top navigation, bottom arrows, or left/right arrow keys when focus is outside a control. Print includes all five sections. Download feedback to share it; nothing is sent automatically.

Choose **Explore Paper** or **Explore Bound** for the working mockup. Switch editions directly above the portal without changing the sample project's state. The Studio and Client preview controls demonstrate proposed roles. The finish sheet, private studio note, client choice, draft workshop brief, and project history are interactive.

## The two editions

**Paper** uses the portal's warm rail stock on the left, paper on the right, and charcoal serif type. It feels like an open magazine spread. A slightly offset decision sheet gives the work a physical presence without heavy card shadows.

**Bound** changes the left page to the portal's forest tone, with linen lettering, a quiet cloth texture, and a fine binding seam. The right page stays light. It feels closer to Common Ground's original comfort and provides the stronger left anchor.

Both use one shared HTML structure, stylesheet, and interaction model. Bound is a paint layer: typography sizes, spacing, photography, project content, and controls stay identical. The recommendation in the presentation is to begin with Bound and use Paper to calibrate how much visual weight the team wants.

## What comes from today's portal

- Playfair Display for project identity and authored voice; Inter for working copy; DM Mono for dates and document references.
- Paper `#FCFAF6`, off-white `#FAF7F2`, rail stock `#E8E3DB`, charcoal `#2C2926`, quiet ink `#65594E`, aged oak `#8B7355`, and forest `#3E5145`.
- Fine rules, generous editorial hierarchy, warm document surfaces, and restrained action color.

The new composition gives the room, materials, and designer's voice a stronger home on the left. A shared project record on the right connects direction, decisions, workshop handoff, and installation. It reflects Patina's designer–client–manufacturer relationship rather than a generic analytics dashboard.

Repository references used:

- `apps/designer-portal/src/app/globals.css`
- `artifacts/ui-contrast-calm-2026-10-20/qa-build/doc-top-1440.jpg` and `desk-top-1440.jpg`
- `artifacts/ui-contrast-calm-2026-10-20/reviews/direction.md`
- `artifacts/portal-directions-2026-10-20/common-ground.html`
- Patina's `docs/vision/VISION.md` and `marketing/canon/voice.md`

The “current portal” image is a repository QA capture of a local seed project. It is not a new production capture. Local web fonts come from `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Resources/Fonts`; copyright notices and the SIL Open Font License are in `assets/FONT-LICENSES.txt`.

## Sample behavior and scope

Lake Mendota House, Middle West Studio, Leah Hartwell, Nora Ellis, Northline Workshop, dates, and decisions are illustrative. This is a local design presentation, with no backend, authentication, messages, orders, or production releases.

A studio preference does not record a client choice. Private studio notes are hidden in Client preview and excluded from the workshop draft. A recorded client choice updates the draft, which still awaits studio review and release. Role previews are demonstrations, not an authentication boundary.

Sample state is stored in this browser under `patina-common-ground-refinement-v1`. Founder feedback is stored separately under `patina-common-ground-refinement-review-v1`. Both editions share the same sample state. Use **Reset sample** beneath the mockup to start again; it leaves founder feedback intact. Storage restrictions may limit persistence when opening a local file, in which case the mockup explains that changes last for the current page only.

## Photography

- `assets/room.jpg`: [Unsplash room reference](https://images.unsplash.com/photo-1600210492486-724fe5c67fb0), carried forward from the first Common Ground presentation.
- `assets/chair.jpg`: [Zoco Home — Oak Armchair](https://zocohome.com/products/oak-armchair-linen), an illustrative product-form reference for private founder review. It does not represent the fictional maker. Use approved Patina photography for a public implementation.
- `assets/current-portal.jpg` and `assets/common-ground-reference.jpg`: repository design references described above.
- `assets/paper-preview.jpg` and `assets/bound-preview.jpg`: browser captures of these new mockups at the same viewport and initial state.

## Files

- `index.html` — founder presentation and feedback form.
- `prototype.html` — shared working project mockup.
- `paper.css` — base design and responsive behavior.
- `bound.css` — Bound edition paint layer.
- `prototype.js` — local interaction state.
- `paper-notes.md`, `bound-notes.md` — design-agent rationale.
- `VERIFICATION.md` — focused browser checks and review results.

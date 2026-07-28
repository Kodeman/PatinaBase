<!-- Canonical strings governing the ux-july delivery program — every finding-driven copy change (U-numbers) must match this file verbatim; do not invent labels. -->

# ux-july canonical string glossary (design authority: final)

## Design services
- Entry CTA into design services, everywhere OUTSIDE the flow: **"Get design help"** (room-scoped: "Get design help with this room").
- DesignerConsultationView keeps headline "Work with a designer"; its button: "Start a request" (you're already inside design services).
- Flow sheet: nav title **"Your design request"**; step titles unchanged (Choose scans / Your request / Review / Sending / Sent); send button "Send request" (offline "Save request"); status-view terminal CTA "Start a new request".
- Companion designer row default label: "Get design help" (was "Ask a designer"); swaps to "Your design request" when a request exists (unchanged).

## Saved & browse
- Saved surface title: **"Saved"** (replaces "Collections" header). Entry labels: "Saved". Tabs: **"Boards" / "All items"**. Companion rows: "Saved" / "All saved items" (replaces "Collections"/"All collections"/"My table"). Board vocabulary stays "board" ("New board", "Create board", "No boards yet", "This board is empty").
- Browse entry label: **"Browse pieces →"**. Browse screen title: **"Browse pieces"** (replaces "Perfect for your space" as the H2; subtitle "N pieces curated for your space" stays).
- Save action labels: keep "Save"/"Saved ✓"/"Add to Room" as-is (verb variety is contextual, not renamed this pass).

## Account / QR
- QR portal login label in BOTH Settings and Account: **"Sign in on the web"**.

## Scan & style
- Reveal header: replace "THE AESTHETE ENGINE" with eyebrow **"YOUR STYLE, FOUND"** (title remains the profile name).
- Quiz result: NO percentage. Confidence line becomes: **"A starting point — refine it any time."**
- Upload progress: single human line **"Sending your scan — {n} of {m}"** (replaces USDZ/Mesh/World/Depth Idx/Cov/Manifest pills); keep status strings "Uploading scan…", "Upload failed — will retry", "Saved on this phone".
- NewRoomSheet: scan option body **"Walk your room with the camera — best picks, AR placement, and a floor plan."**; manual option body **"Type in room size and details. You'll still get style-matched picks."**
- Room stat cells: "Items" / **"Match"** (was "Avg Match") / **"In AR"** (was "AR Ready").

## Tier narration
- Discovering, under the designer CTA: **"Your Studio — projects, messages, invoices — opens when you start with a designer."**
- Locked row meta (engaged): **"Opens with your first project"**; a11y hint "Locked until your first project begins."
- Marketplace block header: **"MARKETPLACE"**; rows "Browse pieces" (meta "The full collection") and "Saved" (meta "Everything you've kept").

## Loading / error / empty
- Retry label everywhere: **"Let's try that again"**. Default loading label: **"One moment…"** (screens may pass specific labels, e.g. "Finding pieces for you…").
- Studio empty-state copy pattern (U22): first line names the surface, second names the trigger, CTA is conditional — "Track your request" → .designRequests when DesignRequestStatusService.shared.promotedRequest != nil, else "Get design help" → .designerConsultation. Per-screen first lines:
  - Projects: "Your projects live here" / "When you start with a designer, the project — timeline, scope, people — lands here."
  - Proposals: "Nothing to review yet" / "Your designer's proposals land here for your signature."
  - Invoices: "Nothing due" / "When your designer sends an invoice, it lands here."
  - Budget: "No budget yet" / "Sign a proposal or receive an invoice and your budget builds itself here."
  - Documents: "No documents yet" / "Contracts, drawings, and files your designer shares land here."
  - Messages: "No conversations yet" / "Messages with your designer land here once you're working together."
  - Decisions: "Nothing waiting on you" / "When your designer needs a call from you, it lands here."
- Recommendations empty (no filter): "Nothing here yet" / "Save pieces you love or take the style quiz to tune what shows up." CTA "Take the style quiz".
- Home filtered-empty: "Nothing in {filter} for this room yet." + text button "Show all".
- Collections All-items empty gets CTA "Browse pieces" → .emergence(nil).
- CrossRoom empty: "No items yet" / "Pieces you save land here, organized across your rooms." CTA "Browse pieces".
- Room not found: "This room isn't on this phone" / "It may have been removed." + Back affordance.

## First-launch tour (WP-FT)
- Step: greeting header → "Welcome to Patina" / "This is your Daily Room — picks and stories chosen for your space."
- Step: first product card's "+ Add" (only when a card exists) → "Save what you love" / "Add pieces to a room with + Add — they follow you everywhere."
- Step: monogram → "Your profile" / "Rooms, saved pieces, and settings live here."
- Steps renumber visibly when an anchor isn't mountable (never silently vanish: "Step 1 of 2" not a missing step 2 of 3).

## Onboarding page 3 (quiz-first variant, U33)
- Title "Find your style first" / body "Five quick questions, then we'll show you pieces that fit. Your camera comes later — only when you choose to scan a room." CTA "Let's begin". (Walk-first variant keeps the camera page.)

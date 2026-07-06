# The Aesthete Engine™ — Attribute & Taste Model

*A product brief on everything the engine tracks, how it matches, and how each designer's eye becomes a bias it can learn.*

---

**Status:** Draft for review
**Owner:** Kody / Patina Product
**Last updated:** 2026-07-01
**Builds on:** `02-product/aesthete-engine/style-profiles.md`, `teaching-guide.md`, `04-api/aesthete-engine-api.md`, and the Feb 2026 round-3 synthesis (pgvector primary; positioning is *Designer-Taught Intelligence*, never "AI")
**Scope:** Full attribute universe and designer-taste system, with the 22-week MVP subset flagged. ⭐ = ships in MVP · ○ = Phase 2/3 roadmap

---

## Executive summary

The Aesthete Engine is the intelligence layer that lets Patina match a person to a piece of furniture the way a great designer would — not by matching keywords, but by understanding taste. This brief defines the complete set of attributes the engine tracks to make that possible, and it answers the question that makes Patina different from every "smart" catalog on the market: **how does each designer keep their own eye, their own bias, inside a shared engine — and how does the engine learn it?**

The core idea is simple to say and rich to build. **Products, clients, and designers all live in the same aesthetic space.** A walnut credenza, a homeowner in Wichita, and a designer named Ana are each described by the same underlying vocabulary of taste — warmth, complexity, formality, material honesty, and a few dozen more dimensions. Once everything speaks the same language, matching a client to a product, a product to a room, or a client to the *right designer* all become the same operation: find what sits close in taste-space, then bend the result toward the eye of whoever's guiding the project.

That "bend toward a designer's eye" is the centerpiece. Every designer gets a **taste vector** — a learned fingerprint of their aesthetic, inferred from their portfolio, their side-by-side judgments, and the corrections they make while teaching. Middle West Studio also has a **house taste** — the studio's collective signature. A single tunable dial blends the two, so a recommendation can run anywhere from "pure Middle West house look" to "exactly what Ana would pick." That dial is the feature. It's how Patina scales one studio's taste to thousands of rooms without flattening it into a generic algorithm.

---

## The problem this solves

Every furniture site can filter. Type "mid-century walnut dining table under $2,000" into Wayfair and you'll get a thousand results, sorted by nothing that matters. Filtering treats attributes as *constraints* — walls that exclude what doesn't fit. A designer treats attributes as *language* — signals that, read together, tell them who a piece is for and why.

The gap between those two is the whole opportunity. When a designer sees a sofa, they don't run a filter. In the first ten seconds they read its silhouette, its stance, the honesty of its materials, the confidence it would take to live with it — and a specific client's face appears in their mind. That read is built from thousands of tiny judgments, and it has never been capturable. The Aesthete Engine's job is to capture it: to encode the attributes a designer actually reads, and to learn the weighting each designer applies when they read them.

So the brief has two halves. First, **the attribute model** — the shared vocabulary rich enough that a designer's read has somewhere to live. Second, **the taste model** — the mechanism that lets each designer's personal weighting of that vocabulary be learned, stored, blended, and applied.

---

## Part I — Three profiles, one shared space

Before the attribute lists, the mental model that ties them together.

The engine maintains three kinds of profile, and the trick that makes everything else work is that **all three are expressed in the same coordinate system.**

- **Product DNA** — what a piece *is*. Its style, materials, color, proportion, patina behavior, and the contexts it belongs in.
- **Client Style Profile** — what a person *loves*. The same aesthetic dimensions, plus their lifestyle, budget, and the emotional drivers behind a project.
- **Designer Taste Profile** — how a designer *sees*. Their center of gravity in taste-space, their signature biases, and where they diverge from the house.

Because a product's "warmth" and a client's "warmth" and a designer's "warmth" are measured on the same scale, comparison is native. Matching a client to a product is a distance calculation. Matching a client to a designer is the same calculation on different rows. Bending a product ranking toward a designer's eye is a weighted average of two points in the same space. One representation, many payoffs.

Technically, each of these dimensions is stored two ways: as **interpretable scores** a designer can read and edit (warmth = +0.7), and as a dense **embedding vector** the machine-learning layer uses for similarity search (via pgvector, Patina's primary vector store). The interpretable scores keep humans in control and make every match explainable; the embeddings capture the subtle, hard-to-name similarities that no set of sliders fully describes. Keyword and faceted search run alongside on Typesense. The two representations are kept in sync — a designer nudging a slider updates the vector; the vision model proposing a vector surfaces as readable scores for the designer to confirm.

---

## Part II — Product DNA: the complete attribute model

Everything the engine can know about a single piece, organized into ten families. Think of it as the anatomy a designer dissects, made explicit. Most attributes carry a value **and** a confidence, because a claim the engine is sure of should count for more than a guess. The families marked ⭐ are captured in the MVP; the rest layer in over Phases 2–3.

### 1. Identity & provenance ⭐
The passport. Name, brand or maker, originating designer, collection, country of origin, period/era, and — critically for Patina — the **provenance story** (reclaimed barn oak from Vermont; one of twelve made; 200 hours of hand-carving). Provenance isn't trivia here; it's a matching signal, because some clients buy the story and others never will.

### 2. Form & silhouette ⭐ (partial)
The single biggest tell of style. Overall **silhouette** (the shape you'd recognize in shadow), **line quality** on a rectilinear↔curvilinear axis, **scale** (visual heft and how much room the piece commands), **proportion**, and **symmetry**. Then the vocabulary designers actually use to name a piece: **leg style** (tapered, cabriole, block, turned, plinth, floating), **arm profile** (track, English roll, Lawson, shelter, rolled), **back profile**, and the **footprint / negative space** — how much air the piece leaves around itself, which decides whether it can breathe in a room or smothers it.

### 3. Material & construction ⭐
Primary and secondary **materials**, **joinery and construction quality**, **finish** (natural oil, lacquer, painted, raw, waxed), **surface texture** (from the macro-photography the quiz uses), **solidity/weight**, and a **craftsmanship tier** running mass-produced↔artisan. Materials also carry a practical **maintenance reality** — because "performance velvet" that pills with a cat is a matching signal a designer knows and a spec sheet hides.

### 4. Color & finish ⭐
**Dominant color**, **accent colors**, **palette family** (warm earth, cool neutral, jewel, monochrome, etc.), plus the axes that make color matchable: **value** (light↔dark), **saturation**, **temperature** (cool↔warm), **sheen/reflectivity**, and **pattern** (solid↔patterned, density, motif). Stored as both named palettes and extracted color histograms so the engine can reason about "goes with" as well as "is."

### 5. Patina & aging — *Patina's signature dimension*
The attribute family no competitor tracks, and the one the brand is named for. **Patina potential**: does this piece grow more beautiful with use, or just wear out? **Material honesty**: does it age as what it is, or is it a finish pretending to be something else? **Character trajectory**: leather that softens and deepens, brass that mellows, oak that silvers — versus laminate that chips and looks worse. For a brand built on materials that age gracefully, this is both a matching signal and a values filter, and it deserves to be first-class rather than buried in "materials."

### 6. Style signature ⭐
The heart of the read, and the layer the whole engine pivots on. A **primary archetype** (e.g., Modern Organic), weighted **secondary archetypes** (works as Scandinavian if paired down; reads Industrial with the wrong legs), and the six **style spectrums** every product, client, and designer share:

| Spectrum | −1 pole | +1 pole |
|---|---|---|
| **Warmth** | Cool (metal, glass, stone) | Warm (wood, fabric, earth) |
| **Complexity** | Minimal, clean-lined | Ornate, detailed, layered |
| **Formality** | Casual, everyday | Formal, occasion |
| **Timelessness** | Trendy, of-the-moment | Classic, always-relevant |
| **Boldness** | Subtle, background | Statement, conversation-starter |
| **Craftsmanship** | Mass-produced | Artisan, hand-made |

Plus **mood keywords** and an overall **ambiance** label (Refined Casual, Quiet Zen, Confident Modern). These six spectrums are the common tongue: they're what let a client's slider and a product's tag and a designer's bias all be compared directly.

### 7. Function & ergonomics ⭐ (partial)
Primary **function**, **comfort profile**, **ergonomic fit**, **flexibility** (single-use↔multi-use), **storage**, and **durability for a use-case** — the honest kind, tagged for kids, pets, and high-traffic living rather than the aspirational showroom version.

### 8. Context & compatibility ○
Where a piece belongs and what it belongs *with*. **Spatial requirements** (minimum room size, ceiling height, breathing room), **lighting needs** (north light flatters this grain; harsh downlight kills it), **architectural harmony** (which building styles it sits inside naturally), and **relationships** to other products: *pairs beautifully with*, *clashes with*, *belongs to the same set*, *is a cheaper/dearer alternative to*. Relationships are how the engine graduates from recommending pieces to composing rooms.

### 9. Commercial ⭐ (partial)
**Price** and **price tier**, the **value-justification story** for the tier, **lead time**, **availability**, **affiliate/margin** data, and **sustainability credentials** (local maker, reclaimed, certified). Price here is not just a filter — it's paired with a *perception* model (Part V), because the same $3,500 reads as sticker shock to one client and a bargain to another.

### 10. Learned & behavioral ○
What the engine discovers after a piece is live: **appeal signals** and **avoidance signals** (this piece over-indexes with texture-lovers, repels minimalist purists), **save/purchase rates** by profile, **seasonal modifiers** (a chunky knit throw peaks in winter, dies in summer), **trend trajectory**, and the **designer validation history** that drives the piece's overall confidence score.

> **How Product DNA gets created.** In the MVP, a designer tags a piece through the analysis portal — gut read, style spectrums, "who is this for," materials — with a vision model pre-filling a first-draft DNA from the product images so the designer confirms and corrects rather than starting blank. Every confirmation and correction is also a teaching signal (Part IV). Full auto-analysis with light human validation is the Phase-2 target.

---

## Part III — The Client Style Profile: what a person loves

The client profile uses the *same* six spectrums as products, which is what makes matching a distance calculation rather than a lookup table. It starts light and deepens with trust — five questions to begin, a richer picture as someone engages, and continuous quiet learning from behavior.

### The foundation — five questions ⭐
The MVP quiz is deliberately short and feels like play, but each question measures several dimensions at once:

1. **"Which room speaks to you?"** — a 2×2 of curated rooms, each carrying hidden warmth/complexity/formality/era scores. Measures visual resonance without asking anyone to name a style.
2. **"How do you actually live here?"** — multi-select lifestyle cards. Measures functional priorities, social-vs-private orientation, durability needs.
3. **"What texture calls to you?"** — swipeable macro-photography. Measures tactile preference, natural-vs-manufactured leaning, patina appreciation, and price signals.
4. **"Let's talk investment."** — a visual budget scale from "Starting Out" to "Curator's Collection." Measures real budget, value orientation, quality-vs-quantity.
5. **"What's driving this?"** — emotional-imagery single-select. Measures readiness, urgency, and project scope (the lead-gen tell).

The output is a **basic profile**: a primary and secondary archetype with a confidence score, a position on each spectrum, functional priorities, a budget posture, and material affinities.

### The deep dive ○
Offered once someone is invested (saved 10+ items, or considering design services): color psychology, spatial philosophy, living patterns, personal heritage and meaningful objects, and sustainability values — captured through a photo-sorting exercise, a preference-slider matrix, and a short story-completion ("my ideal room makes me feel…") read for sentiment.

### Learning from behavior ○
The quiz is the opening line, not the whole conversation. The engine keeps listening: **dwell time** on an image, **zoom behavior** (zooming into joinery signals a craftsmanship reader), **save clusters**, **swipe velocity** (a fast reject is a strong negative), and **price exploration** (browsing above the stated budget quietly raises it). These implicit signals continuously nudge the profile — weighted well below explicit choices, because what someone says still matters more than one restless scroll.

### The designer's margin notes ○
A client profile isn't only built by the client. The assigned designer can add what a quiz can't reach: **contraindications** ("never show Victorian despite the traditional score"), **hidden preferences**, and **nuance** ("likes modern but needs soft edges with two toddlers"). This is where the human eye corrects the machine — and, as Part IV shows, every correction also teaches the engine *that designer's* taste.

---

## Part IV — The Designer Taste Profile: how an eye becomes a bias the engine can learn

This is the part that makes Patina Patina. Everyone else builds one recommendation model and calls the designers "reviewers." Patina treats each designer as a **first-class taste**, with their own learnable fingerprint — and then gives the studio a dial to decide how much of that fingerprint colors any given recommendation.

### The big idea: your eye is a vector

Recommendation research has converged on a useful way to describe taste: not as a list of rules, but as a **direction in a high-dimensional space** — a "taste vector." Individual taste can be modeled as a personal weighting of a shared set of aesthetic building blocks, learned from a person's own judgments rather than hand-written. Patina applies this directly: **each designer gets a taste vector**, a point (and a set of directional leanings) in the same aesthetic space as products and clients.

Concretely, a designer's taste vector answers: *where is this designer's center of gravity, and which way do they lean off it?* Ana's vector might sit warm, low-complexity, high-craftsmanship, with a strong pull toward material honesty and a mild aversion to bold statement pieces. That's not a category she's assigned to — it's a shape the engine infers from what she does.

### Where the taste vector comes from

The fingerprint is learned from four streams, in rough order of signal strength:

1. **Side-by-side judgments (the strongest signal).** During teaching, the engine shows a designer two pieces and asks which is more "them," or more right for a client. Preference between two options is the cleanest possible read of taste — far more reliable than asking someone to rate a slider — and it's the primary fuel for the vector. Every "this over that" moves the fingerprint.
2. **Corrections while teaching.** When a designer overrides a match ("too industrial for her softer aesthetic — those metal legs would fight her brass"), the engine records not just *that* it was wrong but *which direction* the correction points. Corrections are directional data: they tell the vector where to move.
3. **Portfolio ingestion (onboarding).** When a designer joins, they bring their past rooms and projects. The vision model embeds those images; their **centroid** is the designer's aesthetic home base — a warm start for the vector before they've taught a single match.
4. **Tagging and rule-authoring behavior.** Which attributes a designer reaches for, the vocabulary they emphasize, and the explicit rules they write ("if minimalist + clean-lines, penalize ornate by 40%") all inform the fingerprint. Explicit rules stay explicit *and* nudge the vector.

### Beyond the vector: named, interpretable biases

A raw vector is powerful but opaque, and designers are being *recruited* on the promise that their expertise stays theirs — so the engine surfaces the fingerprint as **named directional biases** a designer can see, name, and edit. These are the "signature moves":

- *"Warms up cool pieces"* — consistently nudges cold materials toward brass/wood accents.
- *"Reads scale conservatively"* — assumes pieces look bigger in the room than in photos.
- *"Distrusts performance-fabric claims"* — discounts stated pet-durability.
- *"Patina-first"* — over-weights material honesty and graceful aging.

Every designer gets a living, human-readable **"Your Eye" profile**: their center of gravity, their top signature biases, and their confidence by style. It's part recruiting pitch ("your expertise becomes eternal"), part control panel, part trust — nobody's taste is a black box they can't inspect.

### Confidence by style — how much a designer's vote counts

Borrowed from the existing teaching model and made central: a designer isn't equally expert everywhere. The profile carries a **confidence map** — Expert in Modern Organic, Advanced in Transitional, Learning in Scandinavian. This weights how strongly their taste vector influences a match *in that style neighborhood*. Ana's warm-organic instincts carry full weight on a Modern Organic sofa and a light touch on a High-Victorian sideboard she's still learning.

### Deviation from house — signature vs. off-brand

Because designers and the house both live in the same space, the engine always knows **how far a designer sits from the house consensus, per dimension.** That distance is a feature, not a defect: a little deviation is a *signature* (the reason a client would want Ana specifically); a lot of deviation on a client who wanted the safe Middle West look is a flag. The system can show a designer "here's where your eye diverges from the house — and that's exactly what makes you you."

### The house taste — Middle West's collective signature

**House taste** is a single consensus vector representing the studio's shared eye. It's computed as a **confidence-and-reliability-weighted aggregate** of the individual designer vectors — loud or inconsistent designers don't get to drag it — and then curated: a lead designer can pin, nudge, or protect the house signature so it stays deliberately Middle West rather than drifting to whatever the newest hire likes. The house vector is also the **cold-start answer**: a brand-new anonymous quiz-taker, with no assigned designer, gets recommendations shaped by the house.

### The dial: blending designer and house

Here is the feature Kody asked for, in one line:

> **match influence = w · (this designer's taste) + (1 − w) · (house taste)**

`w` is a tunable dial from 0 to 1:

- **w = 0** → pure house taste. Safe, on-brand, the reliable Middle West look. Default for anonymous web quiz-takers and cold-start.
- **w = 1** → pure designer eye. Recommendations bend fully toward the specific designer guiding this client.
- **middle** → house-anchored, designer-flavored. The everyday setting once a client is matched to a designer.

The dial can move with context, not just by hand: cold-start clients start low (house), a client assigned to a designer moves up, and a "surprise me / show me their eye" mode pushes it high. Crucially, `w` interacts with the **confidence map** — a designer's influence is `w` scaled by how expert they are in the relevant style — so the blend is strong where the designer is strong and gracefully defers to the house where they're still learning.

### The payoff: matching clients to *designers*

Because clients and designers share the space, the engine can do something a filter never could — recommend **the right designer** for a person: *"You'll love working with Ana. Her eye aligns with yours 91%."* This is not a gimmick; it's the core of Patina's business. The app's real product is qualified design-services leads, and "find the designer whose taste is compatible with yours" is the most natural, least salesy conversion path imaginable. Taste vectors make it a one-line calculation.

### Bias, responsibly

"Bias" is the honest word for what we're learning, and it deserves guardrails (expanded in Part VIII). In short: no single designer should quietly capture the house; learned taste must never become a proxy for budget-shaming or for narrowing people into a look they didn't choose; the client can always see and steer the blend; and a human designer stays in the loop on anything high-stakes. Taste is a lens the engine offers, never a verdict it imposes.

---

## Part V — The match: how it all comes together

A single recommendation is a weighted blend of several reads, then a ranked list with a plain-language reason attached to each pick.

**What goes into a score.** For a given client, product, and designer context, the engine combines:

- **Style-space fit** — distance between the client's vector and the product's vector, *warped by the designer/house blend* from Part IV. This is the backbone.
- **Material, color, and function fit** — the concrete affinities and practical needs.
- **Budget fit** — including price *perception*: the same price reads as shock, fair, or bargain depending on the client's value orientation, so the engine scores perceived value, not just absolute dollars, and anchors accordingly.
- **Context fit** — room size, lighting, lifestyle reality (kids/pets), and any designer contraindications, some of which act as hard filters rather than soft penalties.
- **Behavioral priors** — what similar clients actually saved and bought.
- **Exploration** — a deliberate dose of "not the safest pick." A recommender that only shows the obvious match stops learning and bores people; the engine reserves a slice of every result set for well-chosen stretches, which keeps discovery alive *and* keeps teaching the profile.

**What comes out.** A ranked set, each item with a **confidence** and an honest, human **"why"**: *"Aligns with your warm-organic leaning · perfect scale for your dining room · within budget · the kind of oak that only gets better."* Explainability isn't decoration — it's how a client trusts the match and how a designer audits it. The Week-6 MVP milestone is exactly this loop end-to-end: **quiz → top 10 recommendations.** ⭐

---

## Part VI — The learning loops

The engine gets smarter through five loops, each feeding a different profile:

1. **Client implicit signals** (views, saves, swipes, zoom, purchases) → refine the **Client Profile**. ○
2. **Designer teaching** (validation queue, side-by-side judgments, rule builder, nuance notes) → refine **Product DNA confidence** *and* the **Designer Taste Vector**. ⭐ (queue + tagging in MVP; full vector learning Phase 2)
3. **Portfolio ingestion** (onboarding) → seed the **Designer Taste Vector**. ○
4. **Field outcomes** (presented → saved → purchased → satisfaction) → the ground-truth signal that tunes **match weights** for everyone. ○
5. **Consensus & conflict resolution** (peer review, the three-touch validation path, conditional rules when designers disagree) → refine **House Taste** and product confidence. ○

The through-line: **every designer action does double duty.** Correcting a match fixes today's recommendation *and* teaches the engine that designer's eye for every future one. That's the compounding asset — the reason a designer's expertise "becomes eternal" rather than evaporating when they log off.

---

## Part VII — What ships in the MVP, and what comes after

Mapped to the 22-week timeline (Week-6 demo: quiz → top 10). ⭐ = in the MVP cut.

**MVP (Weeks 0–22) ⭐**
- Five-question quiz → basic Client Style Profile (anonymous `session_id` on web; magic-link on iOS).
- Product DNA via designer tagging with vision-model draft-fill: identity, form (partial), materials, color, style signature, function (partial), commercial (partial).
- Core style-spectrum matching in pgvector; keyword/facet search on Typesense.
- **quiz → top 10 recommendations** with plain-language "why" (Week-6 milestone).
- Designer teaching queue + rule builder.
- **Lightweight designer taste**: portfolio-centroid start + named explicit biases + confidence map, with the blend dial shipped and defaulted to house-leaning. (The full *learned-from-judgments* vector is Phase 2 — but the dial, the house vector, and the "Your Eye" profile exist from day one so the mechanism is real, not retrofitted.)

**Phase 2 — Behavioral & taste learning ○**
- Implicit behavioral signals feeding the client profile.
- Full designer taste vectors learned from side-by-side judgments and corrections.
- House-taste consensus computation with reliability weighting.
- **Client ↔ designer matching** ("your eye aligns with Ana 91%").
- Advanced client profile (color psychology, spatial, heritage, sustainability).

**Phase 3 — Predictive & compositional ○**
- Room composition from relationships (not just single-piece picks).
- Seasonal/trend adaptation and style-drift detection.
- Life-stage prediction and cross-profile learning.
- "In the style of designer X" generation and curated capsules.

---

## Part VIII — Guardrails & responsible taste

Learning bias is powerful, so the brief commits to keeping it honest:

- **No runaway house capture.** House taste is reliability-weighted and lead-curated so one prolific or inconsistent designer can't quietly become the studio's whole aesthetic.
- **Taste ≠ budget-shaming.** The engine must never let a learned aesthetic become a proxy for treating a lower budget as lesser taste. Value orientation and budget are matching dimensions, not status judgments.
- **Against the filter bubble.** The exploration slice and the client's own controls exist partly so the engine broadens rather than narrows a person into a single look they never chose.
- **Human in the loop.** Contraindications, high-stakes matches, and anything a designer flags stay under human authority. The engine amplifies the designer's eye; it doesn't overrule it.
- **Explainable by default.** Every match carries its reasons, every designer can inspect their own "Your Eye" fingerprint, and clients can see and steer the house/designer blend. No black-box taste.
- **Consent and portability of the designer's asset.** A designer's taste vector is *their* professional signature; the brief assumes clear terms on how it's stored, used, and what happens to it if they leave.

---

## Appendix A — Attribute schema (reference)

Consolidated JSON shape for Product DNA and the Client Profile, reconciling the existing `style-profiles.md` and `teaching-guide.md` schemas onto the shared six-spectrum space. (Illustrative — not final API contract.)

```jsonc
// PRODUCT DNA
{
  "productId": "uuid",
  "identity": { "name", "maker", "designer", "collection", "origin", "era", "provenanceStory", "edition" },
  "form": { "silhouette", "lineQuality": -1..1, "scale", "proportion", "symmetry",
            "legStyle", "armProfile", "backProfile", "negativeSpace" },
  "material": { "primary", "secondary": [], "joinery", "finish", "texture",
                "solidity", "craftsmanshipTier": 0..1, "maintenanceReality" },
  "color": { "dominant", "accents": [], "paletteFamily", "value": -1..1,
             "saturation", "temperature": -1..1, "sheen", "pattern": -1..1, "histogram" },
  "patina": { "potential": 0..1, "materialHonesty": 0..1, "characterTrajectory" },
  "style": {
    "primaryArchetype", "secondaryArchetypes": [{ "archetype", "weight", "conditions" }],
    "spectrums": { "warmth": -1..1, "complexity": -1..1, "formality": -1..1,
                   "timelessness": -1..1, "boldness": -1..1, "craftsmanship": -1..1 },
    "moodKeywords": [], "ambiance", "embedding": "vector(pgvector)"
  },
  "function": { "primaryUse", "comfort", "ergonomics", "flexibility", "storage", "durabilityFor": [] },
  "context": { "minRoomSize", "ceilingHeight", "lightingNeeds", "architecturalHarmony": [],
               "relationships": { "pairsWith": [], "clashesWith": [], "sets": [], "alternatives": [] } },
  "commercial": { "price", "priceTier", "valueStory", "leadTime", "availability",
                  "margin", "sustainability": [] },
  "learned": { "appealSignals": {}, "avoidanceSignals": {}, "saveRate", "purchaseRate",
               "seasonalModifiers": {}, "trend", "validationHistory": [], "confidence": 0..1 }
}

// CLIENT STYLE PROFILE
{
  "profileId": "uuid", "userId": "uuid", "version": "basic|advanced",
  "archetype": { "primary", "secondary", "confidence": 0..1 },
  "spectrums": { "warmth", "complexity", "formality", "timelessness", "boldness" }, // shared with products
  "functionalPriorities": { "entertaining", "comfort", "productivity", "storage", "flexibility" },
  "budget": { "range": { "min", "max" }, "valueOrientation", "qualityVsQuantity": -1..1 },
  "materialAffinities": { "wood", "metal", "fabric", "stone", "glass" },
  "advanced": { "colorPsychology", "spatial", "lifestyle", "heritage", "sustainability" },
  "behavioral": { "dwell", "zoom", "saveClusters": [], "swipeVelocity", "priceExploration" },
  "designerNotes": { "notes": [], "contraindications": [], "hiddenPreferences": {} },
  "embedding": "vector(pgvector)"
}
```

## Appendix B — Designer taste mechanics (reference)

```jsonc
// DESIGNER TASTE PROFILE
{
  "designerId": "uuid",
  "tasteVector": "vector(pgvector)",          // learned fingerprint in the shared space
  "centerOfGravity": { /* spectrum coords, human-readable */ },
  "signatureBiases": [                          // named, interpretable, editable
    { "name": "Warms up cool pieces", "dimension": "warmth", "direction": "+", "strength": 0..1 }
  ],
  "confidenceMap": { "modernOrganic": "expert", "transitional": "advanced", "scandinavian": "learning" },
  "deviationFromHouse": { /* per-dimension distance */ },
  "reliability": 0..1,                          // internal consistency of their judgments
  "sources": { "portfolioCentroid": true, "judgmentCount": 0, "corrections": 0, "rules": 0 }
}

// HOUSE TASTE  =  reliability & confidence-weighted aggregate of designer vectors, lead-curated
house_taste = curate( Σ (designer.tasteVector · designer.reliability · designer.confidenceWeight)
                      / Σ (designer.reliability · designer.confidenceWeight) )

// THE BLEND — per match
influence(designer, style) = w · designer.tasteVector · confidence(designer, style)
                           + (1 − w) · house_taste
// w ∈ [0,1]: 0 = pure house (cold-start default) · 1 = pure designer eye

// CLIENT ↔ DESIGNER MATCH  =  similarity( client.embedding, designer.tasteVector )
```

## Appendix C — Glossary

- **Aesthetic space** — the shared coordinate system (interpretable spectrums + dense embedding) in which products, clients, and designers are all represented.
- **Taste vector** — a designer's learned aesthetic fingerprint: a direction in the aesthetic space.
- **House taste** — Middle West Studio's collective signature vector, aggregated from designers and lead-curated.
- **The dial (`w`)** — the tunable blend between an individual designer's eye and the house taste.
- **Signature bias** — a named, human-readable directional leaning derived from a designer's taste vector.
- **Confidence map** — a designer's expertise level per style archetype, which scales their influence.
- **Product DNA** — the full attribute description of a single piece.
- **Designer-Taught Intelligence** — Patina's positioning for the engine. (House rule: never "AI.")

## Appendix D — Grounding & references

This brief builds on Patina's existing internal docs — `02-product/aesthete-engine/style-profiles.md`, `teaching-guide.md`, `deep-dive.md`, `04-api/aesthete-engine-api.md`, the designer-interview set, and the Feb 2026 round-3 synthesis decisions (pgvector primary; "Designer-Taught Intelligence," never "AI") — and on current external research in visual style modeling and taste personalization:

- Taste as a high-dimensional vector for consumer personalization — [Medium: *Taste as a Vector*](https://medium.com/@edatopuz/taste-as-a-vector-the-future-of-personalization-in-consumer-ai-cdfec9b1ca83); [Patron: *Toward Computational Taste*](https://patron.fund/blog/toward-computational-taste-llms-aesthetics-judgment)
- Individual preference as a weighting of shared basis functions; learning from pairwise human feedback — [*Capturing Individual Human Preferences with Reward Features*](https://arxiv.org/html/2503.17338v2); [*Personalizing RLHF with Variational Preference Learning*](https://arxiv.org/html/2408.10075v1)
- Curator/taste-aware visual recommendation — [*CuratorNet: Visually-aware Recommendation of Art Images*](https://arxiv.org/pdf/2009.04426)
- Visual style embeddings (CLIP) for furniture & fashion compatibility — [*Learning Style Compatibility for Furniture*](https://arxiv.org/pdf/1812.03570); [*CLIP-Layout: Style-Consistent Indoor Scene Synthesis*](https://arxiv.org/abs/2303.03565); [*VL-CLIP*](https://arxiv.org/pdf/2507.17080)
- Furniture style attributes & visual classification — [*Visual Classification of Furniture Styles*](https://dl.acm.org/doi/abs/10.1145/3065951); [*Room Style Estimation for Style-Aware Recommendation*](https://tomerwei.github.io/pdfs/C_Cansizoglu_RoomStyle_AIVR_cameraready.pdf)
- Furniture design vocabulary (silhouette, arm, leg, proportion) — [Kathy Kuo Home sofa glossary](https://www.kathykuohome.com/blog/sofa-styles-arm-leg-cushion-types/); [LuxDeco sofa guide](https://www.luxdeco.com/pages/types-of-sofa-arms-sofa-legs/)

---

*The Aesthete Engine™ — refined taste, mechanized. Not a smarter filter, but a studio's eye made scalable: every attribute a designer reads, every bias a designer carries, learned once and applied a thousand times.*

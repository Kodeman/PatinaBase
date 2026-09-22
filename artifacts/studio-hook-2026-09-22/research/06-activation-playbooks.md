# Lane 06 — Web Research: Activating B2B Users Replacing an Entrenched Manual Workflow

**Researcher:** Web-research lane (studio-hook dossier, fan-out wave)
**Date:** 2026-09-22
**Method:** WebSearch tool only (per lane scope — no WebFetch used this pass). WebSearch returns AI-synthesized summaries of live search results with inline source attribution; I read those summaries, not the primary-source PDFs/pages directly, unless stated otherwise. That means every citation below is one level removed from the primary source — treat the **evidence tier** tag on each lever accordingly.

**Evidence tiers used throughout:**
- **VERIFIED (peer-reviewed / primary)** — an academic paper or a company's own named research report, found and corroborated across ≥2 independent search results.
- **VERIFIED (vendor/case-study)** — a named company's own published case study or benchmark report (Userpilot, Amplitude, Appcues, etc.); directionally reliable but commercially motivated, often re-cites its own numbers across its own blog network.
- **INFERRED / secondary** — a claim that only appeared inside a third-party blog's paraphrase of a named source, without independent corroboration; flagged explicitly each time.
- **UNAVAILABLE** — I looked for it and could not find a citable primary number; noted so the next researcher doesn't re-walk the same dead end.

No solutions are proposed in the body. A short **Implications** section closes the report, as instructed.

---

## 1. Time-to-value and the "aha moment" — Reforge / Amplitude / McClure lineage

**Source:** Reforge's PLG-activation guide (paywalled; summarized via GrowthPigeon's public breakdown), Amplitude's 2025/2026 Product Benchmark Report (amplitude.com/blog/time-to-value-drives-user-retention), Dave McClure's 2007 AARRR framework.
**Evidence tier:** VERIFIED (vendor/case-study) for the Amplitude benchmark numbers; INFERRED/secondary for the Reforge "Setup → Aha → Habit" framing (read via a third-party paraphrase, not Reforge's own page, which is behind a membership paywall).

- Reforge's model: activation has three sequential moments — **Setup** (user has done what's needed to reach core value), **Aha** (they experience that value once), **Habit** (a repeated usage pattern). Reforge's guidance: design working backward from Habit, and for B2B, measure activation at the **team** level, not the individual level.
- The **activation event** is a deliberately different thing from the **aha moment**: the aha moment is the felt, qualitative instant of value; the activation event is the measurable behavior that statistically predicts 30-day retention for that specific product. McClure's original framing (2007 AARRR) explicitly excluded "signed up" or "completed a profile" as activation events — it has to be a behavior, found empirically by comparing 30-day-retained cohorts against churned cohorts to find the earliest action that separates them. Cited canonical examples: Slack (2,000 team messages sent), Dropbox (first file placed in a shared folder), Notion (second page created).
- **Amplitude's 2025/2026 Product Benchmark Report** (2,600+ companies analyzed): for 90th-percentile ("top") performers, Day-1 activation runs ~21%, falling to ~12% by Day 7 and ~9% by Day 14 — i.e. even the best products lose roughly half their activated users in the first week. The report also reports a strong correlation between 7-day activation rate and 3-month retention.
- Cross-vendor benchmark (Userpilot, 547 SaaS companies analyzed): average B2B activation rate is **37.5%**; average time-to-value across the sample is **1 day, 12 hours, 23 minutes**, though this masks wide variance by category.
- One frequently-repeated secondary claim (sourced to Reforge via a third-party blog, not verified against Reforge directly): users who reach their aha moment within 3 days are **90% more likely** to become active users; top performers get simple products to an aha moment in as little as 8 minutes.

**How it would translate to a studio driving a real job:** the studio's activation event cannot be "created a project" or "invited a teammate" — those are setup steps, not value. It has to be something like "sent a real update to a real client this week" or "delegated a real task to a hand and it got done" — discovered empirically by comparing studios that are still active at 30/60 days against studios that quietly went back to texting, and finding the earliest action that separates them. Whatever that event is, the Amplitude data says it has to land inside the studio owner's **first session**, not week two — a studio that leaves session one without touching something real to her actual job is very unlikely to come back for it.

---

## 2. Concierge / white-glove onboarding — Superhuman's mandatory human setup call

**Source:** First Round Review's "How Superhuman Built an Engine to Find Product/Market Fit" (canonical write-up); corroborating pieces from Mind the Product, SaaS Club podcast, LinkedIn/NFX commentary.
**Evidence tier:** VERIFIED (vendor/case-study) — widely corroborated, named-company account, though it's Superhuman's own telling of its own history (survivorship bias risk).

- Every new Superhuman user went through a **mandatory 30–60 minute 1:1 onboarding call** with a Superhuman employee before being allowed to use the product unsupervised — one account states users "didn't allow me to try or touch the product until the onboarding meeting."
- The stated rationale: learning something hands-on and human-guided is stickier than a self-serve tour ("if you are learning something completely new, the memory will stick around much longer"), and it let the company learn how each individual actually worked and customize accordingly. Superhuman deliberately recruited onboarding staff from **hospitality**, not tech support.
- Reported outcome: "almost everyone becomes a user after the onboarding call," and the practice fed a referral loop — on average, every new Superhuman user brought in roughly one more user down the line.
- Superhuman later (per First Round Review, in their own words) spent **three additional years building in-product, self-serve onboarding** that "migrated the hard-earned lessons" from the human calls into scalable product experience, and **re-focused white-glove time on their highest-value prospects/B2B customers** rather than eliminating it — i.e. concierge onboarding was a phase they graduated out of gradually, on their own schedule, not an emergency patch.

**How it would translate to a studio driving a real job:** Patina's acquisition motion is already 1:1 through Leah's network (per the vision constraints), which means the infrastructure for concierge onboarding — a real human who knows the studio — already exists; this is the cheapest lever on this list to test because it requires no new engineering, only a deliberate first-session script that is about *this studio's actual current job*, not a generic tour.

---

## 3. "Do things that don't scale" — manual/concierge setup for the earliest cohort

**Source:** Paul Graham, "Do Things That Don't Scale" (2013 essay, paulgraham.com/ds.html); corroborating case narratives on Airbnb, Dropbox, Pebble.
**Evidence tier:** VERIFIED (primary essay, widely and consistently paraphrased across independent secondary sources — the core claims below are corroborated, though I read the essay via summaries, not the primary text directly this pass).

- Graham's central claim: startups do not take off passively; the founders must recruit and delight the first users "one by one, by hand," doing unscalable, unglamorous work. The point of the manual work is not the labor itself — it's what founders **learn** from doing it manually, which an automated funnel would never surface.
- Named examples: Airbnb founders went door-to-door in New York photographing listings and helping hosts improve them — the manual scaffold existed only to get the flywheel turning, then was retired. Dropbox founders personally walked early users through setup before building automated onboarding, and used those direct interactions to design the eventual self-serve flow. Pebble hand-assembled hundreds of watches before automating manufacturing.
- The "Wizard of Oz" pattern named in commentary: do manually, for a small number of users, what the product will eventually do automatically — this surfaces what actually needs to be built, faster than guessing.
- The signal to **stop** doing the unscalable thing: clear, repeated patterns in what users need, and demand exceeding what the founder/team can personally handle by hand. Stopping the manual phase too early risks automating the wrong things.

**How it would translate to a studio driving a real job:** for the studios Patina is acquiring right now (explicitly the vision's target customer — a studio adding its first hands, not yet at scale), a human on the Patina side manually loading the studio's *actual, current, real* job into the system before the studio's first login is a direct application of this — the studio's first experience is seeing her own real job already sitting there, not an empty form to fill in. This is squarely a today-not-scalable tactic, consistent with the essay's logic and Patina's current acquisition size.

---

## 4. Import-first onboarding — Notion, Airtable, Linear (from Jira)

**Source:** Notion's own onboarding teardown (via Appcues/Candu analysis quoting Notion's Head of Product Growth, Lauryn Isford), Notion Help Center (notion.com/help/import-data-into-notion), Airtable onboarding teardown (Candu), Linear's own docs (linear.app/docs/import-issues, linear.app/docs/jira, linear.app/switch/migration-guide).
**Evidence tier:** VERIFIED (vendor documentation, directly sourced) for the mechanics; INFERRED/secondary for the effect claims (no company in this set has published a controlled A/B number on import-step lift — flagged explicitly by the search results themselves).

- Notion's Head of Product Growth is quoted on the underlying principle: **"the quicker users see their own data in your product, the faster they'll understand its value."** Notion's own import step is kept **optional** deliberately, because forcing a tech-stack connection is "a big ask for folks who may be evaluating Notion more casually" — it's aimed at high-intent users specifically. Notion's import supports PDFs, HTML, Markdown, Word, plain text, CSV/ZIP, plus dedicated importers for Evernote, Trello, Monday.com, Confluence, and a general API importer.
- Airtable's onboarding wizard includes an explicit upload/import step; the design rationale stated in the teardown: **"Adding data upfront reduces time to first value... Data import is often a big user drop-off point, so get it out of the way."** For teams without importable data yet, the recommendation is to seed a demo dataset so the user can see what "live" will feel like before they have real data in the system.
- Linear's native importer (Settings → Import) supports Jira, Asana, GitHub, Trello, CSV without needing the deprecated CLI tool, and requires Admin role in Linear plus matched user accounts across both systems for clean attribution of issues/comments. Critically, Linear offers **"Jira Sync"** as a distinct, gentler option from a one-time import: it keeps Jira and Linear synced in parallel, explicitly **"for teams that aren't ready to fully switch over yet — whether you're running a small pilot or working through a gradual transition."** Recommended rollout: give teams up to 6 weeks to configure before a hard cutover ("freeze Jira, make Linear official").
- **UNAVAILABLE:** no source in this search produced a controlled activation-lift number specifically attributable to the import step alone (isolated from the rest of onboarding) for Notion, Airtable, or Linear. Treat the causal story ("import → faster activation") as strongly argued by the companies themselves but not independently quantified in what I found.

**How it would translate to a studio driving a real job:** this is close to a direct answer to Kody's stated problem. The studio's complaint isn't "the portal is confusing" — it's "I get excited, then go do the job the old way," which reads as: *the portal made her start from zero on day one.* Linear's "Sync, don't force a cutover" pattern is the more conservative version — let the studio keep her spreadsheet/texts live for the first real job while Patina mirrors it, removing the all-or-nothing risk — versus Notion/Airtable's "import your existing data so you see your own real thing on day one" pattern, which is more aggressive but higher-value if it works. Either way, the research consensus is: never ask the studio to re-type something she has already written down somewhere else.

---

## 5. Progressive disclosure vs. all-at-once setup wizards

**Source:** Nielsen Norman Group, "Progressive Disclosure" (nngroup.com/articles/progressive-disclosure) and "Onboarding Tutorials vs. Contextual Help" (nngroup.com/articles/onboarding-tutorials); vendor completion-rate data from Chameleon/Userpilot (via secondary summary).
**Evidence tier:** VERIFIED (primary, NN/g's own named research) for the usability claim; INFERRED/secondary (unverified against NN/g directly, attributed instead to Chameleon/Userpilot) for the completion-rate percentages.

- NN/g's grounding study: testing the usability of **46 web-based applications**, including a hotel reservation system that crammed every reservation step onto one screen. Progressive disclosure — deferring secondary/advanced options to a later screen and showing only what's needed for the task at hand — improved **3 of the 5 core usability components**: learnability, efficiency of use, and error rate. NN/g explicitly rebuts the fear that hiding features hurts users: "people understand a system better when you help them prioritize features."
- NN/g's onboarding-specific guidance: use progressive disclosure in help content too — make contextual help visible but don't front-load detail until asked; for multistep workflows, surface help alongside each step rather than requiring the user to hold everything in working memory (reduces cognitive load).
- **Secondary, unverified-against-NN/g claim** (attributed instead to a Chameleon dataset of 15M interactions, reported via Userpilot 2025): linear/all-upfront onboarding averages **53% completion**; contextual, behavior-triggered disclosure raises that to **75% completion**, with a reported **30% increase in paid conversion**. Flag this as vendor-sourced and unverified against the primary dataset.

**How it would translate to a studio driving a real job:** this maps directly onto one of the vision's own hard constraints — no dashboards, no engagement surface, "the studio won't notice Patina." Progressive disclosure is the academically-grounded version of that instinct: reveal a setup step (add a client's email, name a schedule) at the exact moment the studio needs it for the *real task in front of her*, not as a batch of fields collected on day one before she's done anything real.

---

## 6. Single-player value before multiplayer/network value

**Source:** Chris Dixon, "Come for the tool, stay for the network" (cdixon.org, 2015); NFX's "Network Effects Bible"; Adam Fishman's "Crossing the Chasm from Single to Multiplayer"; Kevan Lee's "Single player vs. multiplayer" newsletter.
**Evidence tier:** VERIFIED (primary essay, well-corroborated framework, widely cited in the growth-practitioner literature) for the framework itself; the TechCrunch counterargument is also directly sourced and should be weighed, not dropped.

- Dixon's framework: products that need network effects to become defensible should still deliver **standalone, single-player value first** — the tool is what gets initial critical mass; the network is what creates long-term value and defensibility once enough users are in. Named examples: Delicious (single-player: private bookmark storage; multiplayer: tag-based discovery of others' links); Instagram (single-player: photo filters; multiplayer: the social feed came later).
- NFX's distinction: single-player products' value is direct and roughly linear (all the burden is on the product to keep adding value on its own, e.g. Workday, Oracle); multiplayer products let users feel the presence of other users and struggle to be valuable without them (their example: Vimeo without comments/view-counts is single-player; YouTube with them is multiplayer).
- Practitioner framing (Kevan Lee): single-player mode is what builds trust before a user will bring in colleagues — "if the user doesn't trust you, they're going to bail. If they don't understand the value right away, they're going to leave." Also flags a tradeoff: products with a small learning curve are easier to bridge from single- to multi-player, but also easier to walk away from because the sunk investment is smaller.
- Fishman's caveat for products where collaboration is core to the value prop (his examples: Asana, Evernote): "the most important tactic... is effective onboarding — ensure users connect with people, that they're the right people, and that initial interactions in the very first session are high value."
- **Counterargument** (TechCrunch, 2016): the "tool then network" sequencing is over-relied-upon by founders and investors, and it's hard to name big social-product successes built that way — building genuine social functionality is usually harder than building a good single-player tool, and bolting a network on afterward often fails.

**How it would translate to a studio driving a real job:** Patina is structurally multi-sided (studio, homeowner, maker), but the vision already states the studio, not the homeowner or maker, is the customer right now. This framework says the studio's day-one value must not depend on the homeowner or maker being present or active in the system at all — if the portal's first real payoff requires the client to log in and respond, or a maker to confirm something, that's asking the studio to depend on other people's activation before she gets anything, which this literature says is close to a guaranteed early-abandonment pattern.

---

## 7. Status quo bias and switching costs in enterprise/B2B software adoption

**Source:** Kim & Kankanhalli, "Investigating User Resistance to Information Systems Implementation: A Status Quo Bias Perspective," *MIS Quarterly* Vol. 33 (2009); Polites & Karahanna, "Shackled to the Status Quo," *MIS Quarterly* (2012); a 2016 meta-analytic review of status quo bias in IS adoption; an ERP-specific switching-cost-subtype study.
**Evidence tier:** VERIFIED (peer-reviewed, primary academic literature; multiple independent papers corroborate the same mechanism) — the strongest-tier evidence in this report.

- Kim & Kankanhalli's finding, from a field study of a new enterprise system rollout: **switching costs play the central mediating role** in driving user resistance to a new system — and switching costs also mediate the effect of *colleague opinion* and *self-efficacy for change* on resistance. Counteracting levers found effective: **perceived value** of the new system and **organizational support for change**.
- Polites & Karahanna's extension: habitual use of the **incumbent** system negatively shapes perceptions of the new one; habit plus rationalized transition costs plus sunk-cost-driven psychological commitment together build **inertia** — and inertia was shown to **fully mediate** the effect of both incumbent-system habit and switching costs on new-system acceptance. In plain terms: it's not that people rationally weigh the new tool against the old one and choose the old one — habit and sunk cost make them not really weigh it at all.
- A separate ERP-adoption study decomposes "switching cost" into subtypes and finds **uncertainty costs** and **sunk costs** directly increase resistance, while **transition costs** and **loss costs** increase resistance *indirectly*, by reducing the perceived value of switching. It also notes anxiety produces status quo bias **even when there is no explicit cost** to switching — uncertainty aversion alone is enough.
- A 2016 meta-analytic review found the status-quo-bias model holds up broadly across the IS-adoption literature, with one notable exception: perceived monetary rewards did **not** significantly predict switching intention in the aggregated data.

**How it would translate to a studio driving a real job:** this is the closest thing in the academic literature to a formal diagnosis of the exact symptom Kody described ("get excited to set things up, then pop back out into their manual ways"). The mechanism this research identifies is not "the studio doesn't understand the value" — it's **switching cost and habit-driven inertia**, which the research says is only partly rational (uncertainty and sunk-cost anxiety operate even with zero real switching cost). The counter-levers this literature actually validates are *reducing perceived uncertainty* ("will this work for my next real job, not just this demo") and *reducing perceived transition cost* (not having to redo work already done in the old system) — not more features, more polish, or more encouragement.



---

## 8. The "quiet reversion" pattern — CRM adoption failure and spreadsheet stickiness

**Source:** Multiple CRM-vendor and consulting analyses (Salesforce-ecosystem commentary, G2's CRM adoption guide, Zoho's spreadsheets-vs-CRM piece, HubSpot 2024 data cited secondhand).
**Evidence tier:** VERIFIED (vendor/case-study) for the named statistics; the underlying mechanism description is consistent across multiple independent, non-affiliated vendor sources, which raises confidence in the pattern even though no single peer-reviewed study anchors it.

- The recurring, independently-described failure pattern: users experience the new system as **added manual burden on top of their real work**, without an immediately obvious personal payoff ("what's in it for *me*, not my manager's reporting"). **Without announcing it, teams quietly revert** — back to spreadsheets, email folders, even paper — while the CRM "sits idle and unused." One source frames it precisely: employees "would rather pull data from different sources and work with spreadsheets... because it seems easier than navigating through the complicated CRM."
- Cited statistics: **43%** of CRM implementations fail specifically due to poor team adoption (vs. only ~6–10% attributable to actual software defects, per one Salesforce-ecosystem estimate, with ~60% "people-related" and ~30% "process-related"). **40%** of salespeople still use informal spreadsheets/email to store customer data despite having a CRM (HubSpot, 2024, cited secondhand). **55%** of CRM implementations still fail to meet objectives, attributed mainly to data-entry friction and adoption. Notably, organizations reportedly spend **80% of implementation effort on technology configuration and only 20% on adoption/process** — the inverse of where the failure risk sits per this research.
- Why spreadsheets specifically are sticky (Zoho): they're "clean, plain, and easy to get used to... there are problems, but they are problems we can understand and expect" — i.e. familiar failure modes are experienced as *lower* risk than an unfamiliar tool's unknown failure modes, a direct echo of the uncertainty-cost finding in Section 7.

**How it would translate to a studio driving a real job:** this is a second, independent line of evidence (commercial rather than academic) converging on the same diagnosis as Section 7 — manual double-entry burden plus no immediate personal payoff is the proximate trigger for reversion. It sharpens the constraint: any field or step Patina asks the studio to fill in that she isn't already, in that moment, doing for a real reason (not "for the system") is a reversion risk, regardless of how well-designed the field is.

---

## 9. The IKEA effect — labor on a *completed* task increases attachment

**Source:** Norton, Mochon & Ariely, "The IKEA Effect: When Labor Leads to Love," *Journal of Consumer Psychology* 22 (2012), 453–460 (originally HBS working paper 11-091, SSRN 2011).
**Evidence tier:** VERIFIED (peer-reviewed, primary — findings independently corroborated across multiple citing sources, and I found consistent statistical detail, including the specific t-statistic, across the search results).

- Across four studies (IKEA box assembly, origami folding, Lego building), self-built, low-skill creations were valued by their builders as **similar in value to experts' creations** — and builders expected others to share that assessment (they generally didn't).
- In the Lego study specifically, participants' bids for their **own** creation were roughly **double** their bids for an identical creation built by someone else (statistically significant, t(39) = 3.08, p < .01).
- **Critical boundary condition:** the effect requires **successful completion**. When participants built something and then it was **destroyed**, or they failed to finish it, the IKEA effect **disappeared entirely**. The effect held for both hobbyists and complete novices — expertise wasn't required, just a completed act of labor.

**How it would translate to a studio driving a real job:** the practical reading is narrow but important — asking a studio to invest effort building something in Patina (a schedule, a client update, a first job page) can genuinely increase her attachment to it, *but only if she finishes it and it survives*. This is a direct design constraint, not just an opportunity: partial, abandoned setup flows get no benefit from this effect, and — more sharply — if Patina's system loses, resets, or silently overwrites something the studio built by hand (a known Patina failure mode elsewhere in the codebase, e.g. studio-loading races noted in project memory), it actively destroys the exact psychological asset this research says labor creates.

---

## 10. The endowed progress effect — a pre-filled head start increases completion, but only when it's honest

**Source:** Nunes & Drèze, "The Endowed Progress Effect: How Artificial Advancement Increases Effort," *Journal of Consumer Research* 32(4), 2006, 504–512.
**Evidence tier:** VERIFIED (peer-reviewed, primary — the field-experiment numbers were consistently reported across sources).

- Field experiment at a real car wash: 300 customers randomly given one of two loyalty cards, both requiring **8 paid washes** for a free one. Card A: 8 empty stamp circles. Card B: **10** circles with **2 already stamped** (same net requirement — 8 more washes either way).
- Over 9 months: **34%** of Card B (pre-stamped) customers redeemed the reward vs. **19%** of Card A (blank) customers — roughly **79% higher relative completion** from an identical actual requirement, purely from how the starting point was framed. Pre-stamped customers also returned faster as they neared completion.
- **Critical caveat, explicitly tested and reported:** the effect **disappeared when no reason was given for the head start**. The reason could be arbitrary (e.g. "a special promotion") — but *some* stated reason was required for the effect to hold.
- Related replication/extension work (Kivetz, Urminsky, Zheng) found effort accelerates as a function of **proportional** distance remaining, not absolute distance remaining — consistent with the mechanism (a "closer to done" feeling drives continued effort, independent of the literal count).

**How it would translate to a studio driving a real job:** this is the mechanism-level explanation for *why* import-first onboarding (Section 4) and human-loaded first jobs (Section 3) should outperform an empty setup flow — a studio whose real job data is already sitting in Patina on day one isn't just saving retyping time, she's also getting a documented psychological completion-rate boost, **provided the reason for the head start is stated honestly** ("we pulled this in from what you sent us"). The explicit warning from the same research: manufacturing a *fake* sense of progress with no real basis for it is the one condition under which the effect is known to fail — which converges directly with Section 11's finding on manipulative gamification.

---

## 11. Setup checklists and empty states — effect sizes and design limits

**Source:** Userpilot's 2025 SaaS Product Metrics Benchmark Report (547 companies; 188 companies specifically for checklist data); Appcues customer case studies (MYOB, Appointlet, Blip, GoToWebinar); Kompassify/Pixxen/Eleken empty-state design guides.
**Evidence tier:** VERIFIED (vendor/case-study) — population-level Userpilot numbers are the more reliable end of this tier; individual Appcues customer results are single-case and not independently audited.

- Userpilot's population data (547 SaaS companies): average activation rate **37.5%**; average onboarding **checklist completion is 19.2%** (median **10.1%**) across the 188 companies studied that use checklists at all. **Sales-led** companies out-complete **product-led** companies on checklists (22.1% vs 19%) — plausibly because a human CSM is nudging the user through it in parallel, making the checklist a shared human+UI artifact rather than a UI element alone.
- Named case results (single-company, not population-level): **MYOB** saw a **21%** lift in global setup-rate after introducing Appcues checklists (one product line went from a 14% baseline). **Appointlet** saw free-to-paid conversion rise from 2.79% to 5.85% (**+210%** relative) within 3 months of introducing checklists. **Blip** saw a **124%** activation increase and a **9.7×** reduction in time-to-value using Appcues flows (not checklists specifically). One Appcues practitioner reported raising her own checklist completion from **2% to 25%** simply by **breaking one long checklist into several bite-sized ones**.
- Design constraint reported consistently: checklists with **more than 5 items** see meaningfully lower completion; the standing guidance is to cut the list to the **top 3–5 actions** that actually reach the activation goal.
- Empty-state framing (Kompassify, and corroborated independently by NN/g's general progressive-disclosure logic in Section 5): for a brand-new account, **the empty state effectively is the product** — most SaaS value lives in the user's own data, and a blank first screen with no guidance forces the user to invent her own first move from nothing. Named examples of empty states doing onboarding work: Slack replaces "No channels" with "You're in. Let's create your first channel"; Notion fills the empty state with demo content that doubles as an interactive tutorial with no downside to misuse.

**How it would translate to a studio driving a real job:** if Patina uses any checklist mechanic at all, the evidence says: keep it to 3–5 items, tie every item to something concrete and job-real (not "complete your profile"), and prefer a first-session, human-assisted version over a pure self-serve one (per the SLG-vs-PLG completion gap). The empty-state finding sharpens the diagnosis of Kody's problem: whatever screen the studio lands on right after excitement fades is either doing real onboarding work (showing her own real job) or it is, functionally, the product's answer to "now what" — and a generic blank dashboard fails that test regardless of how good the rest of the portal is.

---

## 12. Gamification, streaks, and badges — the literature independently arrives at Patina's own constraint

**Source:** Kompassify, "Onboarding Gamification: What Works in B2B SaaS (and What Backfires)"; Gatilab's SaaS onboarding playbook; The Decision Lab, "Streak Creep: When Gamified Engagement Mechanics Backfire"; Userpilot's gamification-examples piece; CDT's 2026 taxonomy of dark patterns in AI products (adjacent, not B2B-specific).
**Evidence tier:** INFERRED/secondary for most of this section — these are practitioner blogs, not peer-reviewed studies, though the underlying "streak creep"/loss-aversion mechanism they invoke is grounded in established loss-aversion research (not independently re-verified by me this pass — flagged for follow-up if needed).

- The strongest, most B2B-specific claim, stated bluntly by Kompassify: **"Never gamify a weekly-rhythm product with streaks. You are punishing users for using the product exactly as intended."** Their proposed dividing line: does the mechanic mark **real progress**, or manufacture a reason to keep clicking? "Gamify progress, not activity."
- Gatilab's framing, aimed squarely at products like Patina's category: **"Habit-formation tactics work for products with daily intent (Duolingo, Strava, Calm) and almost never work for products with weekly or monthly intent (project management, accounting, CRM). Forcing daily engagement on a weekly product feels invasive and accelerates churn."** They further argue that teams that reach for streaks/badges/push-notifications are usually **compensating for a broken activation stage upstream**, not solving a real problem.
- The Decision Lab's "streak creep" mechanism: streak/loss-framed mechanics can crowd out **intrinsic** motivation for the underlying task, turning it into something done "for the sake of the streak" rather than the work itself — and the effect is brittle: once a user loses a streak or stops caring about it, the manufactured motivation collapses with it, sometimes taking real engagement down with it.
- A practical ethics test surfaced across these sources: gamification is roughly benign when the company's interest and the user's interest are aligned (their example: Duolingo — the company wins when the user learns the language, so does the user) and closer to exploitative when the company's interest diverges from the user's own goal, especially when the mechanic cannot be turned off without penalty.
- The consensus alternative offered across all of these sources: a plain, honest, real-milestone-tied progress indicator — **not points, streaks, or badges** — is described repeatedly as "the strongest mechanic is the least game-like."

**How it would translate to a studio driving a real job:** this section is less a lever to add and more an independent confirmation, from outside the Patina org entirely, of a constraint the vision doc already states as non-negotiable ("never optimize the studio surface for engagement... no dashboards, tab bars, badges, red/green status"). The practical value for the leadership/beta-studio audience is that this isn't just Patina's internal taste — mainstream B2B growth practice has independently converged on the same rule for weekly/monthly-intent tools, and treats reaching for streak/badge mechanics as a **symptom that the real activation problem was never solved**, which is a useful frame for why "make it more fun" is not on the table as a fix for this specific problem.

---

## 13. White-glove/high-touch onboarding economics (weaker tier — flagged)

**Source:** A cluster of CS-vendor blogs (Intercom-cited, Gainsight-cited, Bain-cited, McKinsey-cited — all secondhand, none independently traced to the named source's own publication in this search pass), plus the Superhuman/First Round Review account already covered in Section 2.
**Evidence tier:** INFERRED/secondary, explicitly flagged by the search tool itself as likely-unreliable — multiple of these numbers (Intercom's 62%/34%, Gainsight's "2x NRR," Bain's "25-50% LTV increase," a "2027 Gainsight NRR study") appeared only as secondhand citations inside vendor round-up blogs (UserGuiding, Saasfactor, Custify), several of which reuse the same figures across their own blog networks without a traceable link to the named source's original publication. Treat every number in this section as **unverified** until traced to its primary source.

- Directionally, and independent of the specific numbers: every source in this cluster agrees that human-assisted onboarding outperforms pure self-serve on activation and early retention, and that the economics of paying for that human time scale with contract value (rough vendor consensus: white-glove becomes worthwhile somewhere in the $25–32K ACV range for typical B2B SaaS, though this specific crossover figure is itself only a single vendor's estimate).
- The one number in this cluster I'd treat as closer to solid: the Superhuman/First Round account (Section 2) of white-glove-then-graduate-to-self-serve is a named, specific, corroborated company history, not an aggregated statistic, and is the strongest evidence in this section.

**How it would translate to a studio driving a real job:** given the tier-2 reliability here, this section should be read as "directionally consistent with Section 2, not independent new evidence" rather than as its own standalone data point — I'd avoid citing the specific percentages from this section in the leadership deck without re-tracing them to Intercom/Gainsight/Bain's own publications first.

---

## Sources index (all URLs surfaced this pass)

- Reforge PLG-activation guide: https://www.reforge.com/guides/enable-plg-led-activation (paywalled)
- GrowthPigeon, Setup/Aha/Habit breakdown: https://growthpigeon.com/articles/setup-aha-habit-saas-activation-moments
- Digital Applied, 2026 TTV metrics framework: https://www.digitalapplied.com/blog/customer-onboarding-time-to-value-2026-saas-metrics-framework
- Amplitude, "Time to Value: The Key to Driving User Retention": https://amplitude.com/blog/time-to-value-drives-user-retention
- First Round Review, "How Superhuman Built an Engine to Find Product/Market Fit": https://review.firstround.com/superhuman-onboarding-playbook/
- Mind the Product, "The Product Market Fit Engine by Rahul Vohra": https://www.mindtheproduct.com/the-product-market-fit-engine-by-rahul-vohra/
- Paul Graham, "Do Things That Don't Scale": http://paulgraham.com/ds.html
- Notion Help Center, import: https://www.notion.com/help/import-data-into-notion
- Candu, Notion onboarding teardown: https://www.candu.ai/blog/how-notion-crafts-a-personalized-onboarding-experience-6-lessons-to-guide-new-users
- Candu, Airtable onboarding wizard teardown: https://www.candu.ai/blog/airtables-best-wizard-onboarding-flow
- Linear Docs, import issues: https://linear.app/docs/import-issues
- Linear Docs, Jira: https://linear.app/docs/jira
- Linear, migration guide: https://linear.app/switch/migration-guide
- NN/g, "Progressive Disclosure": https://www.nngroup.com/articles/progressive-disclosure/
- NN/g, "Onboarding Tutorials vs. Contextual Help": https://www.nngroup.com/articles/onboarding-tutorials/
- Chris Dixon, "Come for the tool, stay for the network": https://cdixon.org/2015/01/31/come-for-the-tool-stay-for-the-network/
- NFX, "The Network Effects Bible": https://www.nfx.com/post/network-effects-bible
- Adam Fishman, "Crossing the Chasm from Single to Multiplayer": https://www.fishmanafnewsletter.com/p/crossing-the-chasm-from-single-to-multiplayer
- Kevan Lee, "Single player vs. multiplayer": https://newsletter.aroundthebonfire.com/p/212-single-player-vs-multiplayer
- TechCrunch, counterargument: https://techcrunch.com/2016/12/01/come-for-the-tool-stay-for-the-network-reconsidered/
- Kim & Kankanhalli 2009, MIS Quarterly (abstract/record): https://dl.acm.org/doi/10.5555/2481626.2481634
- Polites & Karahanna 2012, "Shackled to the Status Quo": https://www.academia.edu/55480137/
- Status quo bias meta-analytic review: https://www.researchgate.net/publication/310111264
- ERP switching-cost-subtypes study: https://www.researchgate.net/publication/252061253
- Nunes & Drèze 2006, "The Endowed Progress Effect," JCR (open-access PDF via Harvard DASH): https://dash.harvard.edu/bitstreams/7312037d-2473-6bd4-e053-0100007fdf3b/download
- Silicon Canals summary of the car-wash study: https://siliconcanals.com/t-car-wash-loyalty-cards-endowed-progress/
- Norton, Mochon & Ariely 2012, "The IKEA Effect," JCP (SSRN working paper): https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1777100
- Userpilot, onboarding checklist completion benchmarks: https://userpilot.com/blog/onboarding-checklist-completion-rate-benchmarks/
- Appcues, MYOB case study: https://www.appcues.com/customer-stories/how-myob-increased-new-user-activation-by-21-with-thoughtful-personalized-onboarding
- Appcues, Blip case study: https://www.appcues.com/blog/take-net-activation-ttv-case-study
- Kompassify, empty states guide: https://kompassify.com/blog/empty-states-guide
- Kompassify, onboarding gamification guide: https://kompassify.com/blog/onboarding-gamification-guide
- Gatilab, SaaS onboarding playbook: https://gatilab.com/saas-onboarding/
- The Decision Lab, "Streak Creep": https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification
- Zoho, "Spreadsheets, CRM: do you have to switch?": https://www.zoho.com/au/tech-talk/spreadsheets-crm-do-you-have-to-switch.html
- G2, "CRM Adoption: 4 Proven Techniques to Improve It": https://learn.g2.com/crm-adoption

---

## Implications (evidence-only phase — noted per lane instructions, not a proposal)

- Three independent research traditions — B2B growth practice (Reforge/Amplitude), academic IS-adoption theory (Kim & Kankanhalli, Polites & Karahanna), and CRM-vendor field experience — converge on the **same root cause** for Kody's stated symptom: switching-cost/status-quo inertia plus a lack of immediate, personal, real-work payoff, not a UX-polish problem or a "studios don't understand the value" problem.
- The literature's own recommended fixes for that root cause (reduce uncertainty cost, reduce transition cost, deliver value that doesn't require re-entering already-known data, deliver it inside the first session) point toward the **same territory** as the vision doc's existing constraints (single surface, no engagement optimization, "won't notice Patina") rather than away from it — the research and the vision were not in tension anywhere this pass surfaced.
- The literature also independently arrives at Patina's existing ban on streaks/badges/dashboards for a weekly-or-slower-cadence B2B tool (Section 12), and flags reaching for gamification as a **symptom of an unsolved upstream activation problem** rather than a fix — worth stating explicitly to Leadership/Beta Studios as external validation, not just an internal taste call.
- The endowed-progress and IKEA-effect research (Sections 9–10) both carry an explicit **honesty/completion condition** for the effect to hold — any proposal downstream of this report that pre-fills progress or asks for studio labor should be checked against "is this real, attributable, and will it survive," not just "does it look encouraging."
- The weakest evidence in this report (Section 13, and the unverified completion-rate percentages in Sections 5 and 11) should not be quoted to Leadership/Beta Studios without re-tracing to the primary source first — they are flagged inline above.

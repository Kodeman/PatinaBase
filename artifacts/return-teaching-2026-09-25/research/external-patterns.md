# Returning-user teaching and feature introduction: external patterns

Intended path: `artifacts/return-teaching-2026-09-25/research/external-patterns.md` (scope refused for executor; see ticket comments).

Research for: quietly teach a returning designer one thing, introduce new releases properly, and manage teaching across a studio's lifecycle, without optimizing the studio surface for engagement. Compiled 2026-09-25. Bracketed numbers point to Sources. Vendor-published numbers (Chameleon, Pendo, Userpilot) are marked as vendor data. They come from sellers of tours, so read them as upper bounds.

## §1 Patterns worth adopting

1. **Pull over push.** Launch tutorials and "What's New" modals are "push revelations" that are "pushy, devoid of context, and intrusive." Contextual help, "triggered by some signal that the user would benefit from that information at that moment," works better. *Example:* Figma shows a text tip only when you add a text box. [1]
2. **Teach at the anchor, one thing at a time.** Hints work best when shown "one-by-one, at the right moment," each focused on a single interaction. Guidance should sit near the interface it describes. *Example:* YouTube Android shows one hint per unfamiliar gesture, at the point where you reach that gesture. [2][13]
3. **Put interruptions at coarse task boundaries.** Controlled studies found that interrupting at predicted "best" moments (coarse breakpoints between subtasks) reduced annoyance and frustration. Mid-subtask interruptions increased them. The 2005 follow-up also found shorter resumption lag. Coarse breakpoints cost less because the person only has to recall the next chunk, not where they were inside one. For Patina, "after finishing a unit of work" beats "on page load." [10][11][12]
4. **Let people start it themselves.** In Chameleon's 550M-data-point analysis (vendor data), click-triggered tours reached 67% completion versus 31% for tours fired after a set delay. [18]
5. **Retire a lesson once the behavior happens.** Apple's HIG says "people who've already used a feature won't appreciate viewing a tip that describes it." TipKit builds this in with eligibility rules, `invalidate(reason:)` and `MaxDisplayCount`. *Example:* TipKit. [14][16]
6. **Set a global cadence cap.** The HIG suggests that when an app has several tips, they display "at a reasonable cadence — for example, once every 24 hours." Pendo, Appcues and Chameleon all ship app-wide throttles. [14][23][27][21]
7. **Keep it short.** Keep tips to "one or two sentences." If a feature takes more than three actions, it's "probably too complicated for a tip." Keep tooltips to 60–75 characters. Tours longer than 4–5 steps lose roughly half their completions (vendor data). [14][18][19]
8. **Keep a cumulative "what changed," but make people pull it.** Apple's iWork "What's new" pages say "Updates are cumulative… You can see all the new features included with each release." A common in-app pattern stores the last-seen entry ID and shows an unread dot until the user opens the list. It becomes a "blinking dot that never goes away" if every small change counts. [17][36]
9. **Release notes as written prose on a steady rhythm.** Linear posts every 1–3 weeks, with a narrative headline section followed by area-tagged fixes. Arc's notes are called "well-written, engaging" and tell "short stories about the decision-making process." Slack keeps a playful human voice. [37][50][46]
10. **Match the channel to the size of the change.** Classify updates by "workflow impact, affected audience size, and reversibility." Put in-app messages at contextual moments, email for inactive users, and the changelog for minor patches. Reserve modals for workflow-changing releases. [22][36]
11. **Tell the people who asked.** Notifying the users who requested or reported something, "instead of sending a generic changelog that no one reads," confirms their input shaped the product. [35]
12. **Offer a human session for depth.** Superhuman offers a bookable 1:1 onboarding session, and its product hints show "the shortcut for next time" without breaking flow. [47]
13. **Progressive disclosure and "training wheels."** Defer advanced features. In Carroll & Carrithers' study, novices on a reduced-function word processor learned faster and performed better. A control group spent almost a quarter of their time recovering from errors the reduced interface blocked. The study was small (n=6 per group). [4][5][6]
14. **Hold catch-up until the person is back.** Basecamp's "Work Can Wait" holds notifications outside work hours, and "Catch me up" sends one summary of what happened while you were away. [51]

## §2 Anti-patterns to avoid

1. **Launch-time tours and What's-New modals.** "Users frequently skip them," and the content is "hard to remember when the user needs it." Short-term memory of an out-of-context hint fades in about 20 seconds. [1][2]
2. **Chains of coach marks.** "Bombarding users with frequent hint screens causes them to dismiss hints more quickly": "think shot glass, not beer tankard." Tours of 7+ steps show about 16% completion (vendor data). [2][18]
3. **Overlays right after login or mid-task.** Users arrive "with a next step in mind"; "Users hate being interrupted." Stacked popups multiply the cost. [3]
4. **Critical information inside a modal.** "People tend to close them without reading." Use a distinct in-page module instead. [3]
5. **"New" badges everywhere.** Badges suffer "red dot blindness": "If everything has a badge, none of them feel important anymore." Badges at the edge of navigation also suffer change blindness, because people are "less sensitive to small changes at the edges of their visual field." [7][9]
6. **Anything that looks like marketing.** Banner blindness makes users ignore elements they perceive as promotional, including internal ones. Apple says a tip should never be "promotional or related to a different feature or user flow." [8][14]
7. **Explaining the obvious.** "Skip the obvious stuff." Avoid "explaining how standard components or patterns work." [1][14]
8. **Tours you can't bring back.** NN/g documents a tutorial that couldn't be relaunched. Apple: if skipped, "don't present it again… but make sure it's easy for people to find." [1][13]
9. **Unbounded overrides.** Pendo's "Ignore guide throttling" exists, but Pendo warns that overuse "can lead to multiple guides appearing simultaneously." [23]
10. **Mandatory tours.** In vendor data, skippable tours outperform mandatory ones by about 25%, and "the dismiss option should never feel punishing." [33]

## §3 Tool-by-tool notes

- **Linear.** *Mechanism:* a public changelog with a hero feature, docs links and area-tagged Fixes/Improvements. Discovery happens through the searchable `?` shortcuts help and the Help & Feedback menu. Users can show unread notifications as a count or a dot, or hide sidebar badges entirely. *Cadence:* every 1–3 weeks. *Dismissal:* nothing forced. *Cumulative:* chronological page, with no per-user diff found. [37][38][39][40]
- **Figma.** *Mechanism:* a filterable release notes page ("clear headings, short descriptions, direct links"), a visual "What's New" showcase, and a release-notes section always reachable from the in-app launcher. Modals are used for major features, and contextual tips appear on first use of a tool (the text-box tip). Hands-on practice files exist for some launches. *Cadence:* continuous, plus event recaps (Config, Schema). *Dismissal:* modal close. *Cumulative:* archive only. [41][42][1]
- **Notion.** *Mechanism:* a "What's New" releases page reachable from Help & support at the bottom of the sidebar. Rollouts are staged, and announcements usually come after the rollout completes. No documented in-app "New" tagging system was found. *Cadence:* frequent. *Dismissal:* none needed (pull). *Cumulative:* archive. [44][45]
- **Slack.** *Mechanism:* three layers. A monthly "Slack updates and changes" page, a "What's new" page with one summary per feature linking to more, and per-platform release notes in a conversational voice. *Cadence:* monthly feature roundups, app releases every 2–4 weeks. *Dismissal:* pull. *Cumulative:* dated archive. [46]
- **Superhuman.** *Mechanism:* teaching is built into the tools. Hovering an icon shows its shortcut, and Cmd+K shows "the shortcut for next time." A bookable 1:1 onboarding session is offered, and a third-party writeup reports a bottom-of-screen nudge when you use the mouse. *Cadence:* continuous, tied to behavior. *Dismissal:* transient. *Cumulative:* n/a. [47][48]
- **Raycast.** *Mechanism:* a custom post-update flow "that shows 'what's new' after updating in a natural for Raycast way," with rich images. Per-platform changelogs and a full "New in v2" manual page are "grouped by where you'll find it." *Cadence:* frequent. *Dismissal:* per update. *Cumulative:* shown per update, and v2 gets a full cumulative page. [49]
- **Arc.** *Mechanism:* an in-app release notes page (start.arc.net/release-notes) plus full notes in the help center. Update notifications are "non-intrusive" and install "at their convenience." *Cadence:* weekly ("Every Thursday"). *Dismissal:* non-blocking. *Cumulative:* archive. [50]
- **Basecamp.** *Mechanism:* notification scheduling ("Work Can Wait") and "Catch me up if anything happened after hours" summaries. Internally, whoever shipped the work writes a Deployments post "that explains what's new." *Cadence:* per ship. *Dismissal:* n/a. *Cumulative:* the catch-up summary is cumulative. [51]
- **Stripe.** *Mechanism:* separate product and API changelogs. The product log is filterable by product with short titles and tags. The API log is organized by version, with breaking-change filters. No in-Dashboard "What's new" panel was documented. *Cadence:* continuous. *Cumulative:* the API version log is explicitly cumulative. [52]
- **GitHub.** *Mechanism:* a changelog with Release/Improvement/Retired types, product tags and per-tag RSS feeds. A Feature preview dialog lets people opt in or out of each public-preview feature. *Cadence:* near-daily. *Dismissal:* a per-feature toggle, with no global off. *Cumulative:* filterable archive. [53]
- **Apple (iOS/iWork).** *Mechanism:* TipKit tips with rules, a global `displayFrequency`, a per-tip `MaxDisplayCount`, and permanent invalidation. The HIG recommends optional onboarding and context-specific tips. iWork keeps cumulative "What's new" guide pages. *Cadence:* tips at most about once every 24h (HIG example). *Dismissal:* invalidation is permanent. *Cumulative:* yes (guide pages). [13][14][15][16][17]

## §4 A generic content model for in-house feature education

Synthesized from TipKit, Pendo, Appcues, Chameleon, Intercom and Userflow [15][16][23][24][27][28][21][29][30][31][32].

**Entities**
- **Release**: id, date, prose note (the changelog entry), size class (minor / useful / workflow-changing [36]), and the lessons it introduces.
- **Lesson**: one feature and one benefit. It holds the anchor (the surface or element it attaches to), 1–2 sentences of copy, an optional "learn more" link (help article or deep dive), a *success event* (the action that proves it was learned), eligibility rules, a priority, `max_displays` (default 2), and an optional `supersedes`.
- **Seen-state** (per person, per lesson): first/last shown time, display count, and a terminal outcome. The outcome is `acted` (success event fired), `dismissed_permanent` ("Got it"), `closed` (X, counts as a display), `retired_max`, `already_knew` (success event fired before any display), or `superseded`.
- **Person cursor**: `last_seen_release_id`, `last_active_at`, and the last unsolicited lesson time. It is per *person*, not per studio. A new hire at an established studio still gets first-run treatment (synthesis; see §6).

**Triggers** (in preference order)
1. *Pull*: the person opens the What's-new list or Help. This is uncapped, and viewing it moves the release cursor forward.
2. *Anchor arrival at a task boundary*: the person reaches the lesson's surface after finishing a unit of work there, not on page load [11][12].
3. *Return*: the first session after a gap. It produces at most one quiet, non-modal line pointing to the cumulative list, never a tour [1][3].

**Eligibility** (all must hold): the feature is live for this person (flag, plan, role); the success event has *not* fired (TipKit-style rule [14]); the lesson is not terminal in seen-state; any prerequisite lesson is terminal; and the person is not mid-task or in a flagged high-stakes flow (NN/g's bank dispute example [1]).

**Caps**
- A global cap of at most one unsolicited lesson per session and per 24h [14]. Chameleon counts unique experiences against its limit [21]. Pull triggers are exempt.
- A per-lesson `max_displays` cap, then retire. Mirrors TipKit `MaxDisplayCount` and Appcues "Show X times" [16][27].
- An override for workflow-changing releases only. Pendo warns overuse stacks guides [23].
- Ranking: never-seen before seen, then oldest-seen, then priority, then oldest-created. This is Userflow's documented tie-break [32]. Appcues shows one flow per page view and ranks by weight, then publish date [28].

**Dismissal semantics**: "Got it" is permanent. Closing with X counts as a display and retires the lesson at `max_displays`. Dismissing one lesson does not suppress unrelated lessons, but repeated dismissals should lengthen the global interval (a back-off is our synthesis, not a vendor feature). A skipped item must stay findable in Help [13].

**Cumulative list**: entries newer than `last_seen_release_id` are "unread." Show a dot rather than a count [9][36]. Opening the list clears it, and minor releases never set the dot.

## §5 Measurement candidates that respect the promise

The unit of success is *a designer did the thing they could not or did not do before*. Time-in-app, sessions, DAU and streaks are never success measures. Pendo's own data says 80% of features in an average product are rarely or never used (vendor data), so adoption of the right feature is the honest target [26].

1. **Lesson → first use within N days.** Share of people shown a lesson whose success event fires within 7 or 14 days. This is Pendo's "guide goal": "how many visitors performed a specific action after viewing the guide." Pendo can overlay feature clicks on guide views [24][43].
2. **Against a holdout.** Compare with a randomized unshown segment, or at minimum a before/after comparison. Pendo recommends "randomized samples" and says: "Be sure you can measure the before and after state." [25] Without a holdout, adoption that would have happened anyway gets credited to the lesson.
3. **Time-to-first-use from release date**, shown vs. not shown. Chameleon frames "Speed" and time-to-value as key onboarding metrics [20].
4. **`already_knew` rate.** Lessons whose success event fired before display. A high rate means we are teaching the obvious, so cut the lesson [1][14].
5. **Pull ratio.** Share of lesson views that were user-initiated. Chameleon tracks "user-initiated onboarding triggers" and "return visits to onboarding resources" [20].
6. **Learn-more opens and support-question reduction.** Help-article opens after a lesson, and support questions that mention the feature. Userpilot's Groupize case describes "more focused and specific" tickets after on-demand help (vendor case) [34].
7. **Harm signals** that stop or back off a lesson: close-without-read rate, a quick X after appearance, and repeat dismissals [2][3].
8. **Guardrail.** If a lesson raises time-on-surface without raising the success event, count it as a failure, not a win.

Published caps to start from: one tip per 24h (Apple [14]); account-wide "no more than 1 per hour" (Appcues example [27]) and "1 Tour per hour" (Chameleon example [21]); 3–4 steps maximum for any tour (vendor data [18][19]). The Apple guidance fits a studio surface best. The vendor hourly examples are too aggressive for "the studio won't notice Patina."

## §6 Open questions the research could not settle

1. **Dormancy thresholds.** No primary study supports specific 7/30/90-day re-onboarding tiers. The 30/60/90 bands appear only in vendor and consumer guides. Userpilot argues activation status matters more than elapsed time [34]. Patina should set thresholds from its own gap distribution.
2. **Welcome-back copy.** No B2B evidence was found on whether an explicit "welcome back" line helps or reads as surveillance.
3. **Studio vs. person scope.** None of the platforms model a team where a veteran owner and a brand-new hire share one surface. Per-person seen-state is our synthesis. Whether the owner should be able to hand-pick lessons for new hands is unaddressed.
4. **"New" badge click-through.** No A/B data on badge effectiveness in professional tools was found. The badge-blindness evidence is observational or adjacent [7][8][9].
5. **Holdout ethics at small scale.** A few dozen studios may be too few for a statistically useful holdout. The minimum viable sample size is unresolved.
6. **In-app surfaces not publicly documented** for Linear, Notion and Stripe (any per-user "since last visit" diff). Those notes cover only documented behavior.
7. **Vendor bias.** Completion and adoption figures come from companies selling tours, and no independent replication was found.

## Sources

1. NN/g, Onboarding tutorials vs. contextual help — https://www.nngroup.com/articles/onboarding-tutorials/
2. NN/g, Instructional overlays and coach marks — https://www.nngroup.com/articles/mobile-instructional-overlay/
3. NN/g, Popups: 10 problematic trends — https://www.nngroup.com/articles/popups/
4. NN/g, Progressive disclosure — https://www.nngroup.com/articles/progressive-disclosure/
5. NN/g, Training wheels user interface — https://www.nngroup.com/articles/training-wheels-user-interface/
6. Carroll & Carrithers (1984), Training wheels in a user interface, CACM — https://dl.acm.org/citation.cfm?id=358218
7. NN/g, Change blindness — https://www.nngroup.com/articles/change-blindness/
8. NN/g, Banner blindness revisited — https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/
9. Braze, Red dot blindness — https://www.braze.com/resources/articles/beware-red-dot-badging
10. Frontiers in Psychology (2024), Opportune moments for task interruptions — https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1465323/full
11. Adamczyk & Bailey (2004), If not now, when? CHI — https://dl.acm.org/doi/10.1145/985692.985727
12. Iqbal & Bailey (2005), Mental workload as a predictor of opportune moments, CHI — https://www.interruptions.net/literature/Iqbal-CHI05-p1489-iqbal.pdf
13. Apple HIG, Onboarding — https://developer.apple.com/design/human-interface-guidelines/onboarding
14. Apple HIG, Offering help — https://developer.apple.com/design/human-interface-guidelines/offering-help
15. Apple, TipKit — https://developer.apple.com/documentation/tipkit
16. Apple, TipKit `Tip` protocol — https://developer.apple.com/documentation/tipkit/tip
17. Apple Support, What's new in Keynote on iPhone — https://support.apple.com/guide/keynote-iphone/whats-new-tan700f60676/ios
18. Chameleon, What 550M data points say about your product tour — https://www.chameleon.io/blog/mastering-product-tours
19. Chameleon, Benchmark Report 2023 — https://www.chameleon.io/benchmark-report-2023
20. Chameleon, Hidden metrics of effective product tours — https://www.chameleon.io/blog/effective-product-tour-metrics
21. Chameleon Help, Rate limits — https://help.chameleon.io/en/articles/3513345-using-rate-limits-to-manage-experiences-frequency
22. Chameleon, Product updates — https://www.chameleon.io/blog/product-updates
23. Pendo Help, Order and throttle your guides — https://support.pendo.io/hc/en-us/articles/360031864452-Order-and-throttle-your-guides
24. Pendo Help, Set guide goals — https://support.pendo.io/hc/en-us/articles/4403525623323-Set-guide-goals
25. Pendo, Measure the effectiveness of in-app guides — https://www.pendo.io/pendo-blog/user-experiments-inapp-guides-measure/
26. Pendo, 2019 Feature Adoption Report — https://www.pendo.io/resources/the-2019-feature-adoption-report/
27. Appcues, Set flow frequency — https://docs.appcues.com/flows/setting-up-flow-frequency
28. Appcues, Set flow priorities — https://docs.appcues.com/user-experiences-targeting/flow-priorities
29. Intercom, Automatically show your product tour — https://www.intercom.com/help/en/articles/2900893-automatically-show-your-product-tour-to-the-right-customers
30. Intercom, Series explained — https://www.intercom.com/help/en/articles/4425207-series-explained
31. Userflow, Starting flows or checklists — https://docs.userflow.com/docs/guides/starting-flows-checklists
32. Userflow, Multiple active flows and hidden conditions — https://www.userflow.com/blog/multiple-active-flows-and-hidden-conditions
33. Userpilot, Why product tours get skipped — https://userpilot.com/blog/product-tour-examples/
34. Userpilot, Re-engage inactive users — https://userpilot.com/blog/reengage-inactive-users-saas/
35. Userpilot, User adoption strategies — https://userpilot.com/blog/user-adoption-strategies/
36. ReleasePad, In-app changelog widgets: build vs. buy — https://www.releasepad.io/blog/in-app-changelog-widgets-build-vs-buy/
37. Linear, Changelog — https://linear.app/changelog
38. Linear, Keyboard shortcuts help — https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help
39. Linear, Personalized sidebar — https://linear.app/changelog/2024-12-18-personalized-sidebar
40. Linear, Code Intelligence (hide sidebar badges) — https://linear.app/changelog/2026-05-14-code-intelligence
41. Figma, Release notes — https://www.figma.com/release-notes/
42. Ducalis, Figma changelog review — https://hi.ducalis.io/changelog/examples/figma-changelog-web
43. Pendo Help, Guide metrics (feature overlay) — https://support.pendo.io/hc/en-us/articles/26251637016219-Guide-metrics
44. Notion, What's New — https://www.notion.com/releases
45. Matthias Frank, Notion updates — https://matthiasfrank.de/en/notion-updates/
46. Slack: updates and changes — https://slack.com/help/articles/115004846068-Slack-updates-and-changes ; What's New — https://slack.com/whats-new ; Mac release notes — https://slack.com/release-notes/mac
47. Superhuman, Getting started — https://blog.superhuman.com/inbox-zero-in-7-steps/
48. TEDxIITGuwahati, Superhuman (third-party) — https://tedxiitguwahati.medium.com/superhuman-breaking-the-barriers-of-emailing-241df9ea07b1
49. Raycast: Changelog Gallery interview — https://www.changelogs.gallery/raycast/ ; Changelog — https://www.raycast.com/changelog ; New in v2 — https://manual.raycast.com/new-in-v2
50. Arc: Release notes — https://start.arc.net/release-notes ; Ducalis review — https://hi.ducalis.io/changelog/examples/arc-broweser-release-notes-in-app
51. Basecamp: Notifications help — https://5.basecamp-help.com/article/1177-notifications ; Jason Fried, Deployments — https://world.hey.com/jason/deployments-how-we-announce-new-features-and-updates-internally-at-basecamp-b709544e
52. Stripe: Changelog — https://stripe.com/changelog ; API changelog — https://docs.stripe.com/changelog
53. GitHub: Changelog — https://github.blog/changelog/ ; Feature preview — https://docs.github.com/en/get-started/using-github/exploring-early-access-releases-with-feature-preview
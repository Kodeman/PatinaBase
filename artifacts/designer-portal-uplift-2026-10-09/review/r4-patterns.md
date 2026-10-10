# R4: How calm-but-actionable tools surface what needs you

US-24 review panel, seat R4 (research). Author: Claude Sonnet 5.5 executor, ticket SQ-725, 2026-10-09.

Method. Web research only (WebSearch and WebFetch), plus the two inputs the ticket names: the US-24 BRIEF and `briefing/current-state.md` §4 for Patina's gaps. I did not read any other file under `review/`. Every claim about an outside tool carries a URL. Where I could only reach a marketing page, a forum post or a search snippet, I say so. Anything I could not verify is marked **UNVERIFIED**.

Evidence limits worth knowing up front:
- Capterra review pages returned HTTP 403 to direct fetch for Programa and Mydoma. The review quotes below come through search summaries of those pages, not from my own reading of the pages. Treat them as secondhand.
- Asana's official My Tasks help page would not load (navigation only). Asana appears only as a forum/blog-sourced pattern, which I did not include in the catalogue.
- "Notification budget" is not an established named pattern. A search found no source that uses the term. The nearest real practices are batching, digests, urgency tiers and frequency caps. I use "budget" below only as my own shorthand and flag it as synthesis.
- Gather (interior design software) did not surface in any search. UNVERIFIED whether it exists as a current product. Ivy is documented, but it was Houzz's product and is now sold as Houzz Pro (see P-20 sources).

---

## 1. Summary

What the calm tools have in common is that they decide, once and in advance, which small set of things may reach the person, and they hold the rest back without losing it.

Six moves recur.

1. **Separate "needs you" from "happened".** Linear's Inbox splits items needing attention from other updates by default through a Priority tab. HEY routes mail by destination rather than arrival time. Superhuman splits the inbox by who the mail is from. (P-01, P-11, P-12)
2. **Let the person postpone without deleting.** Linear snoozes a notification or triage item until a time or until new activity. HEY's Reply Later and Set Aside are piles, not alarms. (P-02, P-13)
3. **Put new arrivals at a door, outside the daily list.** Linear's Triage and HEY's Screener both make a first-contact decision a separate, deliberate act. (P-03, P-04)
4. **Show the list of "mine" and the list of "waiting on others" as different things.** Apple Reminders has an Assigned list. Basecamp's My Assignments has a "Stuff I've assigned" tab. (P-07, P-08)
5. **Let silence be informative.** Counts disappear at zero (Superhuman), groups appear only when they apply (Linear My Issues), and a hill-chart dot that does not move "is effectively a raised hand" (Basecamp's Shape Up). (P-05, P-09, P-11)
6. **Bound when and how interrupts happen.** Basecamp holds notifications outside work hours and offers a catch-up. iOS delivers a scheduled summary but lets Time Sensitive items through. Notion pushes to mobile only if a mention has gone unseen for five minutes. (P-14, P-15, P-16)

The interior-design incumbents I could check (Programa, Houzz Pro, Mydoma, Studio Designer, Design Manager, DesignFiles, Ivy) are strong on the record of a job: approvals, purchase orders, invoices, status fields, reports. From the public pages I could reach, they are much weaker on telling the designer what to do next. I found overdue purchase-order acknowledgement shown as a report (Design Manager), as manually typed date fields (Studio Designer), or not described at all (Programa, Houzz Pro, Mydoma). That is a gap in public documentation, not proof that no alert exists in the products (UNVERIFIED). Reviewers describe Studio Designer as "clunky", with "far too many menus", and Houzz Pro as having a "steep learning curve". See §3.

For Patina, the most useful reading is that the Desk already has most of the parts (a needs-you line, an overdue line, ranked job cards, an "Only what needs me" facet, a "Nothing needs your hand" empty state; `current-state.md` §4 S1, S8). What it lacks, per that same section, is an at-rest answer across all jobs for a client move, a deposit landed, a quiet vendor, a new lead, and a verified close-of-day. Section 4 below picks six patterns to fill those gaps without adding engagement chrome.

**Canon note (waived, but must be named if a direction adopts these).** Several patterns below depart from rulings the BRIEF waives: no dashboards (`docs/vision/VISION.md:58`), no tab bars anywhere in the Document (`docs/vision/VISION-DECISIONS.md:213`), no badges, status dots or pills (`docs/vision/VISION-DECISIONS.md:206`), no engagement metrics, streak, target or progress bar (`docs/vision/VISION-DECISIONS.md:209,238`). The one canon item that is NOT waived: "Never optimize the studio surface for engagement" (`docs/vision/VISION-DECISIONS.md:21`, ruling S4). Every risk line below is written against that.

---

## 2. Pattern catalogue

Scenario key (from the BRIEF): S1 Monday "what needs me"; S2 client moved; S3 vendor quiet; S4 money; S5 hand-off; S6 what's next on this job; S7 new lead; S8 close the day.

### P-01 Priority tab inside a single inbox
- **Who:** Linear Inbox. https://linear.app/docs/inbox
- **How it works:** All notifications land in one Inbox. A **Priority** tab splits "items needing attention from other updates". Linear picks what counts as Priority by default, and the user can customise it through the Priority filter in Inbox settings. Display options can toggle unread-first, badge count and grouping. (Same URL.)
- **Why it stays calm:** One list, one decision made by default, and the person can tune it later. The default does the work, so the first screen is already triaged.
- **Helps:** S1, S2, S4, S7. A Priority cut of "client moved, money, new lead" is the closest match to Leah's Monday question.
- **Risk:** Overwhelm if the default Priority is too wide, so the tab means nothing. Engagement creep if the unread badge becomes the thing people check. Linear lets users choose what the badge counts (same URL), so the badge is a decision to make deliberately.

### P-02 Snooze until a time, or until something happens
- **Who:** Linear Inbox and Linear Triage. https://linear.app/docs/inbox and https://linear.app/docs/triage
- **How it works:** In the Inbox, snoozing "hides a notification from your Inbox until the selected time", then it returns. In Triage, an issue is hidden "until a time you choose or until new activity occurs, whichever comes first". Reminders can be typed in plain words such as "Jan 3 10am". (Same URLs.)
- **Why it stays calm:** The item leaves the surface without being dropped. The person is never asked to hold it in their head. The "or new activity" clause stops a snooze from hiding a real change.
- **Helps:** S3 (snooze the chase until the vendor's stated lead time), S2 (park a client decision until Thursday's meeting), S7, S8.
- **Risk:** A snooze graveyard. If snoozed items have no cap or return surface, the quiet surface hides overdue work. Linear caps the inbox at 2,000 open notifications (P-17).

### P-03 Intake triage, kept outside the normal workflow
- **Who:** Linear Triage. https://linear.app/docs/triage
- **How it works:** Issues from integrations, from people outside the team, or created inside the Triage view land in a team-specific inbox. They are "considered to be outside the normal workflow" and are left out of all views by default. The reviewer can Accept, Decline (with a comment), mark Duplicate, or Snooze. Rejected and duplicate items go to Canceled so they do not pile up. (Same URL.)
- **Why it stays calm:** New, unvetted things never mix with committed work. Counting and ranking only begin after a deliberate accept.
- **Helps:** S7 directly. Also S5, if a hand-off is treated as an accept step ("this job is yours").
- **Risk:** A second inbox to feed. If Triage is not emptied, the new-lead queue becomes the shouting surface. Linear adds "triage responsibility" rotations on Business and Enterprise plans (same URL), which is a team feature and not relevant to a solo principal.

### P-04 The Screener: decide once, on first contact
- **Who:** HEY. https://www.hey.com/features/the-screener/
- **How it works:** "The first time someone emails you, you get to decide if you want to hear from them again." It runs after spam filtering. Decisions can be reversed from Screener History. Senders are not told they were rejected. (Same URL.) Approved senders then go to the Imbox, Feed or Paper Trail depending on type (P-12). Notifications in HEY are off by default and can be turned on selectively. (https://www.hey.com/features/)
- **Why it stays calm:** The cost of attention is paid once per sender rather than once per message. HEY's own page frames this as control and privacy; it does not use the word calm (I checked; same URL).
- **Helps:** S7. A new inquiry from an unknown party arrives at a gate, and a known past client does not.
- **Risk:** Missed opportunity. A lead rejected by reflex is invisible, so a reversible history (as HEY has) is essential. For a design studio, wrongly screening out a referral is costly.

### P-05 Groups that appear only when they apply
- **Who:** Linear My Issues, Assigned tab. https://linear.app/docs/my-issues
- **How it works:** Assigned issues are grouped by focus: urgent, SLA-bound, blockers, cycle work, other active work, triage, backlog, completed. "Some groups only appear when they apply." Inside a group, items are sorted by priority, with started issues first. Grouping can be changed in display options. (Same URL.)
- **Why it stays calm:** An empty group draws nothing. The shape of the page tells the person how their week is, and a quiet week looks quiet.
- **Helps:** S1, S5 (the hire sees "Assigned to me" grouped by what is urgent versus ongoing), S6 (inside a job, group by "blocking / next / later").
- **Risk:** Each named group is an implied rule. If Patina adds many groups, the page turns into a dashboard again.

### P-06 "Today" as due plus overdue, with a separate "This Evening"
- **Who:** Things 3. https://culturedcode.com/things/features/ . Apple Reminders defines Today as "reminders that are due today and reminders that are overdue". https://support.apple.com/guide/reminders/view-reminder-lists-remnd854fc47/mac
- **How it works:** Things calls Today "your go-to place for all daily activities", shows calendar events grouped at the top, and keeps later-in-the-day tasks in a separate **This Evening** list "in their own discrete list" (https://culturedcode.com/things/features/). Upcoming shows the coming days and lets the user reschedule by drag and drop (same URL).
- **Why it stays calm:** The list answers one question: what is today's. Overdue items fold into it instead of forming a separate red pile. The evening split lets the person see "what I can do now" without deleting what is for later.
- **Helps:** S1, S4 (invoice due today or overdue), S8 (the day is closeable because Today is finite).
- **Risk:** Overdue folded into Today can grow without bound, which is the failure mode of a stale daily list. Also note the Things page I fetched does not describe Anytime, and says Someday only in passing (same URL), so I make no claim about those.

### P-07 "Assigned to me" as its own smart list
- **Who:** Apple Reminders. https://support.apple.com/guide/reminders/view-reminder-lists-remnd854fc47/mac . iPhone guide: https://support.apple.com/guide/iphone/use-smart-lists-iphe882772ed/ios
- **How it works:** **Assigned** "shows all reminders assigned to you from a shared reminder list". The Apple Community thread notes that the Today list also includes reminders you have assigned to other people, so the way to see only your own is the Assigned list (https://discussions.apple.com/thread/254449758, quoted in a search summary, so UNVERIFIED as to exact wording). Users can also build custom Smart Lists filtered by tags, dates, locations, flags and priority (iPhone guide).
- **Why it stays calm:** "Mine" is a built-in view rather than something to assemble. It stays short because it excludes what others own.
- **Helps:** S5 (the hire opens "Assigned to me" and sees only theirs), S1 (Leah's own list excludes the hire's).
- **Risk:** Today (Reminders) mixing in delegated items is a documented source of confusion, so any Patina version must make "mine" versus "everyone's on this job" obvious.

### P-08 A separate "stuff I've assigned" (waiting-on) view
- **Who:** Basecamp My Assignments. https://5.basecamp-help.com/article/1178-my-assignments
- **How it works:** Three tabs: **My assignments** (grouped by project), **My assignments with dates** (chronological), and **Stuff I've assigned** ("tracks what you've handed off to others"). Inline editing lets the person reassign or change a due date without opening the project. A Monday-morning email summarises open assignments: Up Next, overdue, due this week, everything else. Basecamp 5 no longer shows counts for My Assignments. (Same URL.)
- **Why it stays calm:** Chasing and doing are different jobs. Putting chasing in its own place keeps the "do" list short. Dropping the count removes a number that would pull the eye.
- **Helps:** S3 (PO sent, ack overdue: it lives in "waiting on"), S2 (proposal sent, awaiting client), S4 (invoice out, unpaid), S5.
- **Risk:** A waiting-on list can become a nagging list. Frame it as "who has the ball" without an overdue clock in red.

### P-09 Hill chart: position instead of percent-complete
- **Who:** Basecamp. Method: https://basecamp.com/shapeup/3.4-chapter-13 . Help: https://3.basecamp-help.com/article/413-tracking-work-on-the-hill-chart (listed in search results; I did not open it, UNVERIFIED).
- **How it works:** Each piece of work is a dot on a hill. Uphill is "figuring things out", downhill is "making it happen". The chapter says it shifts "the focus from what's done or not done to what's unknown and what's solved", and that "to-do lists actually grow as the team makes progress", so percent-complete misleads. Team members drag their own dots, which lets a manager see status "without the awkward status question". "A dot that doesn't move is effectively a raised hand." (Chapter 13.)
- **Why it stays calm:** One symbol per scope, no counts, no due-date clock. Trouble surfaces as stillness, not as a red alert, and the conversation is about the work rather than the person.
- **Helps:** S6 (where is this job), S3 (a PO that has not moved), S5 (the hire sees where each scope stands), S1 (stalled jobs rise).
- **Risk:** Self-reported position needs the person to keep dragging dots. That is upkeep work, which cuts against "the studio won't notice Patina". A hill chart is also a progress visualisation; `VISION-DECISIONS.md:238` bans progress bars and similar, so adopting it needs an explicit ruling.

### P-10 Lineup: all projects on one rolling timeline
- **Who:** Basecamp 5. https://5.basecamp-help.com/article/1164-lineup
- **How it works:** Every project with a start and end date appears as a bar in a rolling 13-week window (six weeks back, the current week, six weeks forward). A vertical blue line marks today and stays centred. Avatars show who is working on current projects. Markers flag company-wide dates. Clicking a bar opens the project. Projects without dates do not appear. (Same URL.)
- **Why it stays calm:** One shape, no per-item numbers. It is a map for planning, not a to-do list. Reviewers note it is projects only, with no tasks or dependencies (https://connecteam.com/reviews/basecamp/, via search summary), which is also why it is quiet.
- **Helps:** S1 and S5 (the whole studio at a glance: 16 jobs, who is on which), S8 (confirm nothing is slipping into next week).
- **Risk:** A timeline invites schedule-pressure, and only dated jobs show. Interior-design phases are rarely cleanly dated (UNVERIFIED for Patina's data). It is also a dashboard, which canon refuses (`VISION.md:58`).

### P-11 Split inbox with counts that vanish at zero
- **Who:** Superhuman. https://help.superhuman.com/hc/en-us/articles/46005619081101-Default-Split-Inbox and https://help.superhuman.com/hc/en-us/articles/46005793275277-Structure-Your-Inbox
- **How it works:** Splits are sections at the top of the inbox; Tab moves between them. "Each split shows a count of its conversations. The count is hidden once you reach Inbox Zero in that split, or if the total goes over 999." The help page suggests no more than seven splits. Default **Important** holds person-to-person mail and **Other** holds automated mail and lists. A VIP split is described for a founder's key contacts so that "with only a few minutes" they can go straight there. (Search summary of the two help pages; the Default-Split-Inbox page itself returned 403 on direct fetch, so details are via the search summary. https://blog.superhuman.com/how-to-split-your-inbox-in-superhuman/ is the related blog.)
- **Why it stays calm:** Zero is shown as nothing. Splitting by sender class means the unimportant is not even counted in the important lane.
- **Helps:** S1 (a "mine today" split), S8 (zero is visible and final), S7 (new leads as one split).
- **Risk:** "Inbox Zero" is a gamified goal for some users, which sits near the refused engagement chrome. Use the vanishing count; skip the celebration.

### P-12 Sort by destination, not by arrival
- **Who:** HEY (Imbox, The Feed, Paper Trail, Set Aside). https://www.hey.com/features/
- **How it works:** The Imbox holds "important, immediate emails". The Feed shows newsletters, already open. Paper Trail holds receipts, confirmations and transactional mail, "out of your way, but easy to find when you need them". In the Imbox "new messages are always grouped together at the top". Senders who flood the inbox can be bundled into a single row. (Same URL.)
- **Why it stays calm:** Records and requests live in different rooms. A receipt is proof, not a prompt.
- **Helps:** S4 (a deposit that landed is a receipt; an invoice that is overdue is a prompt; treat them differently), S2 (client approved is news, client declined is a prompt).
- **Risk:** If the "paper trail" is too hidden, good news is missed. Leah may want to know a deposit landed. Provide a once-a-day line rather than silence (see P-15).

### P-13 Reply Later and Set Aside piles
- **Who:** HEY. https://www.hey.com/features/
- **How it works:** **Reply Later** is one click to a dedicated pile at the bottom of the screen, and Focus & Reply works through that pile one message after another. **Set Aside** is for items "at hand, but out of your face". (Same URL.)
- **Why it stays calm:** The act of deferring is deliberate and cheap, and the deferred pile is seen only when the person chooses to work it. It never rings.
- **Helps:** S2 (park a client's decline until a calm moment), S3 (park a chase), S8 (move leftovers into a pile and leave).
- **Risk:** Piles accumulate silently. HEY addresses this by showing the pile at the bottom of the main screen; a Patina version needs a visible count on the pile, or a weekly resurfacing.

### P-14 "Work Can Wait": hold notifications outside work hours, then catch up
- **Who:** Basecamp. https://3.basecamp-help.com/article/86-how-notifications-work and https://signalvnoise.com/svn3/basecamp-3-work-can-wait/
- **How it works:** Under "When?", choose "Always!" or "Work Can Wait! Only during my work hours". The person sets hours and days. Outside them Basecamp holds notifications (no email, push or in-app notification), and the person can still open the app. A checkbox, "Catch me up if anything happened after hours", sends a summary. A manual snooze offers 3 hours or off until turned back on (the 3-hour snooze detail is from the Signal v. Noise post, via search summary). (Same URLs.)
- **Why it stays calm:** The default stance is "after hours, silence", and the person opts into a summary rather than a stream.
- **Helps:** S8 (leave without the phone buzzing), S2 and S4 (arrive the next morning as a summary).
- **Risk:** A late client emergency may be delayed. Needs an escape hatch (P-15's never-batch list).

### P-15 Scheduled summary, an explicit short "never batch" list, and a weekly digest
- **Who:** Apple iOS Notification Summary and Time Sensitive. https://support.apple.com/en-al/guide/iphone/iph7c3d96bab/ios . Practitioner guidance: https://www.courier.com/guides/how-to-build-a-notification-center/chapter-3-best-practices-for-notification-centers . Basecamp Monday email: https://5.basecamp-help.com/article/1178-my-assignments
- **How it works:** iOS lets an app deliver "Immediate Delivery" or "Scheduled Summary", and Time Sensitive notifications "are always delivered immediately outside of the summary schedule" (https://www.macworld.com/article/631034/how-to-reduce-notifications-by-controlling-time-sensitivity-in-ios-ipados-15.html, via search summary). Courier's guide, as summarised by search, advises giving each type a realistic urgency, rate limiting, and batching anything non-urgent, with time-sensitive alerts such as payment failures going out singly. A related GitHub issue argues that the never-batch list must be explicit and short (https://github.com/Akanimoh12/Stellar-Tipz/issues/1291, a small repo issue, weak authority; UNVERIFIED as best practice). Basecamp emails a Monday summary of Up Next, overdue and due this week.
- **Why it stays calm:** Most events arrive once, at a scheduled hour. The few that cannot wait are named in advance, and that list is deliberately short. This is the nearest real thing to a "notification budget". I did not find that term used in any source; the budget framing is my synthesis.
- **Helps:** S1 (a Monday summary), S2, S4, S7 (the lead may be time-sensitive), S8.
- **Risk:** The "short list" tends to grow. Every team that wants a thing noticed will argue to be on it. The studio promise says the opposite. Cap it and review it.

### P-16 Escalate only if unseen
- **Who:** Notion. https://www.notion.com/help/updates-and-notifications
- **How it works:** The inbox is the primary surface. Desktop push arrives 10 seconds after an @-mention, and mobile push arrives "if you haven't viewed a mention within 5 minutes, or if Notion isn't open on the device". (Same URL.)
- **Why it stays calm:** If the person is already looking, there is no second interrupt. The louder channel is a fallback.
- **Helps:** S2, S7 (nudge only if a lead or client decision has not been seen), S3.
- **Risk:** Over-tuned delays make time-sensitive things late. The same page also shows Notion's inbox has many filter types, which can itself be an overwhelm source.

### P-17 An inbox that holds only unfinished things
- **Who:** Notion archive and Linear's cap. https://www.notion.com/help/updates-and-notifications and https://linear.app/docs/inbox
- **How it works:** Notion's `Archive read` and `Archive all` "help keep the inbox limited to your unfinished tasks", and filter choices are saved so the inbox looks the same next time. Linear caps the Inbox at 2,000 open notifications and does not support archiving, but offers "Shift Backspace" to clear all read ones. (Same URLs.)
- **Why it stays calm:** The surface represents "what is open", not a history. Clearing is cheap and expected.
- **Helps:** S8 (leave when the list is empty), S1.
- **Risk:** "Inbox as a to-do list" can turn into the person's own list rather than the work's. Gamifying the clear action (a streak, a score) is exactly what the studio promise forbids.

### P-18 The periphery: ambient status that does not ask for attention
- **Who:** Weiser and Brown, "Designing Calm Technology". https://calmtech.com/papers/designing-calm-technology . Amber Case's principles: https://calmtech.com
- **How it works:** "Calm technology engages both the center and the periphery of our attention, and in fact moves back and forth between the two." The Dangling String is a plastic string whose twitching reflects network traffic: "a quiet network causes only a small twitch every few seconds", a busy one "a madly whirling string". It sits "visible and audible from many offices without being obtrusive". (calmtech.com/papers.) Case's eight principles include: technology should require the smallest possible amount of attention; should make use of the periphery; should work even when it fails; and "the right amount of technology is the minimum needed to solve the problem". (calmtech.com.)
- **Why it stays calm:** The signal lives where it can be glanced at, and it escalates by getting more present, not by getting louder.
- **Helps:** S1 (a Desk where a glance is enough), S3 (a vendor row that visibly "ages" without turning red), S8.
- **Risk:** Too subtle and it is missed. The principle "works even when it fails" means the page should still be useful if the signal is off. Also, it is a design philosophy, not a feature; it needs translating into a concrete mark.

### P-19 One status per line item, with a filter for "awaiting review"
- **Who:** Programa. https://programa.design/features/client-dashboard-for-designers-and-architects
- **How it works:** Each item is marked "Approved, Needs Review, or Rejected, per line item or in bulk", every decision is timestamped, and designers can "quickly surface every item awaiting review by applying filters". Client comments form "a single timestamped feed attached to the item it belongs to". There is a "Notify" tab in the feature list. The page does not say what notifications contain or how they are delivered. (Same URL.)
- **Why it stays calm:** State lives on the thing, not in a separate feed. Review is a filter the designer chooses to apply.
- **Helps:** S2 (client approved or declined is a status on the item), S6.
- **Risk:** It is pull, not push. The designer must go and filter. Without a summary above it, "awaiting review" is invisible until someone looks. Marketing page only; actual product behaviour UNVERIFIED.

### P-20 Assign tasks to the client, and let the portal do the reminding
- **Who:** Houzz Pro (formerly the Ivy product). https://pro.houzz.com/for-pros/feature-client-dashboards . Ivy history: https://www.houzz.com/magazine/houzz-launches-ivy-for-designers-in-canada-stsetivw-vs~121920968
- **How it works:** Pros can "Assign Tasks to keep your clients involved" and set task reminders. The page claims the dashboard helps "get selections approved, invoices paid, and tasks taken on with fewer reminders", and shows "paid and outstanding totals at a glance". (Same URL.) Houzz Magazine says daily logs "remind them of approvals and payments due" (https://www.houzz.com/magazine/how-the-houzz-pro-client-dashboard-works-for-you-stsetivw-vs~181667283, via search summary).
- **Why it stays calm:** The chasing is done by the system on the client side, so the designer is not the one nagging. The designer's job becomes reading the result.
- **Helps:** S2, S4 (reminders go to the homeowner and not through Leah).
- **Risk:** This is an automated external send. Patina's Agent OS rule is "No automated external sends — drafts land `awaiting_review`" (`AGENTS.md`, Agent OS rules), so any version here needs draft-then-approve. The Houzz page does not say the pro is told when the client acts (I checked; same URL), so what the pro sees is UNVERIFIED.

---

## 3. What the interior-design incumbents do badly (and Patina should avoid)

All of this comes from public pages, review aggregators and competitor blog posts. None is hands-on use. Competitor claims about each other are marketing. Review quotes via search summaries of Capterra pages are secondhand (see the limits note above). Absence of a feature on a marketing page does not prove absence in the product.

1. **They report status; they rarely say "do this next".**
   - Design Manager shows overdue acknowledgements in an **Acknowledgement Report**, reached through Reports > Project Management > Order Tracking, not as an alert. http://manuals.designmanager.com/manuals/dmprodesktop/acknowledging_purchase_orders_and_receiving_merchandise.htm (the report path is from a search summary of Design Manager's manuals, not read in full; UNVERIFIED).
   - Studio Designer's help article tells the user to type an acknowledgement date, an estimated ship date and a received date into fields on each item. I found no overdue alert in the same search. https://help.studiodesigner.com/s/article/Expediting-Tracking
   - Ivy's order dashboard "tracks order status across all projects", and one reviewer said "there is not tracking at all existing - if so, very minimal. No color codes on items status." https://www.ivy.co/designers/magazine/ivy-news/ivys-guide-to-purchase-orders/ and https://www.softwareadvice.com/product/458382-Ivy/ (the review is via search summary, and is a single reviewer).
   - Lesson for S3: a vendor-quiet signal should be pushed up to the Desk, not filed in a report.
2. **Their notification story is thin or undocumented from the designer's side.**
   - Programa lists a "Notify" tab but does not say what is notified or how. https://programa.design/features/client-dashboard-for-designers-and-architects
   - Houzz Pro's client-dashboard page says nothing about alerts to the pro when a client approves, pays or completes a task. https://pro.houzz.com/for-pros/feature-client-dashboards
   - Mydoma's client task section tells the client "you have an invoice ready for payment"; a reviewer notes no way to know if a client is logged in. https://mydomastudio.com/ (home page) and the Software Advice listing https://www.softwareadvice.com/creative-management/mydoma-studio-profile/ (via search summary).
   - Lesson for S2 and S4: build the designer's receiving end first. These tools lead with the client portal.
3. **Clutter, menus and learning curve.**
   - A reviewer on Programa's Capterra page, describing Studio Designer: "far too many menus and was clunky and overwhelming to use." Another: "really clunky... the pictures were so tiny." https://www.capterra.com/p/248518/Programa/reviews/ (via search summary; Programa review entries can be marked "Vendor Referred - Incentive Offered", so bias is possible).
   - Houzz Pro reviewers cite a "steep learning curve" and "Because there is a lot offered, its hard getting started". https://www.capterra.com/p/199689/Houzz-Pro/reviews/ and https://www.softwareadvice.com/construction/houzz-pro-profile/reviews/ (via search summary).
   - Design Manager is described by Studio Designer's own competitor blog as "a legacy system with templated reporting and workflows that are difficult to adjust", with training from "$120 per hour". https://www.studiodesigner.com/blog/the-best-interior-design-software/ (competitor claim).
   - Lesson for the hire in week two (S5): do not bury the next step in menus.
4. **Upsell and noise.** A Trustpilot reviewer says Houzz "continuously prompts me to purchase the premium service" (via search summary of https://www.trustpilot.com/review/www.houzz.com ). I found no review that complains specifically about notification volume, so I make no claim that Houzz notifies too much. For Patina the lesson is narrower: never let commercial prompts share the surface with "what needs you".
5. **Lock-in and fragility reported by users.** One Capterra review of Studio Designer says it is "almost impossible to leave this company without losing a huge amount of data" (https://www.capterra.com/p/217839/Studio-Designer/ , via search summary, a single reviewer and 5 reviews total). It is a single anecdote, but it sits against Patina's stated "no lock-in, no hidden fees" promise (project `CLAUDE.md`, "Promise" line).
6. **Several incumbents rely on external accounting or have thin finance depth.** Per Studio Designer's competitor post: Mydoma "relies on QuickBooks", Programa "does not include native accounting", Houzz Pro's purchase orders have "less depth". https://www.studiodesigner.com/blog/the-best-interior-design-software/ (competitor claim). Not a Patina design lesson for this story; included so nobody assumes the incumbents solved money.
7. **Mixed granularity of reference views.** Several offer a project-wide order status screen (Mydoma Orders Overview, Ivy, Design Manager). They are lists of everything. Mydoma's orders dashboard "shows ... all orders for the project and their status" (https://help.mydomastudio.com/en/articles/1686685-orders-overview). That is an index, not a priority order.

---

## 4. The patterns most worth stealing for Patina

Six, in order of how directly they close a gap in `current-state.md` §4.

**1. P-01 and P-05: a Priority cut plus groups that appear only when they apply (S1, S5, S6).**
Why: §4 says the Desk already has a needs-you line and ranked cards, but "Only what needs me" and "By person" need a click (S1, S5) and that "no time/click claim can be made from code alone". Linear's lesson is that the default cut is the product: ship a good Priority by default and let empty groups draw nothing. That answers Leah's 10-second test without adding marks.
Guard: keep the group list short. Departs from canon "no dashboards" (`VISION.md:58`) if it reads as a panel; name that ruling.

**2. P-08 plus P-09: a waiting-on view, and stillness as the signal (S3, S2, S4).**
Why: §4 S3 says the overdue PO ack is modelled but its discoverability is unmeasured; S2 and S4 have no global "client moved" or "deposit landed" notice. Basecamp separates "stuff I've assigned" from "mine", and Shape Up's line "a dot that doesn't move is effectively a raised hand" is a calm way to express "this vendor has gone quiet" without red.
Guard: no upkeep. Derive position from facts Patina already holds (PO sent date, ack date), not from the designer dragging dots. A progress visual would need a ruling against `VISION-DECISIONS.md:238`.

**3. P-03 and P-04: a door for new leads, outside the daily list (S7).**
Why: §4 S7 says capture and triage exist, but no evidence of an at-rest new-lead notice. Linear's Triage and HEY's Screener both treat a first arrival as a deliberate, single decision, kept out of the working list until accepted. Reversible history matters (HEY's Screener History).
Guard: show the door as one line when something is waiting and nothing when not; do not add a count badge. Triage lives beside, not above, the committed jobs.

**4. P-15 with P-14: a short, explicit "interrupt list", a scheduled summary for the rest, and quiet hours (S2, S4, S7, S8).**
Why: §4 notes no generalised notification inbox or delivery guarantee for operational events. The practical model is iOS: most things arrive in a scheduled summary, and a small named set may break through. Add Basecamp's "work can wait" so the day can end. This is where a notification budget lives.
Guard: cap the interrupt list at a small fixed number and review it; any external send to a client stays draft-then-approve per the Agent OS rule. I found no source defining a "notification budget", so treat the budget idea as a design proposal, not established practice.

**5. P-11 and P-17: counts that vanish at zero, and a finishable list (S8).**
Why: §4 S8 calls "Nothing needs your hand" an unaudited guarantee. Superhuman hides the count at zero, and Notion keeps the inbox to unfinished things. A leave-now state is only believable if it is backed by an all-jobs cut, so the empty state can be trusted.
Guard: no confetti, streak, or "inbox zero" score. Canon's refusal of streaks and targets is the NOT-waived part. The empty state should be plain.

**6. P-18: ambient, glanceable status on each job row (S1, S3, S6).**
Why: Weiser and Brown and Case give the strongest argument for the studio promise: the surface should "require the smallest possible amount of attention" and use the periphery. A job row that quietly ages or gains weight when something is waiting is a glance, not a notification. This is the one that most protects the "calm" half of the brief.
Guard: it needs a concrete mark, and the BRIEF's calm test counts marks on first paint. Spend the extra mark only on an actionable moment.

Honourable mentions, not in the six: P-10 (Lineup) for a whole-studio map if a direction needs one, but it adds a dashboard-like surface and depends on dated phases (UNVERIFIED for Patina's data); P-06 (Today, due plus overdue) as the simplest model for the Desk's top line; P-19 and P-20 as things to read, not copy, because they depend on client-side automation that Patina's no-automated-sends rule constrains.

---

## 5. Source list

Verified by direct fetch: linear.app/docs/inbox, /docs/my-issues, /docs/triage; culturedcode.com/things/features/; hey.com/features/, /features/the-screener/; basecamp.com/shapeup/3.4-chapter-13; 5.basecamp-help.com/article/1164-lineup; notion.com/help/updates-and-notifications; calmtech.com; studiodesigner.com/blog/the-best-interior-design-software/; programa.design/features/client-dashboard-for-designers-and-architects; pro.houzz.com/for-pros/feature-client-dashboards.

Seen through search summaries only (not opened by me, so weaker): Apple Support Reminders and notification pages, Macworld, Superhuman help and blog, Basecamp 3 and 5 notification and My Assignments help, Signal v. Noise posts, calmtech.com/papers/designing-calm-technology, Capterra, Software Advice, Trustpilot, Mydoma help, Studio Designer help, Design Manager manuals, Ivy guides, Houzz Magazine, Courier, SuprSend.

Could not load: Asana help center (My Tasks), Capterra review pages for Programa and Mydoma (HTTP 403), www.ubiq.com (DNS).

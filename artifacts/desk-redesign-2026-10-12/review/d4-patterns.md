# US-26 D4: Patterns in the field, calm card-based day surfaces and their colour tags

Researched 2026-10-12 for SQ-787. Scope: how calm, professional day-planning tools use cards and small colour tags so a day is readable and operable without becoming a dashboard. Patina context: BRIEF.md section 5 (calm, operable, glanceable, one-line header) and section 6 (what the exploration reopens: V18 Q1 and Q7, house sheet :1011, :54, :592; zero shadows stays).

Source discipline: a URL in brackets was opened and read, unless the Evidence limits section says otherwise. "Calm" ratings are my editorial judgement from what the sources describe, not a measured score.

## 1. Pattern catalogue

### 1a. Day and focus tools

| Tool | What a row or card shows | What the tag encodes | Tag form | Calm (judgement) | URL |
|---|---|---|---|---|---|
| Linear, My Issues | Issues grouped into focus groups (urgent, SLA-bound, blockers, cycle work, other active, triage, backlog, completed), sorted by priority inside each group. Some groups appear only when relevant. | Priority and label; which properties show is per-viewer. | Row properties the viewer switches on: ID, status, assignee, priority, project, cycle, labels, due date. | High. The grouping does the sorting, not colour. | https://linear.app/docs/my-issues and https://linear.app/docs/display-options |
| Linear, Inbox | Notification list with a Priority tab separating what needs attention from other updates; snooze, read toggle, "show unread first". | Priority is a tab, not a badge on every row. | Tab plus optional badge count in display options. | High. The docs describe no per-row colour. | https://linear.app/docs/inbox |
| Linear, labels | Labels group one level deep; one label per group per issue. | Type or component, user or admin defined. | Colour dot in settings; the docs I opened do not describe colour on the row. | n/a | https://linear.app/changelog/2022-11-10-label-groups |
| Things 3, Today | Calendar events grouped at the top, then to-dos; "This Evening" is a separate sub-list. | Tags are optional context (Home, Errand, Important, Pending). The support page never calls tags coloured. Tags inherited from a project or area are not shown on the to-do. | Tags "tucked away in the corner until you need them"; filter bar at the top. | Very high. | https://culturedcode.com/things/features/ and https://culturedcode.com/things/support/articles/2803581/ |
| Asana, My Tasks | Tasks across projects. A task takes its first project's colour, and that overrides a status field's colour. | Project identity, by default. | Small colour tag on a board card; community describes it as "a tiny little color tag". | Medium. Colours collide when two meanings compete. | https://forum.asana.com/t/anyway-to-change-the-source-of-task-colour/792779 and https://forum.asana.com/t/board-view-task-colors/177897 |
| Basecamp 5, Card Table | Columns (Triage, In Progress, Done by default); a card has title, assignee, due date, steps. Assigned cards roll up to a person's Assignments page. | Column (stage). The help page names colour for columns and wormholes, not for cards. | Column colour from one shared palette. | High. Basecamp says earlier palettes had "too many" shades that "didn't feel cohesive". | https://5.basecamp-help.com/article/1063-card-tables and https://basecamp.com/5 |
| Basecamp, Hey! (BC3) | One inbox: "New for you", then "Previous notifications". | Read or unread only. | Three inboxes merged into one: "we don't think the mental overhead of three inboxes was worth the trouble". | High. One place to look. | https://signalvnoise.com/svn3/basecamp-3-redesign-phase-1-new-nav-and-a-unified-hey-inbox/ |
| Notion Calendar (Cron) | Event chips on a time grid. | Calendar identity, with per-event override. | Chip tint family plus coloured ribbons; stripes when every participant answered "Maybe". | High. | https://www.cron.com/changelog |
| Sunsama, daily planning | Ordered task list, time estimate, optional time-box, workload check against a limit you set; evening mode plans tomorrow. | Channel (context) colours the working session, or calendar colour, user's choice. | Colour on the calendar event, not on a list card. | High. The workload check is a limit the person sets, not a nag. | https://help.sunsama.com/docs/usage-guides/daily-planning/ and https://help.sunsama.com/docs/usage-guides/timeboxing/timeboxing-faqs/ |
| Height | Shut down 24 September 2025, so there is nothing to benchmark. Asana stands in for the My Tasks pattern. | n/a | n/a | n/a | https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/ (search result, not opened) |

### 1b. Interior-design studio tools

The honest finding is that these vendors' public pages barely describe colour. I did not find a primary source that shows a project home coloured by phase in any of them.

| Tool | What the project or dashboard home shows | What colour encodes, per the sources | Tag form | Calm (judgement) | URL |
|---|---|---|---|---|---|
| Programa | Studio work-in-progress view over all projects, tasks as Board, List or Timeline, with phases as a task field. | Colour not confirmed in text. | Not stated. | Unknown | https://programa.design/hb-features and https://architosh.com/2026/01/programa-software-for-interior-designers-and-architects/ |
| Houzz Pro | Project dashboard flags upcoming tasks and deadlines and shows finances; schedule in calendar or Gantt. | "Add project stages or activities and color code away" is the only colour statement. Item status in the Project Tracker updates itself as a product moves through approval, invoice, payment and PO. | Not stated for the dashboard. | Unknown | https://pro.houzz.com/for-pros/software-interior-designer-project-management and https://pro.houzz.com/pro-learn/blog/houzz-pro-introduces-new-project-tracking-experience |
| Studio Designer | Items, orders and delivery dates across projects. | Item status or responsibility, chosen by each firm. Ten colours or none, per item, with firm-defined meanings; filter and report by colour. | "Color-coded circles", per a user quote. | Medium. A firm can be calm; the tool cannot enforce it. | https://www.studiodesigner.com/blog/customize-organize-color-studio-designer/ |
| Mydoma | Overview of open projects with a status the studio sets. | "Custom project statuses and tags". Colour not confirmed. | Not stated. | Unknown | https://mydomastudio.com/features/project-management/ |
| DesignFiles | Cross-project task list, filter by due date, project or person; calendar by day, week or month; a high-priority flag. | Colour not mentioned on the task page. | Priority flag. | Unknown | https://designfiles.co/features/interior-design-tasks/ |

Read-across: the studio tools that do say something put colour on item status and let each firm define it (Studio Designer), or on schedule stages (Houzz Pro). None is documented as colouring the project home by phase. Patina would be inventing that convention, not following one.

## 2. What the colour conventions teach

**What the tag encodes.** Each tool picks one question. Cron: which calendar. Basecamp: which column. Studio Designer: what is the item's state, defined by the firm. Asana tried two (project and status) and the project won. [https://forum.asana.com/t/anyway-to-change-the-source-of-task-colour/792779]

**Size, shape, placement.** Tags are small and sit at an edge: Asana's tag on a card, Cron's ribbon and chip tint, Things' corner-tucked tags. Whole-row and whole-card fills do not appear in anything I read.

**How many hues.** Guidance clusters at five to seven. Carbon: "having more than five or six indicators can overwhelm users". [https://carbondesignsystem.com/patterns/status-indicator-pattern/] The EU data-visualisation guide: "Seven is a good maximum", and colour-blind-safe categorical palettes are "rare and hard to design" (ColorBrewer offers one, with four colours). [https://data.europa.eu/apps/data-visualisation-guide/colour-for-categories] Basecamp visibly reduced its palette for the same reason. [https://basecamp.com/5] Studio Designer allows ten, and leaves meaning to each firm. [https://www.studiodesigner.com/blog/customize-organize-color-studio-designer/]

**User-chosen or system-assigned.** Linear and Things let people create labels and tags; Cron and Sunsama let people pick calendar or channel colour and override per event. Studio Designer gives ten swatches and the firm writes the meaning. System-assigned colour appears where the colour is a state or priority (Carbon's red, orange, yellow, green and blue semantics). [https://carbondesignsystem.com/patterns/status-indicator-pattern/] Patina has no project colour field in the database (BRIEF section 7), so user-chosen project colour is a schema decision, not a styling one.

**Accessibility.**
- WCAG 1.4.1 requires that colour not be the only visual means of conveying information. Two colours that differ in lightness as well as hue count as an extra cue only if contrast is at least 3:1, and if people must recognise a specific colour (green valid, red invalid) another indicator is needed regardless. Sufficient techniques include making colour-coded information available in text (G14) and combining colour with pattern (G111). Failure F81 is marking required or error fields by colour alone. [https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html]
- Carbon asks for 3:1 contrast on indicators and at least two of colour, shape or symbol; its icon indicator carries an icon, a shape, a colour and a descriptive label. It also says to avoid indicators "when no user action is required". [https://carbondesignsystem.com/patterns/status-indicator-pattern/]
- Cron shows a non-colour cue in practice: event chips switch to stripes when every participant answered "Maybe". [https://www.cron.com/changelog]
- Palette: the Okabe and Ito 2002 material, popularised by Wong in Nature Methods 2011, is the standard colour-blind-safe categorical set. [https://jfly.uni-koeln.de/html/manuals/pdf/color_blind.pdf]
- Dark mode: Linear generates themes from three inputs (base, accent, contrast) in the perceptually uniform LCH space and made neutral text and icons "darker in light mode and lighter in dark mode"; it reached a calmer palette "by limiting how much chrome (blue in our case)" fed its colour system. [https://linear.app/now/how-we-redesigned-the-linear-ui] Cron shipped dark mode built on the CIECAM02 colour space, with bolder light-mode colours and more contrast between past and future events. [https://www.cron.com/changelog]

**Header patterns.**
- Linear: one purple plus for creating an issue, and the key C from anywhere; "you can take almost every action in Linear without lifting your fingers off of the keyboard". [https://linear.app/now/invisible-details] Its March 2026 refresh made headers and view controls "consistent across projects, issues, reviews, and documents" and dimmed the sidebars so content stands out. [https://linear.app/changelog/2026-03-12-ui-refresh]
- Basecamp: one unified top menu that "replaces a bunch of separate navigation links", a quick-jump field on Shift+J, and edit and save pinned to the top right. [https://basecamp.com/5] Its earlier redesign cut a crowded top nav that was "intimidating for new users". [https://signalvnoise.com/svn3/basecamp-3-redesign-phase-1-new-nav-and-a-unified-hey-inbox/]
- Linear's context menus teach the shortcut next to each action, so the hint lives in the menu rather than printed under a button. [https://linear.app/now/invisible-details]

## 3. Transferable principles for Patina

1. **The word carries the meaning; colour is a second voice.** Every tag has a visible word or shape, never colour alone (WCAG 1.4.1, Carbon). On the Desk this fits the existing ink-word habit. [https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html]
2. **One question per colour.** Choose whether a tag answers "which job", "which stage" or "whose move". Asana's collision of project and status colour is the warning. [https://forum.asana.com/t/anyway-to-change-the-source-of-task-colour/792779]
3. **Small, at an edge, never a fill.** A rule, dot, chip or ribbon; the card body stays paper. Cron's ribbons and chips and the Asana "tiny color tag" are the evidence. [https://www.cron.com/changelog]
4. **Hold the hue count at six or fewer on screen.** Carbon's five or six and the EU guide's seven agree. Patina's six stage pigments are already at that ceiling, so adding project identity on top needs a trade. [https://carbondesignsystem.com/patterns/status-indicator-pattern/]
5. **Colour only where a person might act.** Carbon says to skip indicators when no action is required. For the Desk: a quiet job shows no tag. [https://carbondesignsystem.com/patterns/status-indicator-pattern/]
6. **Structure first, colour second.** Linear's My Issues sorts by focus groups and priority, with groups that appear only when relevant; Things separates Today from This Evening. The sections give the day its edges, and colour need not. This is the answer to "everything bleeds together". [https://linear.app/docs/my-issues, https://culturedcode.com/things/features/]
7. **Let the viewer choose what a card shows.** Linear's per-person display properties, with a shared default. A studio of two to six people can have a quiet default and no engagement mechanics. [https://linear.app/docs/display-options]
8. **A concise top bar is one create act plus a command bar.** Hints live in menus and the command surface, not under buttons. [https://linear.app/now/invisible-details, https://basecamp.com/5]

## 4. Anti-patterns

- **Colour as the only signal.** Fails WCAG 1.4.1 (F81); red and green together are the classic case. [https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html]
- **Two meanings, one palette.** Asana's project colour silently overriding a status field is the example. [https://forum.asana.com/t/anyway-to-change-the-source-of-task-colour/792779]
- **Palette sprawl.** Basecamp's own admission: too many shades that "didn't feel cohesive". [https://basecamp.com/5]
- **Colour meaning left to every firm.** Studio Designer's ten colours work because each firm writes its own key; one firm even reserved colours for specific colleagues. A new hire has to learn the key before reading the screen, which is the opposite of Jordan's week two. [https://www.studiodesigner.com/blog/customize-organize-color-studio-designer/]
- **Indicators with no action behind them.** Carbon's warning. [https://carbondesignsystem.com/patterns/status-indicator-pattern/]
- **Several inboxes or surfaces for one job.** Basecamp merged three to one for lower mental overhead. [https://signalvnoise.com/svn3/basecamp-3-redesign-phase-1-new-nav-and-a-unified-hey-inbox/]
- **Counts and badges as the main signal.** Linear makes the badge count an optional display setting, not the default frame. [https://linear.app/docs/inbox]
- **Tip text under buttons.** None of the tools above print a hint beneath a header action; they use shortcuts and menus. (This is a finding about absence in the pages I read, not a stated rule.) [https://linear.app/now/invisible-details]

## 5. Three tag systems a Desk could adopt

Each reverses part of the canon listed in BRIEF section 6; none adds a shadow.

### A. Stage Rule
- **Encodes:** the job's stage (brief, discovery, direction, proposal, project, install), shown as a 2px left rule on the card in the existing `--tab-*` pigments, with the stage as an ink word.
- **For:** system-assigned, no schema change, already on the house sheet, six hues sit at the ceiling in principle 4. Echoes Basecamp's column colour. [https://5.basecamp-help.com/article/1063-card-tables]
- **Against:** stage is rarely what Leah acts on at 8am; a day of 16 jobs fills with six colours that say little about today. Reverses V18 Q7 (plates demoted to ink words) and the monochrome part of Q1.

### B. Hand Tag
- **Encodes:** whose move it is. Two to four states with a word: "Yours", "Waiting on others", "Set aside". Terracotta-ink for an overdue need, sage or mocha for quiet states, always beside the word.
- **For:** closest to the day question (M1, M5), few hues, follows Carbon's "highest-attention colour" rule and the colour-only-when-action-needed principle. Reuses the old urgent and quiet split and the need-state data (BRIEF section 7). [https://carbondesignsystem.com/patterns/status-indicator-pattern/]
- **Against:** loses job identity at a glance; terracotta against sage is a red-green family risk unless the word and a shape differ (Carbon's three-element rule). Reverses the Q1 guard on dots and chips.

### C. Job Mark
- **Encodes:** which job a card belongs to: a small mark beside the project name, chosen by the studio from a short set of eight, and the same mark wherever the job appears. Cron and Sunsama show that per-calendar and per-channel colour with override is familiar. [https://www.cron.com/changelog, https://help.sunsama.com/docs/usage-guides/timeboxing/timeboxing-faqs/]
- **For:** helps M6 and M8, since the eye can follow a job across the day. A calm tool can use an eight-colour colour-blind-safe set (Okabe and Ito). [https://jfly.uni-koeln.de/html/manuals/pdf/color_blind.pdf]
- **Against:** needs a project colour field (BRIEF section 7 says none exists) and named new tokens, because the existing pigments are already stage and state. Asana shows what happens when project colour competes with status. Eight hues also exceeds the five-to-seven ceiling. [https://forum.asana.com/t/anyway-to-change-the-source-of-task-colour/792779]

**Combinations.** A and B on one card means two colours per card; by principles 2 and 4, avoid it. B plus an ink-word stage (no stage colour) is the least calm-risky pairing. C is the highest-value and highest-cost option.

## 6. Evidence limits

- Interior-design vendor pages are marketing pages and mostly silent about colour. Programa, Mydoma and DesignFiles colour use is unconfirmed; Houzz Pro's is one sentence. Needs a demo or help-centre check if the founders care.
- Apple's Human Interface Guidelines and Material Design's dark-theme page did not return their body text, so I did not rely on them. The Height shutdown date is from a search result only.
- The Okabe and Ito PDF is cited from search results, not opened; the Nature Methods correction page required a login redirect.
- The Asana colour claims come from community threads, which are older than the current product and are not Asana's help pages.
- The Linear docs I could open do not describe label or priority icon colours; I have not asserted any.
- "Calm" ratings are editorial. No tool was run; all findings are from documentation and changelogs.

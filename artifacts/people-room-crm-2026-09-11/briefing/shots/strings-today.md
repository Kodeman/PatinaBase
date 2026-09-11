# People room strings today

Source: apps/designer-portal/src/components/document/people (tests excluded). Extracted 2026-09-11 by regex: JSX text nodes, label/placeholder/title/aria-label/sub/eyebrow attributes, and every multi-word string literal (Tailwind and import lines skipped). Cite as path:line relative to the worktree. Prefix each path with apps/designer-portal/src/components/document/people/. kind = jsx (text between tags), attr name, or lit (string literal in code: copy tables, ternaries, sheet titles).

## directory/add-person-sheet.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 88 | lit | \|\| k === |
| 99 | lit | a client |
| 100 | lit | a maker |
| 101 | lit | a GC |
| 102 | lit | a sub |
| 103 | lit | an installer |
| 104 | lit | a receiver |
| 137 | lit | general contractor |
| 142 | lit | client rep |
| 193 | lit | Untitled project |
| 243 | lit | this contact |
| 303 | lit | An email brings them onto the roster — and lets you reach them. |
| 332 | lit | ${label} is already on Patina — linked to their account, now on your roster. |
| 334 | lit | ${label} added — a magic-link invite is on its way. |
| 335 | lit | ${label} added to your roster. |
| 344 | lit | Could not add them just now. Try again. |
| 353 | lit | A maker needs at least a name — the shop you order from. |
| 367 | lit | ${result.vendor.name} added — a new maker on your roster. |
| 368 | lit | ${result.vendor.name} was already in the book — now on your roster. |
| 376 | lit | Could not add the maker just now. Try again. |
| 386 | lit | Field crew work a project — pick which one they’re on. |
| 390 | lit | A ${KIND_NOUN[kind]} needs a name. |
| 395 | lit | Texting updates needs a phone number — or turn the toggle off. |
| 401 | lit | Record how and where they gave prior consent before sending a text. |
| 421 | lit | the project |
| 424 | lit | ${trimmedName} added to ${proj} — a text confirmation is on its way. |
| 425 | lit | ${trimmedName} added to ${proj}. |
| 433 | lit | Could not add them just now. Try again. |
| 466 | lit | This company needs a name. |
| 466 | lit | This contact needs a name. |
| 515 | lit | ${confirmationName}’s details are saved. |
| 520 | lit | Could not save just now. Try again. |
| 541 | lit | Update ${contactDisplayName}’s card — the whole studio sees the change. |
| 543 | lit | Add a client to your directory. They appear on your roster at once; an optional invite gives them a Patina login. |
| 545 | lit | Add a maker — a shop you order through. They join your roster and the Orders book can route POs to them. |
| 546 | lit | Add a ${KIND_NOUN[kind as PartyKind]} to a project. With a phone and a text opt-in, you can coordinate them over SMS — and they land on your People roster. |
| 552 | lit | Edit ${contactDisplayName} |
| 552 | lit | Add someone to your people |
| 555 | lit | Edit · your rolodex |
| 555 | lit | Add · to your roster |
| 558 | lit | Edit ${contactDisplayName} |
| 558 | lit | Bring someone in |
| 579 | jsx | Patina account. Trade, company, and notes still update here. |
| 586 | lit | Company name |
| 598 | lit | e.g. Moretti Plumbing |
| 598 | lit | e.g. Sal Moretti |
| 615 | placeholder | e.g. Moretti Plumbing |
| 630 | jsx | Which trade… |
| 648 | placeholder | Anything worth remembering… |
| 678 | placeholder | sal@morettiplumbing.com |
| 694 | placeholder | e.g. Sarah Whitfield |
| 707 | placeholder | sarah@whitfield.com |
| 712 | jsx | PostHog is still answering, so a non-pilot studio never sees the |
| 737 | lit | no email yet |
| 759 | jsx | Send a magic-link invite to Patina |
| 777 | jsx | Add a lead in the pipeline |
| 790 | placeholder | e.g. Dunes & Grain Workshop |
| 801 | placeholder | e.g. upholstery, casegoods, lighting |
| 806 | jsx | Orders email |
| 813 | placeholder | orders@dunesandgrain.com |
| 827 | placeholder | dunesandgrain.com |
| 838 | aria-label | Project |
| 840 | jsx | Which project… |
| 849 | jsx | No active projects yet — field crew join from a live project. |
| 858 | placeholder | e.g. Sal Moretti |
| 869 | placeholder | e.g. Moretti Plumbing |
| 882 | aria-label | Trade |
| 884 | jsx | Which trade… |
| 915 | placeholder | sal@morettiplumbing.com |
| 927 | jsx | They gave prior express consent for text updates |
| 929 | jsx | Optional and never preselected. They agreed to Patina project |
| 951 | aria-label | SMS consent method |
| 953 | jsx | Choose a method… |
| 954 | jsx | Verbal agreement |
| 955 | jsx | Written agreement |
| 956 | jsx | Website or form |
| 957 | jsx | Other documented consent |
| 964 | placeholder | Where and when they agreed, e.g. signed site kickoff form on Aug 8 |
| 969 | jsx | Keep the underlying form, message, or signed record. Patina stores |
| 1005 | lit | Add to roster |

## directory/ask-bar.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 22 | lit | ; role: PartyRole \| |
| 73 | jsx | Ask the Engine |
| 81 | placeholder | Find someone, or ask who to reconnect with |
| 87 | aria-label | Ask the Engine |

## directory/client-letter-line.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 53 | lit | On your roster · no letter sent |
| 58 | lit | Opened ${when} |
| 62 | lit | Signed in ${when} |
| 66 | lit | Link lapsed ${when} |
| 69 | lit | Letter sent ${when} |
| 118 | lit | A letter went out within the hour. You can write again after that. |
| 120 | lit | Could not send it just now. |
| 122 | lit | A fresh letter is on its way. |
| 131 | lit | Could not send it just now. |
| 151 | lit | Your letter is on its way. |
| 157 | lit | Could not send it just now. |
| 199 | jsx | Write again |
| 213 | lit | Write to ${given} |
| 213 | lit | Write the letter |
| 220 | jsx | may not carry a |
| 250 | jsx | Not now |

## directory/company-row.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 35 | lit | GC firm |
| 78 | lit | ${companyPeopleCount} ${companyPeopleCount === 1 ? 'person' : 'people'} |
| 81 | lit | ${projectsCount} ${projectsCount === 1 ? 'project' : 'projects'} |
| 84 | lit | Not yet on a project |

## directory/letter-line-field.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 26 | lit | Say why you added them and what they'll find. Two lines is plenty. |
| 52 | lit | NO NAME |
| 54 | lit | NO PROJECT YET |
| 55 | lit | ADDED TODAY |
| 61 | lit | Up to ${LETTER_NOTE_MAX} characters |
| 62 | lit | That's the whole ${LETTER_NOTE_MAX}. |
| 63 | lit | ${LETTER_NOTE_MAX - length} left |
| 68 | lit | A line for ${givenName} |
| 68 | lit | A line to send with it |
| 73 | lit | Send ${givenName} the letter |
| 73 | lit | Send them the letter |
| 87 | lit | : opts.pronoun === |
| 89 | lit | : opts.pronoun === |
| 90 | lit | : opts.pronoun === |
| 92 | lit | ${subject} ${verb} one email from ${from} with your line in it and a link that signs ${object} in. Leave it off and ${possessive} on your roster only — you can write later. |
| 97 | lit | ADD AND SEND THE LETTER |
| 97 | lit | ADD TO YOUR PEOPLE |
| 109 | lit | ${opts.label} was already on Patina — linked to your roster now; a short letter tells them so. |
| 110 | lit | ${opts.label} was already on Patina — linked to your roster now; no letter was sent. |
| 113 | lit | ${opts.label} is on your roster. Your letter is on its way to ${opts.email}. |
| 114 | lit | ${opts.label} is on your roster. Nothing was sent. |
| 196 | lit | ${facts.clientName?.trim()?.toUpperCase() ?? facts.clientEmail} · ${facts.clientEmail} |

## directory/makers-marketplace.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 100 | lit | ).localeCompare(String(b.name ?? |
| 115 | lit | Could not save them just now — try again. |
| 129 | placeholder | Search every maker… |
| 130 | aria-label | Search the marketplace |
| 177 | jsx | Opening the marketplace… |
| 183 | lit | The marketplace is empty — makers appear here as they join Patina. |
| 184 | lit | No makers match that. Loosen the search or the category. |
| 229 | jsx | On your roster |
| 235 | lit | maker-marketplace-row-${index + 1} |

## directory/person-row.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |

## directory/rolodex-seed-sheet.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 38 | lit | Ask an owner or admin to ${verb} this. |
| 40 | lit | Could not ${verb} this just now. |
| 63 | lit | Unnamed company |
| 190 | title | Seed the rolodex |
| 192 | jsx | The rolodex · seeded |
| 195 | jsx | Seed the rolodex |
| 198 | jsx | Patina folded the people and companies from your studio's past |
| 217 | jsx | Reading the rolodex… |
| 221 | jsx | Nothing folded in yet. The rolodex fills itself as you work |

## directory/scope-lens.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 40 | aria-label | Scope |

## directory/trade-chip-row.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 51 | lit | Filter by trade |
| 51 | lit | Filter by specialty |

## ops/nurture-queue.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 50 | jsx | Reach out |

## ops/review-request-sheet.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 44 | lit | This project has no linked client record to request from. |
| 60 | lit | Review request queued for ${first}. |
| 61 | lit | Review request sent to ${first}. |
| 67 | lit | Could not send the request. |
| 77 | lit | Request a review from ${clientName} |
| 83 | lit | For ${projectName}. |
| 84 | jsx | The words a happy client writes are what bring the next one. |
| 93 | jsx | A personal note (optional) |
| 100 | placeholder | It was such a joy bringing your space to life — if you have a moment, I'd be grateful for a few words. |
| 107 | jsx | Send when (leave blank to send now) |
| 112 | lit | Send when (leave blank to send now) |
| 141 | lit | Queue the request |
| 141 | lit | Send the request |

## ops/thread-bits.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 95 | lit | \|\| p.role === |
| 113 | lit | Vendor brief |
| 115 | lit | Project thread |
| 137 | lit | ${Math.floor(months / 12)}y |

## ops/thread-conversation.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 104 | lit | Sent. One conversation, every surface — it lives here and on their document. |
| 146 | jsx | Reading the thread… |
| 150 | jsx | No messages yet — write the first below. |
| 178 | jsx | Message removed. |
| 206 | aria-label | Write a reply |
| 207 | placeholder | Write a reply… |
| 228 | lit | Send failed — try again. |

## ops/thread-row.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 34 | lit | ${thread.unread_count} unread |
| 35 | lit | Open the conversation |

## ops/touchpoint-sheet.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 24 | lit | Seasonal / holiday |
| 25 | lit | Project anniversary |
| 26 | lit | A piece that fits them |
| 27 | lit | A referral ask |
| 56 | lit | Touchpoints are for clients — open this person to reach them another way. |
| 71 | lit | Touchpoint scheduled for ${clientName.split(/\s+/)[0] \|\| clientName}. |
| 79 | lit | Could not schedule the touchpoint. |
| 89 | lit | Reach out to ${clientName} |
| 95 | jsx | A warm touch keeps the relationship alive — pick the occasion and when |
| 143 | jsx | Why now (a note to yourself) |
| 150 | placeholder | A lake house someday — that someday may be now. |
| 177 | jsx | Schedule the touchpoint |

## outreach/audience-rules.ts

| line | kind | string |
|---|---|---|
| 84 | lit | && status !== |
| 101 | lit | Founding Circle makers |
| 111 | lit | , rule: historyDormantRule( |
| 112 | lit | , rule: roleRule( |
| 112 | lit | Active leads |
| 114 | lit | , rule: trustRule( |
| 115 | lit | , rule: statusRule( |
| 116 | lit | , rule: roleRule( |
| 117 | lit | , rule: roleRule( |
| 134 | lit | by role · the directory |
| 136 | lit | by lifecycle status · the directory |
| 138 | lit | by recency of last touch · the directory |
| 140 | lit | by trust — revenue, projects, rating · the directory |

## outreach/audiences-tab.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 79 | lit | Segment “${name.trim()}” saved — drawn from your directory. |
| 85 | lit | Could not save the segment. |
| 94 | jsx | Every audience is a slice of your directory — segment by |
| 106 | label | Segments |
| 113 | lit | + New segment |
| 123 | jsx | Segment name |
| 128 | placeholder | Past clients to reconnect |
| 134 | jsx | Draw from the directory by |
| 150 | lit | who is in it and why |
| 183 | lit | Save segment |
| 191 | jsx | Reading your segments… |
| 204 | lit | ${s.estimated_size \|\| 0} people · ${s.description?.trim() \|\| 'from the directory'} |
| 212 | lit | Segment “${s.name}” removed. |
| 217 | lit | Could not remove the segment. |

## outreach/campaigns-tab.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 45 | lit | Sent · ${when} |
| 46 | lit | ${recipients} recipients |
| 47 | lit | ${rate}% opened |
| 55 | lit | Scheduled · ${when} · ${c.total_recipients \|\| 0} recipients |
| 58 | lit | Sending · ${c.sent_count \|\| 0} of ${c.total_recipients \|\| 0} |
| 81 | lit | sent · 30 days |
| 86 | lit | sends on record |
| 105 | lit | Campaign drafted. Review it, then send when you’re ready. |
| 114 | lit | Could not draft the campaign. |
| 125 | label | Campaigns |
| 132 | lit | + New campaign |
| 140 | label | Campaign name |
| 144 | placeholder | Spring portfolio reveal |
| 148 | label | Subject line |
| 152 | placeholder | A look at our latest rooms |
| 156 | label | Template |
| 162 | jsx | Choose a template… |
| 170 | label | Audience (from the directory) |
| 176 | jsx | Everyone on your list |
| 192 | lit | Draft campaign |
| 200 | jsx | Reading your sends… |
| 204 | jsx | No campaigns yet. Compose one above — it drafts from a template and a |
| 222 | lit | “${c.name}” is on its way. |
| 227 | lit | Could not send the campaign. |
| 240 | lit | Draft discarded. |
| 245 | lit | Could not discard the draft. |

## outreach/outreach-bits.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 26 | aria-label | Outreach sections |

## outreach/templates-tab.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 72 | lit | Template created. Open it to compose its blocks. |
| 80 | lit | Could not create the template. |
| 89 | label | Template library |
| 96 | lit | + New template |
| 106 | jsx | Template name |
| 111 | placeholder | Seasonal check-in |
| 117 | jsx | Default subject |
| 122 | placeholder | Thinking of your space this season |
| 152 | lit | Create template |
| 160 | jsx | Reading the library… |
| 164 | jsx | No templates yet. Author one above — the welcome note, the proposal |
| 181 | lit | “${t.name}” removed from the library. |
| 186 | lit | Could not remove the template. |

## party-profile-sheet.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 64 | lit | Only this project's designer can edit its crew. |
| 65 | lit | This person's record just changed — refresh to see it. |
| 96 | lit | ${typeof code === 'string' ? code : ''} ${msg} |
| 100 | lit | Could not save just now. Try again. |
| 131 | lit | Field photo |
| 149 | lit | 1px solid var(--color-pearl) |
| 352 | lit | \|\| consent === |
| 360 | lit | This party isn't attached to a project — reopen it from the roster. |
| 366 | lit | This party needs a name. |
| 436 | lit | Could not mint a link just now. |
| 449 | lit | Could not revoke the link. |
| 466 | lit | Texting updates needs a phone number — add one first. |
| 471 | lit | Record how and where they gave prior consent before sending a text. |
| 490 | lit | Could not invite them just now. |
| 497 | title | Field party |
| 501 | lit | Field party |
| 557 | jsx | Which trade… |
| 581 | jsx | Changing the number clears their texting opt-in — you'll |
| 604 | aria-label | Field party edit actions |
| 660 | lit | what's on me |
| 681 | jsx | Problem, no account needed. |
| 683 | lit | A link is live${activeLink.last_used_at ? |
| 684 | lit | No link yet. |
| 690 | lit | Copied to clipboard · shown once |
| 691 | lit | Copy now — shown once |
| 709 | lit | Regenerate field link |
| 710 | lit | Copy field link |
| 726 | jsx | No texts yet. |
| 728 | lit | Send the first one below. |
| 729 | lit | They’ll appear here once this party opts in. |
| 748 | placeholder | Send a text… |
| 749 | aria-label | Send a text |
| 756 | aria-label | Field text actions |
| 766 | jsx | Send text |
| 772 | lit | Send failed |
| 779 | jsx | Invite sent — waiting on their reply. You can text them once they |
| 784 | jsx | They opted out by text. Only they can rejoin by replying START. |
| 800 | jsx | They gave prior express consent for text updates |
| 802 | jsx | Optional and never preselected. They agreed to Patina |
| 811 | jsx | How consent was given |
| 828 | jsx | Choose a method… |
| 829 | jsx | Verbal agreement |
| 830 | jsx | Written agreement |
| 831 | jsx | Website or form |
| 832 | jsx | Other documented consent |
| 836 | jsx | Consent record |
| 842 | placeholder | Where and when they agreed, e.g. signed site kickoff form on Aug 8 |
| 847 | jsx | Keep the underlying form, message, or signed record. Patina |
| 867 | aria-label | Invite to texts actions |
| 878 | lit | Check the consent box above first |
| 883 | lit | Invite to texts — check the consent box above first |
| 887 | jsx | Invite to texts |
| 893 | jsx | Add a phone number to invite this party to texts. |

## people-room.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 106 | lit | Add person |
| 171 | lit | \|\| scopeParam === |
| 223 | lit | \|\| add === |
| 312 | lit | The Engine surfaced who is drifting out of touch — see the Nurture queue. |
| 319 | lit | your makers |
| 321 | lit | your general contractors |
| 323 | lit | your open leads |
| 324 | lit | your roster |
| 325 | lit | Filtered the directory to ${what}. |
| 382 | title | The People Room |
| 383 | lit | ${all.length} people |
| 388 | aria-label | People actions |
| 396 | jsx | Add person |

## person-bits.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |

## profile/maker-profile.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 60 | lit | Primary category — ${humanize(vendor.primary_category)} |
| 62 | lit | Market — ${humanize(vendor.market_position)} |
| 66 | lit | Located in ${loc} |
| 67 | lit | Made in ${vendor.made_in} |
| 70 | lit | ${lead['standard']}-day standard lead |
| 72 | lit | Terms — ${humanize(vendor.default_payment_terms)} |
| 73 | lit | Founding Circle maker |
| 74 | lit | Honors trade pricing |
| 77 | lit | A maker in your network — teach Patina more as you work together. |
| 157 | lit | Could not send the quote request |
| 166 | lit | Request a quote from ${vendorName} |
| 172 | jsx | Ask what it would take |
| 188 | aria-label | Quote request complete |
| 213 | placeholder | e.g. 12 dining chairs, custom upholstery |
| 224 | placeholder | e.g. delivery by mid-August |
| 233 | placeholder | Describe what you need a quote for… |
| 250 | aria-label | Quote request actions |
| 260 | jsx | Send request |
| 334 | jsx | Reading the maker… |
| 366 | lit | ${name} joined your roster. |
| 367 | lit | ${name} left your roster — still in the marketplace. |
| 373 | lit | Could not change the roster just now — try again. |
| 390 | label | Request a quote |
| 397 | label | Terms & orders → |
| 399 | lit | , { page: |
| 404 | jsx | On your roster |
| 409 | lit | Save to roster |
| 434 | jsx | The maker |
| 499 | lit | · ${avgRating.toFixed(1)}★ across ${reviewTotal} |
| 504 | jsx | No reviews yet — yours would be the first. |
| 515 | lit | A designer |
| 536 | title | Trade & orders |
| 548 | lit | , { page: |
| 556 | title | Your roster |
| 559 | lit | On your roster — they read as one of your makers across the studio. |
| 560 | lit | Not on your roster yet. Saving admits them to your directory. |
| 578 | lit | Remove from roster |
| 578 | lit | Save to roster |
| 584 | title | Track record |
| 587 | lit | ${avgRating.toFixed(1)}★ across ${reviewTotal} ${reviewTotal === 1 ? 'review' : 'reviews'} |
| 590 | lit | ${productTotal} ${productTotal === 1 ? 'piece' : 'pieces'} in the book |
| 592 | lit | Founding Circle maker |
| 593 | lit | Honors trade pricing |

## profile/profile-cards.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 131 | title | Nurture |
| 143 | jsx | Reach out |
| 152 | title | Private note |
| 157 | jsx | No note yet — the quiet things you want to remember about them live here. |

## profile/profile-shell.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 70 | lit | ${role} profile actions |

## profile/relationship-journey.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 80 | lit | The relationship begins here — its history fills in as you work together. |
| 90 | jsx | Relationship journey |

## profile/style-dna.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 72 | jsx | Style DNA · the Engine's read |

## profile/your-eye.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 53 | lit | still learning |
| 61 | lit | ${value > 0 ? pole.moreRight : pole.moreLeft} than the house |
| 63 | lit | leans into ${label} |
| 63 | lit | leans away from ${label} |
| 75 | lit | ${value.length} ${key.replace(/_/g, ' ')} |
| 80 | lit | ${value} ${key.replace(/_/g, ' ')} |
| 97 | jsx | Reading your eye… |
| 121 | jsx | Your eye is still being learned from your teaching. Weigh a few pairs and it starts to take shape. |
| 134 | title | Center of gravity |
| 134 | lit | Where your choices settle, across the six dimensions. |
| 142 | lit | Not settled yet — it takes shape from your judgments and portfolio. |
| 149 | title | Signature moves |
| 150 | lit | Named leans the Engine has noticed. Confirm the true ones, soften or mute the rest — your edits never rewrite what was learned. |
| 164 | lit | None named yet — signature moves emerge once your judgments accumulate. |
| 170 | title | Confidence by style |
| 170 | lit | How settled your eye is, style by style. |
| 185 | lit | Nothing measured yet — this fills in as your teaching meets validation. |
| 192 | title | Where you diverge from the house |
| 193 | lit | That divergence is the point — it's what makes you you. |
| 268 | lit | the Engine proposes |
| 288 | label | Bring it back |
| 292 | label | That's me |
| 295 | label | Softer |
| 305 | label | Stronger |
| 314 | label | Not me |
| 353 | lit | Nothing measured yet — divergence shows once your eye and the house are both on record. |

## promote-band.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 45 | jsx | In the rolodex — the whole studio can find them now. |
| 70 | jsx | Add to the rolodex |
| 76 | lit | Could not add them to the rolodex just now. |

## view-shell.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 165 | lit | person drifting |
| 165 | lit | people drifting |
| 201 | jsx | In this room |
| 235 | lit | Person profile |
| 290 | lit | Choose People view. Current view: ${currentLabel} |
| 296 | jsx | Current view |
| 312 | aria-label | Choose a People view |
| 347 | jsx | Room shell, directory, and navigation contract are in place around it. |

## views/directory-view.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 134 | lit | No one on your roster yet. Add a client, or capture a lead, and they land here. |
| 135 | lit | No clients yet. Add one with “+ Add” above and they appear here at once. |
| 136 | lit | No open leads. New inquiries land here, owing a reply within a day. |
| 137 | lit | No makers yet. Makers you order through Patina and your own shops gather here. |
| 139 | lit | No field crew yet. Add a GC, sub, installer, or receiver from “+ Add” — with a phone and a text opt-in, you can coordinate them here. |
| 140 | lit | Just you so far. Studio teammates appear here as you bring them on. |
| 141 | lit | No general contractors yet. |
| 142 | lit | No subs yet. |
| 143 | lit | No installers yet. |
| 144 | lit | No receivers yet. |
| 146 | lit | No companies in the studio rolodex yet. They fold in from past projects, or promote one from a party sheet. |
| 156 | lit | ${name.trim().toLowerCase()}\|${phoneE164 ?? ''} |
| 226 | lit | \|\| role === |
| 238 | lit | && makerLens === |
| 313 | lit | ${p.display_name} ${roleLabel(p.role)} ${company} ${p.email ?? ''} |
| 350 | lit | \|\| role === |
| 358 | title | Directory |
| 359 | sub | Everyone Patina works with — clients, makers, general contractors, and your studio — one roster. |
| 404 | jsx | The whole studio's book, not just yours. |
| 423 | lit | your roster |
| 424 | lit | the marketplace |
| 442 | lit | save = joins your roster |
| 442 | lit | ${rows.length} admitted |
| 461 | jsx | Reading the rolodex… |
| 477 | lit | Unnamed company |
| 498 | jsx | No one on file at this company yet. |
| 512 | jsx | Reading the roster… |
| 518 | lit | Browse the marketplace |
| 530 | lit | Add a maker |
| 530 | lit | Add a client |
| 530 | lit | Add someone |
| 534 | jsx | No one by that name here. Check the spelling, or |
| 538 | lit | That's everyone in ${roleLabel(role as PartyRole).toLowerCase()} — none of them match this trade yet. |
| 565 | lit | s own line, outside the row |
| 566 | lit | Write again |

## views/nurture-view.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 40 | title | Nurture |
| 41 | sub | The relationships that need tending — surfaced by the Engine, so no one drifts away unnoticed. |
| 46 | jsx | Reading who needs tending… |
| 50 | jsx | Every relationship is current — nothing to tend. The Engine surfaces someone here the |
| 74 | jsx | Warm · keep tending |

## views/outreach-view.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 40 | title | Outreach |
| 41 | sub | Marketing at relationship scale — campaigns, templates, and audiences, all drawn from the same directory. |

## views/person-profile.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 130 | lit | That card changed while you were editing it — reopen it to try again. |
| 140 | lit | Edit rolodex card |
| 152 | lit | Their rolodex card is updated — this project’s roster keeps its own record. |
| 292 | lit | ] as string) ?? |
| 412 | lit | ${name} has no portal login yet — invite them to start a direct thread. |
| 424 | lit | Couldn't open a thread with ${name} just now — try again. |
| 442 | label | Message |
| 448 | label | Schedule a touchpoint |
| 451 | lit | Composing a touchpoint for ${firstName} — pick a template (check-in, holiday, milestone) and a send time. Nurture keeps the relationship warm. |
| 457 | label | View as them |
| 460 | lit | Opens the client mirror — what ${firstName} sees of this relationship. |
| 467 | label | Edit details |
| 509 | title | Projects |
| 512 | lit | No projects yet — they open here as you start work together. |
| 514 | title | Trust & history |
| 531 | lit | ${client.total_projects} ${client.total_projects === 1 ? 'project' : 'projects'} together |
| 535 | lit | $${Math.round(client.total_revenue).toLocaleString('en-US')} in lifetime work |
| 541 | lit | Satisfaction ${client.satisfaction_score.toFixed(1)} / 5 |
| 542 | lit | Came by referral |
| 546 | lit | ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'} collected |
| 548 | lit | First engagement — building trust |
| 566 | lit | Handed over on paper — waiting on the signed copy to record. |
| 568 | lit | Proposal out — a nudge or a call may be overdue. |
| 570 | lit | Still drafting — nothing has gone to them yet. |
| 574 | lit | New relationship — open the conversation within a day. |
| 575 | lit | \|\| statusRaw === |
| 577 | lit | ${humanizeSince(lastTouchAt, now)} since last touch — the Engine recommends reconnecting now. |
| 579 | lit | Drifting a little — last touched ${humanizeSince(lastTouchAt, now)}. Worth a check-in soon. |
| 580 | lit | A completed relationship — keep it warm with the occasional note. |
| 582 | lit | On an active project together — the relationship is live. |
| 667 | lit | ] as string) ?? |
| 688 | label | Open in Orders |
| 692 | lit | Cross-links to the Orders book — ${name}'s terms, orders, and lead times live there. |
| 699 | label | Coordination |
| 719 | lit | On an active project together — the shared history fills in as work moves. |
| 720 | lit | A maker in your network — orders and lead times live in the Orders book. |
| 726 | title | Engagements |
| 731 | lit | No active project on file. |
| 732 | lit | Their orders live in the Orders book — open it to see the full ledger. |
| 735 | title | Track record |
| 749 | lit | Founding Circle maker |
| 750 | lit | ] as string) ?? |
| 751 | lit | Primary category — ${cat.replace(/_/g, ' ')} |
| 754 | lit | ${lead['standard']}-day standard lead |
| 755 | lit | Honors trade pricing |
| 764 | lit | ${rating.toFixed(1)}★ across ${reviews} ${reviews === 1 ? 'review' : 'reviews'} |
| 768 | lit | ] as string) ?? |
| 770 | lit | Tracked party on the project — appears in the ball-in-court. |
| 772 | lit | Building a track record together. |
| 820 | label | Adjust visibility |
| 823 | lit | Opens this teammate's document access — margin visibility is set per document in studio settings. |
| 839 | jsx | The colophon · margin visibility |
| 842 | lit | )[0]} is on your studio as{ |
| 856 | title | On these documents |
| 859 | lit | Not assigned to a document yet. |
| 863 | title | On these documents |
| 866 | lit | Not assigned to a document yet. |
| 870 | title | Studio role |
| 873 | lit | Reads the document with margin visibility |
| 885 | lit | lead designer |
| 887 | lit | support designer |
| 891 | lit | previous lead |
| 893 | lit | studio teammate |
| 921 | lit | Reading the relationship… |
| 922 | lit | We couldn't find this ${roleLabel(role).toLowerCase()}. |
| 941 | lit | \|\| person.role === |

## views/portfolio-view.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 72 | title | Portfolio |
| 73 | sub | The finished rooms — your completed work, ready to show the next client and feed reviews. |
| 78 | jsx | Gathering the finished rooms… |
| 83 | jsx | No finished rooms yet. Completed projects land here — your portfolio builds itself as you |

## views/reviews-view.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 101 | jsx | Reading the feedback… |
| 110 | lit | No reviews to ask for yet. Completed projects surface here, ready for a request. |
| 121 | lit | Project complete — request the review now |
| 124 | lit | pending-review-${index + 1} |
| 144 | jsx | Request sent — awaiting their words |
| 162 | lit | No reviews collected yet — they'll gather here as clients reply. |
| 178 | lit | Review collected. |
| 189 | lit | collected-review-${index + 1} |
| 203 | lit | Removed from the portfolio. |
| 204 | lit | Now showing in the portfolio. |
| 211 | lit | On portfolio |
| 212 | lit | Show on portfolio |
| 224 | lit | Nothing queued. Review requests you schedule for later appear here. |
| 235 | lit | Request scheduled for ${new Date(r.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} |
| 236 | lit | Queued for delivery |
| 247 | title | Reviews |
| 248 | sub | Feedback collection — request, track, and celebrate the words that bring the next client. |
| 257 | lit | avg. rating |
| 259 | lit | on portfolio |

## views/threads-view.tsx

| line | kind | string |
|---|---|---|
| 1 | lit | use client |
| 58 | title | Threads |
| 59 | sub | Every conversation in one inbox — client, project, and vendor threads, scope-filtered. |
| 85 | jsx | Gathering the conversations… |
| 91 | lit | No conversations yet. Threads opened from a project, a vendor brief, or a profile gather here. |
| 92 | lit | No ${scope} threads yet. |


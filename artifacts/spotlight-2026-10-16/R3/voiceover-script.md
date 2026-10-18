# R3 VoiceOver script: three spotlight sites (K15 gate)

About ten minutes, on the local walk build or prod after the R3 deploy. Use Safari on macOS with VoiceOver on (⌘F5). VO means Control-Option. Sign in as a studio owner who has the Desk seed: an overdue Chen Residence balance, the Okonkwo residence directory, and Adaeze Okonkwo with a phone but no text consent.

Each site lists what you do and what you should hear. The quoted lines are what the R3 walk recorded in the `role=status` line and the bar (`report.md`). The exact punctuation VoiceOver speaks may differ slightly.

## Site 1: a multi-hold act. Desk → Set aside until a day (about 4 min)

1. On the Desk, use VO-Right to reach the Chen Residence line. Tab to **Until…** and press VO-Space.
   - **Expect:** a "Set aside until a day" sheet opens, and focus is inside it.
2. Use VO-Right to read the sheet before pressing anything (K3).
   - **Expect:** "Back on", the date field, "Choose a date from the calendar.", then "Waiting on" and its empty field. The act reads "Set aside", dimmed, with its reason.
3. Tab to **Set aside** and press VO-Space.
   - **Hear:** "2 things need attention. First: Choose a day after today."
   - **Check:** focus moves into the first lit window (the Back on field). It does not stay on the button or go to the page behind.
4. Press Tab about ten times, then Shift-Tab about six times.
   - **Check:** you hear only the two lit fields and the bar's **Next** and **Close**. Nothing behind the scrim is spoken, and nothing outside the sheet.
5. Press Esc once.
   - **Check:** you hear the spotlight close, and focus is back on **Set aside**. The sheet is still open. Press Esc a second time only if you want the sheet to close.
6. Press **Set aside** again. Activate the bar's **Next**, then type a few words into **Waiting on**.
   - **Hear:** the status updates live to one remaining thing ("Choose a day after today."). Focus stays in the field while you type and is not pulled away.
7. Esc twice to put the sheet back.

**Pass if:** the count is spoken, focus lands inside the windows, Tab never leaves them, the first Esc closes only the spotlight, and the fix updates the announcement without moving focus.

## Site 2: a single-reason refusal. People → Adaeze Okonkwo → Send text message (about 2.5 min)

1. Go to Studio contacts (People) and open **Adaeze Okonkwo**.
2. Use VO-Right down the card to **Send text message**.
   - **Expect:** it reads dimmed. Its reason is spoken as the description: "The studio holds no standing consent for this number, so no text may go out."
3. Press VO-Space on it.
   - **Hear:** one thing needs attention, naming the consent reason.
   - **Check:** focus lands in the single lit window, on the reason, or on the bar. Exactly one window is drawn.
4. Tab through.
   - **Check:** you hear only the window and the bar's **Close**. There is no Next, because there is only one thing.
5. Press Esc.
   - **Check:** focus returns to **Send text message**, and the card is still open.

**Pass if:** the refusal is understandable from speech alone, with one window and no dead-end focus.

## Site 3: the Desk tour (about 3.5 min)

1. Open `/desk?tour=desk-walkthrough`, or use ⌘K → "Studio orientation".
   - **Hear:** "Step 1 of 6: …", the step heading and its body, from the status line. Focus is on the primary button (**Next**).
2. Press VO-Space on **Next** five times. At each step, listen for "Step N of 6".
   - **Check:** the step heading matches the lit region: the greeting, the folio, the contents, the studio drawer, Find anything, and Record an inquiry.
   - **Check:** Step 4, the studio drawer, sits outside the Desk frame. It still has its bar and announcement, but no window (K2).
3. At step 3, press Shift-Tab.
   - **Check:** you hear **Back**, then **Skip tour**. Activate **Back** once and confirm you hear "Step 2 of 6".
4. On step 6, activate **Done**.
   - **Check:** the tour ends, and the Record an inquiry sheet opens with focus inside it.
5. Replay the tour and press Esc at step 2.
   - **Check:** the tour closes, the Desk is unchanged, and focus is not lost to the page top.

**Pass if:** every step announces its position and heading, focus never escapes the bar mid-tour, and Done and Esc both leave you somewhere sensible.

## Record

Note pass or fail per site, plus any line VoiceOver spoke that a designer would not understand. Post it on the R3 release ticket.

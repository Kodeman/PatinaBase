# Twilio support ticket: update approved A2P 10DLC campaign

Paste into Twilio Console → Help (?) → Submit a ticket → Product: Messaging → A2P 10DLC.
Subject line first, body below the rule. Attach nothing. Fill each `<…>` from the Console first (Regulatory Compliance → A2P 10DLC → Brands / Campaigns; Messaging → Services), or run `scripts/field-line/twilio-campaign-update.mjs list`; the IDs are kept out of this public repo.

**Subject:** Request to update an approved A2P 10DLC campaign (<TCR campaign ID>) — description, message flow, sample messages

---

Hello Twilio Support,

Please update the registered content of our approved A2P 10DLC campaign. The Console "Edit Campaign" dialog opens with every field disabled for this campaign, and the UsAppToPerson update API returns:
"Campaign update is allowed only for FAILURE state(s). It is not allowed in the current state SUCCESS".

- Account SID: <AC… account SID>
- Brand: PATINA — <BN… brand SID>
- Messaging Service: <MG… messaging service SID>
- Campaign: <QE… campaign SID> (TCR campaign ID <TCR campaign ID>), Low-Volume Mixed, VERIFIED

The use case, the four content flags (embedded links: yes; embedded phone: no; age-gated: no; direct lending: no), opt-in/opt-out/help keywords, and the Privacy Policy and Terms URLs are unchanged. Only the three text fields below change. The existing website login-code and order-notification traffic continues; we are adding a second, related message stream on the same brand.

## Campaign description (replace with)

Patina LLC operates patina.cloud, a B2B platform connecting interior designers with independent makers. This campaign sends two types of messages to registered users who have created an account and provided their mobile number: (1) one-time passcodes for login verification and password reset, sent only when the user initiates the request, and (2) account and order notifications triggered by activity on the user's own account, including quote requests received, quote responses, order status changes, production milestone updates, and shipment notifications. Users opt in during account signup by checking a consent box next to their phone number and confirm enrollment via a verification code. Volume is low and all messages are triggered by the recipient's own activity. Messages identify Patina as the sender and include STOP to opt out and HELP for assistance.

This campaign also carries operational coordination between an interior design studio using Patina and the trades and homeowners on its projects: opt-in invitations, site and delivery coordination, daily open-item digests, selection approvals, and delivery windows. Recipients are the contractors and tradespeople working on the studio's projects and the homeowners who hired the studio. A tradesperson receives exactly one invitation after the studio records their verbal agreement, and texting begins only when they reply YES with the code in that invitation. A homeowner opts in through a separate, unchecked consent checkbox on the studio's kickoff form and confirms the same way. These messages lead with the studio's name, run about one per day, and end with message-and-data-rates, HELP and STOP wording. No marketing.

## Message flow / how end users consent (replace with)

Website: end users opt in by creating an account at https://patina.cloud/signup and entering their mobile number. Below the field is an unchecked consent checkbox reading: "I agree to receive account and order notification text messages and login verification codes from Patina at the mobile number provided. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to cancel at any time. See our Privacy Policy and SMS Terms." Consent is not a condition of creating an account or using the platform. Users can revoke it at any time from Account Settings > Notifications or by replying STOP.

Contractors and tradespeople on a studio's project: the design studio asks the tradesperson in person or by phone whether they want project texts and records that verbal agreement in Patina with a timestamp. Patina then sends exactly one invitation that names the studio, the project, the ~1 msg/day frequency, and rates/HELP/STOP wording. No further messages are sent unless the tradesperson replies YES with the code in the invitation. START re-sends a pending invitation and never grants consent by itself.

Homeowners who hired the studio: on the studio's project kickoff form the homeowner ticks a separate, unchecked checkbox consenting to project texts from their studio through Patina; the disclosure text and its version are stored on their record. Patina then sends one invitation and messages only after the homeowner replies YES with the code.

All recipients can reply STOP at any time. Consent is stored per project and is never shared between studios. Terms of Service: https://patina.cloud/terms. Privacy Policy: https://patina.cloud/privacy.

## Sample messages (replace the four existing samples with these five)

1. Your Patina verification code is 482913. It expires in 10 minutes. Do not share this code
2. Middlewest Studio coordinates the Maple St project through Patina and would like to text you job updates, about 1 msg/day. Reply YES 42 to start. Msg&data rates may apply. Reply HELP for help, STOP to opt out.
3. Middlewest Studio - Maple St today: Ref 17 install vanity, Ref 18 confirm grout color. Reply DONE 17, or send a photo or note. Full list: https://client.patina.cloud/f/AbCdEfGh Msg&data rates may apply. Reply HELP for help, STOP to opt out.
4. Middlewest Studio - Maple St: your bath tile selection is ready for your approval. Ref 31: reply APPROVE 31, or reply with a question. See it: https://client.patina.cloud/s/AbCdEfGh Msg&data rates may apply. Reply HELP for help, STOP to opt out.
5. Patina: Your order #2210 shipped. Tracking at patina.cloud/o/2210. Reply STOP to unsubscribe, HELP for help

If a re-vetting fee applies, please proceed. If the update cannot be applied to a verified campaign and a new registration is the only route, please say so before creating anything.

Thank you,
Kody Kochaver
Patina LLC, Madison WI
hello@patina.cloud

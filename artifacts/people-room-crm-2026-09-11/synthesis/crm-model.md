# CRM model: the construction CRM Patina's People room must hold

Synthesis of six construction seats (CS1 GC/PM, CS2 superintendent, CS3 estimator, CS4 trade owner, CS5 owner's rep, CS6 office/compliance) against the Okonkwo fixture and the Lindqvist bring-forward. Evidence convention: code paths are relative to the worktree root; briefing files are cited as `current-state.md:NNN`, `fixture.md` `F-nn`, gaps `G-n`, prior decisions `PD-n`.

---

## 1. Entity model (the CRM's nouns)

Fifteen objects. Surrogate primary keys are listed here and omitted from §2.

| # | Entity | Purpose (one line) | Key fields | Cardinality | Who maintains | Source of truth |
|---|---|---|---|---|---|---|
| E1 | Person | One human, once, across every job, firm, and studio surface | person_id; name; primary phone; primary email; contact posture | 1 human = 1 row per studio rolodex | studio member who first enters or picks them | the rolodex person card |
| E2 | Company (firm) | The unit of compliance, contract, and payment | company_id; legal name; kind; trades; payee identity | 1 firm = 1 row per studio | studio office / bookkeeper | the rolodex company card |
| E3 | Household | The client side as a group, not a login | household_id; members; change-order threshold | 1 per client project family | lead designer | the studio client book |
| E4 | Affiliation (person at firm) | Which person does what at which firm, and who routes to whom | affiliation_id; person; company; role_at_firm | N persons x N firms, dated | studio member | the person card, under the firm |
| E5 | Role-on-project (engagement) | One human on one job in one capacity; the seat | engagement_id; project; person; company; kind; trade; stage; window | 1 human = N engagements | lead designer / project lead | the project roster |
| E6 | Reach channel | Every way a person or firm is actually reachable, typed | channel_id; owner; kind; value; verified; preferred | N per person, N per firm | studio member; verified by the send rails | the person or company card |
| E7 | Contact rule | What channel is required, forbidden, or routed elsewhere | rule_id; allowed; forbidden; route_to; hours | 1 per person, optional per-job override | studio member who learned the rule | the person card, job override wins for that job |
| E8 | Consent | Permission to use a channel, per studio, per channel value | consent_id; studio; channel value; status; source; evidence | 1 per (studio, channel value), never per project | the inbound rail plus the member who captured it | the consent record, reduced across every row on that value |
| E9 | Access grant | Any door: account, seat, token link, with an end date | grant_id; tier; subject; scope; expires; revoked | N per person or engagement | studio member who mints it | the grant record |
| E10 | Compliance document | A paper with an expiry that gates site, payment, or draw | document_id; holder; type; number; expires; file; verified | N per firm, some per person | studio office / bookkeeper | the company card (person card when sole proprietor) |
| E11 | Lien waiver | Per draw per firm: conditional then unconditional | waiver_id; company; project; draw_no; type; through-date | N per firm per project | bookkeeper | the draw ledger on the company card |
| E12 | Authority grant | Who may approve what, up to what number, on this job | authority_id; engagement; scope; threshold; prepares_only | N per engagement | principal / lead designer, from the agreement | the engagement, defaulted from the firm or household |
| E13 | Touch / thread | The last contact, its channel, its decision class, and whether it counted | touch_id; subject; channel; direction; decision_class; authority_check | N per person | the send and inbound rails | the message rails, derived onto the person |
| E14 | Lifecycle stage | Where this firm or engagement sits, dated, with history | stage_id; subject; stage; entered_at; reason | N rows, 1 current | derived from agreements, draws, project status; overridable | the stage history |
| E15 | Site access card | How a body gets on site, who holds the key, who was told | project; codes; key holder; hours; emergency lines; change log | 1 per project | superintendent's facts, recorded by the lead designer | the project |

### Entity diagram

```
                       ┌─────────────────────┐
                       │  E3 HOUSEHOLD       │
                       │  threshold $        │
                       └──────────┬──────────┘
                                  │ members
   ┌───────────────┐   affiliation │        ┌────────────────────┐
   │ E1 PERSON     │◄──────E4──────┼───────►│ E2 COMPANY (firm)  │
   │ identity      │  role_at_firm │        │ payee of record    │
   └───┬───┬───┬───┘               │        └───┬────────────┬───┘
       │   │   │                   │            │            │
       │   │   └── E6 REACH CHANNEL (phone typed / email / app / link / paper)
       │   │             │ value
       │   │             ▼
       │   │       E8 CONSENT  (studio x channel value, NOT per project)
       │   │
       │   └────── E7 CONTACT RULE (allowed / forbidden / route_to)   ──┐
       │                                                                │
       │  is seated as                                                  │ job override
       ▼                                                                │
   ┌──────────────────────────────────────────┐                         │
   │ E5 ROLE-ON-PROJECT (engagement)          │◄────────────────────────┘
   │ project · kind · trade · stage · window  │
   └──┬──────────┬───────────┬────────────┬───┘
      │          │           │            │
      ▼          ▼           ▼            ▼
  E12 AUTHORITY  E9 ACCESS  E13 TOUCH   E14 LIFECYCLE STAGE ──► also on E2
  money/CO/site  GRANT      decision_class
                 (expires)
                                    ┌──────────────────────┐
   E2 COMPANY ──► E10 COMPLIANCE DOC│ COI · W-9 · license  │──blocks──► site / pay / draw
             └──► E11 LIEN WAIVER   │ per draw             │──blocks──► next draw
                                    └──────────────────────┘
   PROJECT ────► E15 SITE ACCESS CARD ──key_holder──► E5 engagement
```

---

## 2. Field dictionary

Every field traces to a seat finding or a fixture row. Types are logical, not DDL.

| Entity | Field | Type | Req | Who maintains | Source of truth | Why | Seat |
|---|---|---|---|---|---|---|---|
| Person | full_name | text | yes | studio member | person card | the name everything else hangs on | CS1-7 |
| Person | phone_primary_e164 | text | no | studio member | person card | dedupe key and the consent key | CS6-19 |
| Person | email_primary | text | no | studio member | person card | second dedupe key | CS3-15 |
| Person | email_status | enum ok/bounced/unsubscribed/dead/unknown | yes | email rail | send rail | F-11's dead address fails silently today | CS1-20 |
| Person | email_status_at | date | no | email rail | send rail | a bounce needs a date to be actionable | CS6-10 |
| Person | reach_preference | enum text/email/phone/office/app | no | studio member | person card | F-13 has no work cell | CS4-5 |
| Person | never_text | bool | yes | studio member | person card | F-27 AHJ must never be texted | CS4-5 |
| Person | do_not_contact | bool | yes | studio member | person card | F-15 takes no direct contact | CS1-3 |
| Person | do_not_contact_reason | text | no | studio member | person card | a rule without a reason gets overridden | CS6-5 |
| Person | route_to_person_id | fk Person | no | studio member | person card | F-15 routes to F-14 | CS6-6 |
| Person | profile_id | fk profiles | no | system on email match | auth | F-16 holds an account that cannot attach | CS5-12 |
| Person | archived_at | timestamp | no | studio admin | person card | soft delete only, PD-1 | CS1-7 |
| Person | studio_verdict | text + dated | no | studio member | person card | would rehire, would not, with reason | CS1-24 |
| Company | legal_name | text | yes | bookkeeper | W-9 | the check name and the 1099 name | CS6-12 |
| Company | dba_name | text | no | bookkeeper | company card | the name the field uses | CS6-12 |
| Company | company_kind | enum gc/sub/architect/engineer/lender/authority/showroom/vendor/workroom/supplier/stager/photography/maker | yes | studio member | vocabulary | half the fixture's firms have no kind today | CS1-22 |
| Company | trades | array FieldTrade | no | studio member | company card | a firm carries trades, a person does not | CS3-10 |
| Company | w9_on_file_at | date | no | bookkeeper | company card | blocks first payment and the 1099 | CS6-1 |
| Company | tax_id_last4 | text | no | bookkeeper | W-9 | duplicate vendor rows split the 1099 total | CS6-11 |
| Company | remit_to | text | no | bookkeeper | company card | payment goes to the firm, not the person | CS6-12 |
| Company | paperwork_contact_person_id | fk Person | no | studio member | company card | chase COI at F-14, not F-11's dead email | CS4-8 |
| Company | signer_person_id | fk Person | no | studio member | company card | F-15 signs what F-14 forwards | CS1-16 |
| Company | site_contact_person_id | fk Person | no | studio member | company card | the super needs one name per firm | CS2-4 |
| Company | retainage_bps | int | no | bookkeeper | trade agreement | 10% held on nine subs | CS4-23 |
| Company | warranty_until | date | no | derived from projects | company card | Lindqvist runs through 2026-11-21 | CS1-23 |
| Company | archived_at | timestamp | no | studio admin | company card | soft delete only | CS1-7 |
| Household | display_name | text | yes | lead designer | client book | "the Okonkwo household", not one spouse | CS1-14 |
| Household | member_person_ids | array fk Person | yes | lead designer | client book | F-04 and F-05 are one client | CS5-2 |
| Household | primary_member_person_id | fk Person | yes | lead designer | client book | the account the client page runs on | CS5-2 |
| Household | co_threshold_cents | int | yes | principal from the agreement | the owner agreement | the $2,500 line | CS5-1 |
| Affiliation | person_id | fk Person | yes | studio member | person card | a person works at a firm, they are not the firm | CS3-3 |
| Affiliation | company_id | fk Company | yes | studio member | company card | same | CS3-3 |
| Affiliation | role_at_firm | enum owner/signer/pm/superintendent/foreman/office_manager/dispatcher/estimator/ap_ar/rep/crew | yes | studio member | person card | F-14 is stored as a drywall tradesperson today | CS1-12 |
| Affiliation | is_paperwork_contact | bool | yes | studio member | company card | one door for COI and waivers | CS4-8 |
| Affiliation | is_signer | bool | yes | studio member | company card | who at the firm signs the subcontract | CS6-3 |
| Affiliation | holds_trade_license | bool | yes | studio member | person card | a master license is personal, a COI is the firm's | CS2-21 |
| Affiliation | from_date | date | no | studio member | person card | a PM leaves a sub mid-job | CS5 §1 |
| Affiliation | to_date | date | no | studio member | person card | the old cell keeps working for a month | CS5 §1 |
| Role-on-project | project_id | fk project | yes | lead designer | project | the seat is per job | PD-3 |
| Role-on-project | person_id | fk Person | no | lead designer | person card | null for a firm-only seat | CS1-7 |
| Role-on-project | company_id | fk Company | no | lead designer | company card | today company is a TEXT snapshot | CS5-6 |
| Role-on-project | party_kind | enum client/client_rep/receiver/gc/sub/installer/architect/engineer/inspector/lender/vendor/maker/stager/photographer/other_named | yes | lead designer | vocabulary | F-26 and F-27 fall to `other` and go dark | CS3-11 |
| Role-on-project | inspector_subtype | enum ahj/lender/third_party | no | lead designer | vocabulary | the AHJ and the draw inspector are not one thing | CS4-11 |
| Role-on-project | trade | enum FieldTrade | no | lead designer | vocabulary | radon is out of vocabulary today | CS3-10 |
| Role-on-project | trade_label | text | no | lead designer | engagement | required when trade = other_named | CS6-22 |
| Role-on-project | stage | enum prospect/invited_to_bid/bidding/declined/no_response/awarded/mobilized/active/closeout/warranty/off_job/retired | yes | lead designer, derived where possible | stage history | a bidder and a mobilized sub look identical today | CS3-9 |
| Role-on-project | on_site_from | date | no | lead designer | engagement | radon is 2027-02, the stager 2027-08 | CS2-18 |
| Role-on-project | on_site_to | date | no | lead designer | engagement | the photographer is one day | CS1-18 |
| Role-on-project | site_access_mode | enum controls/key/escorted/scheduled/none | yes | lead designer | engagement | F-09 controls, F-06 holds the key | CS4-20 |
| Role-on-project | contracted_through | enum studio/gc/owner | yes | lead designer | trade agreement | decides who chases paper and who may text about money | CS4-24 |
| Role-on-project | show_to_client | bool default false | yes | lead designer | engagement | PD-11 stands | CS2-20 |
| Role-on-project | warranty_until | date | no | derived at closeout | engagement | reach must outlive the link | CS4-17 |
| Role-on-project | warranty_contact_person_id | fk Person | no | lead designer | engagement | one named person per firm after close | CS5-25 |
| Role-on-project | off_job_at | date | no | lead designer | engagement | replaces the hard delete | CS2-17 |
| Role-on-project | off_job_reason | text | no | lead designer | engagement | dispute evidence | CS5-16 |
| Role-on-project | studio_contact_id | fk Person card | no | system at pick | lineage | PD-3 lineage kept | PD-3 |
| Role-on-project | bid_due_at | date | no | estimator | engagement | nobody owes a number by a date today | CS3-8 |
| Role-on-project | bid_outcome | enum asked/declined/no_response/quoted/selected | no | estimator | engagement | coverage counts lie without declines | CS3-2 |
| Role-on-project | bid_amount_cents | int | no | estimator | engagement | the number behind the award | CS3-7 |
| Role-on-project | bid_valid_until | date | no | estimator | engagement | quotes expire in 30 days | CS3-7 |
| Role-on-project | bid_quoted_by_person_id | fk Person | no | estimator | engagement | who at the firm owes the answer | CS3-8 |
| Reach channel | owner_ref | Person or Company | yes | studio member | card | a dispatch line belongs to the firm | CS2-15 |
| Reach channel | channel_kind | enum mobile/office/dispatch/after_hours/ap_email/email/app/account/field_link/paper/portal_311 | yes | studio member | card | F-27 schedules only through 311 | CS4-7 |
| Reach channel | value | text | yes | studio member | card | E.164 for phones | CS5-17 |
| Reach channel | label | text | no | studio member | card | "shop line", "order desk" | CS2-15 |
| Reach channel | sms_capable | bool | yes | studio member | card | an office line must not be offered an SMS invite | CS4-7 |
| Reach channel | verified | bool | yes | send rails | rails | a channel nobody has used is a guess | CS1-20 |
| Reach channel | verified_at | date | no | send rails | rails | staleness of the verification | CS1-20 |
| Reach channel | preferred | bool | yes | studio member | card | one preferred channel per kind | CS1-21 |
| Reach channel | status | enum ok/bounced/unsubscribed/dead | yes | send rails | rails | dead email blocks the send | CS6-10 |
| Contact rule | subject_ref | Person or Engagement | yes | studio member | person card | a job override is allowed, the person rule is the default | CS5-3 |
| Contact rule | channels_allowed | array channel_kind | yes | studio member | person card | F-13 is email and shop line only | CS3-12 |
| Contact rule | channels_forbidden | array channel_kind | yes | studio member | person card | F-27 never text, F-10 never text | CS2-5 |
| Contact rule | route_to_person_id | fk Person | no | studio member | person card | F-15 to F-14 | CS5-4 |
| Contact rule | contact_hours | text | no | studio member | person card | a 6 a.m. call pulled a crew | CS6-5 |
| Contact rule | escalation_by_class | map decision_class to channel | no | studio member | person card | F-05 wants a phone call over $2,500 | CS5-21 |
| Contact rule | reason | text | no | studio member | person card | rules without reasons get broken | CS6-5 |
| Contact rule | set_by | fk member | yes | system | audit | who learned the rule | CS3-12 |
| Contact rule | set_at | timestamp | yes | system | audit | dated | CS5-24 |
| Consent | studio_id | fk organization | yes | system | consent record | consent is per studio, never per project | CS1-4 |
| Consent | channel_value | text | yes | system | consent record | the phone, not the row | CS6-8 |
| Consent | channel_kind | enum sms/email | yes | system | consent record | email opt-out has no home today | CS6-10 |
| Consent | status | enum not_asked/pending/granted/opted_out | yes | inbound rail and member | consent record | F-12 reads Not asked while the gate refuses | CS4-6 |
| Consent | source | enum verbal/written/web_form/inbound_sms/other | yes | member | consent record | 10DLC evidence | CS2-6 |
| Consent | evidence_text | text | yes when pending | member | consent record | the kickoff form's words | CS2-6 |
| Consent | evidence_file | file | no | member | consent record | the form itself cannot be attached today | CS4-18 |
| Consent | disclosure_version | text | yes | system | consent record | carrier requirement | CS6-8 |
| Consent | recorded_by | fk member | yes | system | audit | who heard the yes | CS2-6 |
| Consent | recorded_at | timestamp | yes | system | audit | dated | CS2-6 |
| Consent | opted_out_at | timestamp | no | inbound rail | consent record | STOP has a date | CS1-4 |
| Consent | origin_project_id | fk project | no | system | consent record | "opted out on Lindqvist 2025-12-03" | CS3-14 |
| Access grant | tier | enum studio_member/project_team_seat/client_account/maker_account/field_link/rfq_link/agreement_link/plan_link/evidence_upload/doc_share/invoice_pay | yes | studio member | grant record | eleven doors with no single ledger | CS2-14 |
| Access grant | subject_ref | Person or Engagement | yes | studio member | grant record | a link belongs to a seat | CS4-13 |
| Access grant | scope_ref | project / document / draw | yes | studio member | grant record | what the door opens | CS4-19 |
| Access grant | granted_by | fk member | yes | system | audit | who minted it | CS5-18 |
| Access grant | granted_at | timestamp | yes | system | audit | dated | CS5-18 |
| Access grant | expires_at | timestamp | no | system | grant record | 90 days does not fit a ten-month job | CS1-8 |
| Access grant | last_used_at | timestamp | no | system | grant record | renew on use | CS2-8 |
| Access grant | revoked_at | timestamp | no | studio member | grant record | the revoke path per tier | CS5-18 |
| Access grant | revoke_reason | text | no | studio member | audit | why the door closed | CS5-16 |
| Compliance document | holder_ref | Company, Person, or Vendor | yes | office / bookkeeper | company card | COI is the firm's, a master licence is the person's | CS2-21 |
| Compliance document | doc_type | enum coi_gl/coi_wc/coi_auto/coi_umbrella/additional_insured/w9/license/bond/resale_cert/osha_card | yes | office | company card | one boolean covers all of these today | CS3-1 |
| Compliance document | number | text | no | office | the document | licence and policy numbers print on the site binder | CS6-25 |
| Compliance document | issuer | text | no | office | the document | carrier or state | CS6-1 |
| Compliance document | issued_on | date | no | office | the document | the start of cover | CS2-1 |
| Compliance document | expires_on | date | yes for dated types | office | the document | F-11 lapsed 2026-03-31 and nothing knows | CS1-1 |
| Compliance document | file_path | file | no | office | storage | the lender's inspector asks for the PDF | CS5-5 |
| Compliance document | verified_by | fk member | no | office | audit | "yes" was true last spring | CS4-1 |
| Compliance document | verified_at | date | no | office | audit | dated | CS6-13 |
| Compliance document | held_by | enum studio/gc | no | office | company card | the GC's office holds sub COIs in studio-led work | CS3 AA-4 |
| Compliance document | blocks | array site_access/payment/draw/contract/permit/mobilization | yes | vocabulary | vocabulary | a date with no gate changes nothing | CS2 §4 |
| Lien waiver | company_id | fk Company | yes | bookkeeper | draw ledger | waivers are per firm | CS4-9 |
| Lien waiver | project_id | fk project | yes | bookkeeper | draw ledger | per job | CS1-11 |
| Lien waiver | draw_no | int | yes | bookkeeper | draw ledger | the wrong through-date slipped a draw two weeks | CS6-4 |
| Lien waiver | waiver_type | enum conditional/unconditional | yes | bookkeeper | draw ledger | two per draw per firm | CS3-17 |
| Lien waiver | through_date | date | yes | bookkeeper | the waiver | must agree with the pay app | CS6 §6 |
| Lien waiver | amount_cents | int | no | bookkeeper | the waiver | ties to the SOV line | CS3-17 |
| Lien waiver | received_at | date | no | bookkeeper | draw ledger | missing means the next draw is blocked | CS5-7 |
| Lien waiver | file_path | file | no | bookkeeper | storage | the draw package | CS1-11 |
| Lien waiver | retainage_held_cents | int | no | bookkeeper | draw ledger | 10% held, release date at closeout | CS4-23 |
| Authority grant | engagement_id | fk Role-on-project | yes | principal | the agreement | authority is per person per job | CS6-3 |
| Authority grant | scope | enum money/change_order/selections/schedule/site_access/key/draw_certify/inspection_result/stop_work | yes | principal | the agreement | F-04 selections, F-05 money | CS5-1 |
| Authority grant | threshold_cents | int | no | principal | the agreement | the $2,500 line | CS1-2 |
| Authority grant | prepares_only | bool | yes | principal | the agreement | F-03 and F-08 prepare, they do not sign | CS3-4 |
| Authority grant | copy_to | array engagement | no | principal | the agreement | an approval missing F-05 reads incomplete | CS1-19 |
| Authority grant | source_clause | text | no | principal | the agreement | the contract exhibit the grant comes from | CS2-2 |
| Authority grant | granted_by | fk member | yes | system | audit | who wrote it down | CS6-3 |
| Authority grant | effective_from | date | yes | principal | the agreement | a delegation during travel is a row | CS5-24 |
| Authority grant | effective_to | date | no | principal | the agreement | delegations end | CS5-24 |
| Touch | subject_ref | Person or Engagement | yes | rails | rails | the last touch belongs to the human | CS1-7 |
| Touch | channel_kind | enum | yes | rails | rails | which door was used | CS5-10 |
| Touch | direction | enum in/out | yes | rails | rails | inbound is where wrong-approver risk lives | CS4-4 |
| Touch | occurred_at | timestamp | yes | rails | rails | dated | PD-8 |
| Touch | actor_ref | member or party | yes | rails | rails | who at the studio sent it | CS5-10 |
| Touch | decision_class | enum co/draw/selection/schedule/logistics/none | no | member filing it | the thread | a thumbs-up is not a class | CS5-10 |
| Touch | authority_check | enum matched/unverified/no_authority | no | system | derivation | "approved by Adaeze, who holds selections only" | CS4-4 |
| Touch | notice_of | text | no | member | notice record | the fact that changed (gate code, slip, key) | CS2-22 |
| Touch | notified_refs | array Person | no | member | notice record | who was told | CS2-22 |
| Lifecycle stage | subject_ref | Company or Engagement | yes | system, overridable | stage history | firms and seats both have stages | CS6-14 |
| Lifecycle stage | stage | enum per §5 | yes | system, overridable | stage history | today status is derived from SMS consent | CS4-15 |
| Lifecycle stage | entered_at | date | yes | system | stage history | dated | CS3 §11 |
| Lifecycle stage | entered_by | fk member | no | system | audit | who moved it | CS3 §11 |
| Lifecycle stage | reason | text | no | member | stage history | do-not-rehire needs a reason | CS1-23 |
| Site access card | project_id | fk project | yes | lead designer | project | one card per job | CS2-3 |
| Site access card | gate_code | text | no | lead designer | project | changes mid-job and one person is told | CS2-3 |
| Site access card | lockbox_version | text | no | lead designer | project | the sister still has the old code | CS5-14 |
| Site access card | alarm_ref | text | no | lead designer | project | false alarms cost a day | CS2-3 |
| Site access card | key_holder_engagement_id | fk Role-on-project | no | lead designer | project | F-06 holds a key and that fact has no home | CS2-3 |
| Site access card | site_hours | text | no | lead designer | project | HOA and city hours | CS2-3 |
| Site access card | site_notes | text | no | lead designer | project | dog, parking, staging | CS2-3 |
| Site access card | emergency_lines | array | no | lead designer | project | gas, locate, alarm company, owner | CS2-19 |
| Site access card | receiver_instructions | text | no | lead designer | project | who receives, hours, where it stages | CS2-11 |
| Site access card | changed_at | timestamp | no | system | audit | a code change is an event | CS2-22 |
| Site access card | changed_by | fk member | no | system | audit | dated and signed | CS2-22 |
| Site access card | told_refs | array Person | no | member | notice record | who was told the new code | CS2-22 |

---

## 3. Contact-mode x access-tier matrix

What each reach mode can do. "Studio records" means the fact enters Patina through a studio member, not the person themselves.

| Mode | See the roster | Receive schedule | Receive documents | Approve money | Sign | Upload evidence | Be texted | Be emailed | Revoke path | Consent required | Typical fixture roles |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Account (portal) | yes, scoped | yes, in app and email | yes | yes, in writing, if authority allows | yes, e-signature | yes | only with SMS consent | yes, with suppression and unsubscribe | remove member / revoke invitation | email: account terms; SMS: `sms_opt_in` | F-01, F-02, F-03, F-04, F-05 if invited, F-23 |
| App (iOS) | yes, client view | yes, push and in app | yes | yes if authority allows | yes | yes, photos | with consent | yes | account deletion / sign out | push registration; SMS separate | F-04, F-02 on Patina Field |
| Field link (no-auth token) | read-only Call Sheet and site access card for the job window | yes, over the link and by text | read-only what is issued to them | no | only where a tokened agreement exists | only where a tokened upload exists (evidence, RFQ) | with consent | yes, unsuppressed today | revoke link / expiry | SMS consent for texts; none for the link | F-07, F-08, F-09, F-11, F-12, F-18 |
| Email-only | no | yes, by email | yes, by email or attachment | yes on paper, if authority allows | yes on paper or tokened agreement | by reply attachment, studio records it | no | yes | unsubscribe (missing today) | none for transactional email | F-10, F-13, F-14, F-17, F-19, F-25, F-26 |
| Text-only | no, unless a link is sent | yes, by text | link by text only | no | no | by MMS, studio records it | yes, consent required | no useful address | STOP, phone-scoped | SMS consent, per studio per phone | F-06, F-09, F-11, F-18 |
| Paper / no digital | printed Call Sheet | printed lookahead | printed and handed over | wet signature | wet signature | hands paper to the studio | no | no | none needed | none | F-15 via F-14, F-27 through 311 |
| Do-not-contact | no | no, routed to the route_to person | no, routed | authority may still sit here, exercised through the route | yes, as signer, through the route | no | never | never | rule removal by a studio member | n/a; the rule outranks consent | F-15 |

Role to mode, on the fixture. Default mode is what the studio should use first; allowed modes are everything the rules permit.

| Fixture | Role | Default mode | Allowed modes | Forbidden |
|---|---|---|---|---|
| F-01 | studio principal | Account | Account, App, Email, Text | none |
| F-02 | lead designer | Account | Account, App, Email, Text | none |
| F-03 | bookkeeper | Email-only | Account (Tuesdays), Email | Text |
| F-04 | homeowner, selections | App | App, Account, Email, Text | group threads with trades |
| F-05 | homeowner, money | Email-only | Account, Email, Phone over $2,500 | Text for approvals |
| F-06 | key holder / receiver | Text-only | Text, Field link by text | Email |
| F-07 | GC owner | Email-only | Email, Field link, Phone | Text from the studio |
| F-08 | GC PM | Field link | Field link, Email, Text | none |
| F-09 | superintendent | Text-only | Text, Phone, Field link | Email |
| F-10 | architect | Email-only | Email, Phone, Plan link | Text |
| F-11 | electrical sub | Text-only | Text, Field link | Email (dead) |
| F-12 | plumbing sub | Paper / phone | Phone, Field link by another channel | Text (opted out) |
| F-13 | cabinetry sub | Email-only | Email, office line | Text |
| F-14 | drywall office manager | Email-only | Email, office line | Text |
| F-15 | drywall owner | Do-not-contact | signature through F-14 | all direct channels |
| F-16 | painting sub | Account | Account, Text, Email, Field link | none |
| F-17 | HVAC PM | Email-only | Email, dispatch line | Text |
| F-18 | framing foreman | Text-only (consent pending) | Field link, Phone until consent | Email |
| F-19 | radon sub | Email-only | Email, Phone | none |
| F-20 | tile rep | Email-only | Email, showroom line | Text |
| F-21 | fixtures rep | Email-only | Email, order desk | Text |
| F-22 | lighting rep | Email-only | Email, Text for stock checks | none |
| F-23 | millwork maker | Account (maker) | Account, Email | none |
| F-24 | stager | Email-only | Email, Text install week | none |
| F-25 | photographer | Email-only | Email | Text |
| F-26 | draw inspector | Email-only | Email, Phone | Text |
| F-27 | AHJ inspector | Paper / 311 | 311 portal, Email, office phone | Text, personal cell |
| F-28 | GC PM, closed job | Email-only | Email, Phone | Text without re-consent |

---

## 4. Identity and dedupe rules

One human is recognised by evidence, in this precedence, and never merged silently.

| # | Rule | Key | Strength | Action |
|---|---|---|---|---|
| 1 | Account match | `profile_id` | proof | auto-link, no confirmation |
| 2 | Phone match | `phone_e164` exact | strong | auto-link within one studio; carries consent |
| 3 | Email match | lowercased address exact | strong | auto-link within one studio |
| 4 | Company plus name | `company_id` + normalised full_name | weak | propose, a member confirms |
| 5 | Name alone | normalised full_name | none | never merges |
| 6 | Party id lineage | `studio_contact_id` from a fold | provenance only | never a merge key on its own |

Merge and split.

| Event | Rule |
|---|---|
| Merge two person cards | Requires rule 1, 2, or 3. Survivor keeps the older card. Channels union. Consent per channel value is untouched. Engagements repoint. Both prior ids stay resolvable. |
| Split a person card | Allowed when a phone or email proved wrong. Engagements stay with the card whose channel evidence they carry. Consent stays with the channel value, not with either card. |
| Two firms, same legal name | Merge only on tax identity or an explicit member act. `saved_vendors` duplicates (F-20, saved 2025 and 2026) are lineage lines on one card, never two firms. |
| Never merge | A firm card into a person card, except when the person is declared sole proprietor, which sets `is_sole_proprietor` and keeps both ids. |

State transitions.

| Situation | Rule |
|---|---|
| Text-only sub later gets an account (F-16) | Match on email or phone at sign-in, write `profile_id` on the person card, reach reads Account per PD-12. Consent is unchanged; an account is not SMS consent. Field links stay valid until their window ends. |
| Person moves companies (the GC's PM leaves) | Close the affiliation with `to_date`. Open a new affiliation. Person card and its channels survive. Open engagements keep the person and keep the old `company_id`; the roster shows "left Marrow & Sons 2027-01". Consent follows the phone, not the firm. |
| Company acquired or renamed | Rename in place; keep the card and its documents. Set `legal_name` from the new W-9 and record a `dba_name`. On acquisition, the surviving card absorbs the other, documents of the absorbed firm keep their original holder id and are marked superseded, never deleted. |
| A phone is reassigned to a new human | Consent is a fact about the channel value. A new person card on the same number starts `not_asked`, and the prior opt-out shows as a warning with its date until a fresh consent is recorded. |
| Two studios hold the same firm | Two company cards, one per studio (PD-1). Cross-studio compliance is AMENDMENT-ASK CS1-B. |

---

## 5. Lifecycle table

One ladder for a firm and its engagements. Contact and access defaults follow the stage, not the consent chip.

| Stage | What is tracked | Contact mode default | Access default | Compliance gate | Who moves it |
|---|---|---|---|---|---|
| Prospect | firm, trades, source, one contact | office line or email, no texting | none | none | studio member who adds the card |
| Invited to bid | scope, ask date, due date, person who owes the answer | email plus one phone follow-up | RFQ link, 30 days | licence sighted | estimator / lead designer |
| Bidding | quote, amount, alternates, exclusions, valid_until | as the contact rule says | RFQ link | licence sighted | estimator |
| Declined / no response | outcome, date, reason | none | links close | none | estimator, or the due date passing |
| Awarded | agreement sent and signed, signer at the firm, retainage | email for paper, text opens only after consent | agreement link | COI, W-9, licence current before "papered" | principal |
| Mobilized | window opens, crew named, site access mode | text-first for field, email for office | field link for the window | current COI blocks site access | superintendent's fact, recorded by the lead designer |
| Active | consent, waivers per draw, authority, touches | per person contact rule | field link live, renewed on use | COI current; conditional waiver per draw blocks the draw line | lead designer |
| Closeout | punch owner, final waivers, retainage release date | text for punch, email for money | field link held until retainage releases | unconditional final waiver blocks final payment | lead designer / bookkeeper |
| Warranty | warranty_until, named warranty contact, open items | email, phone for callbacks | link minted per call, or reach on paper | none | derived at project close |
| Off job | off_job_at, reason; row retained | none | links revoked | outstanding waivers still chased | lead designer |
| Repeat | prior jobs, performance line, consent state, document expiries | prior contact rule travels | new links minted on pick | expiries re-checked at pick | picker, at the moment of the pick |
| Retired / do not rehire | reason, date, who decided | none | none | none | principal |

---

## 6. Patina mapping

Status per §2 field, with the table, column, or file that carries it today.

| Entity | Field | Status | Evidence today | Gap |
|---|---|---|---|---|
| Person | (object) | partial | `studio_contacts` entity_kind person, `supabase/migrations/00417_studio_contacts.sql:70-120` | G-1 |
| Person | full_name | exists | `00417_studio_contacts.sql:112-115` | |
| Person | phone_primary_e164 | exists | `00417_studio_contacts.sql:70-120` (`phone`, `phone_e164`) | |
| Person | email_primary | exists | `00417_studio_contacts.sql:70-120` | |
| Person | email_status | missing | `supabase/functions/_shared/send-email.ts:247-253` suppression only for `userId` | G-6 |
| Person | email_status_at | missing | same | G-6 |
| Person | reach_preference | partial | `supabase/migrations/00062_client_management_v2.sql:20` on clients only, unread | G-7 |
| Person | never_text | missing | `current-state.md:236` | G-7 |
| Person | do_not_contact | missing | `current-state.md:236` | G-7 |
| Person | do_not_contact_reason | missing | same | G-7 |
| Person | route_to_person_id | missing | `00417_studio_contacts.sql:70-120` (self FK is `company_id` only) | G-7 |
| Person | profile_id | partial | column exists on `studio_contacts`; never written on parties, `supabase/migrations/00420_client_portal_rls.sql:57-60` | G-5 |
| Person | archived_at | exists | `00417_studio_contacts.sql:70-120`, archive policy `:257-261` | G-11 (no standing door) |
| Person | studio_verdict | missing | `apps/designer-portal/src/components/document/people/views/person-profile.tsx:735` shows engagements only | G-24 |
| Company | (object) | partial | `studio_contacts` entity_kind company, `00417_studio_contacts.sql:76-80` | G-4 |
| Company | legal_name | partial | `company_name` only, no legal/DBA split | G-4 |
| Company | dba_name | missing | `00417_studio_contacts.sql:76-80` | G-4 |
| Company | company_kind | partial | `contact_kind` free TEXT `00417_studio_contacts.sql:82-87`; five UI labels `apps/designer-portal/src/components/document/people/directory/company-row.tsx:34-40` | G-12 |
| Company | trades | partial | `specialties text[]`, free text | G-12 |
| Company | w9_on_file_at | missing | grep of migrations for `w9` empty | G-14 |
| Company | tax_id_last4 | missing | same | G-14 |
| Company | remit_to | missing | same | G-14 |
| Company | paperwork_contact_person_id | missing | `00417_studio_contacts.sql:70-120` | G-4 |
| Company | signer_person_id | missing | trade agreement keys a contact, `supabase/migrations/00579_trade_agreements.sql:58-108` | G-14 |
| Company | site_contact_person_id | missing | `00417_studio_contacts.sql:70-120` | G-4 |
| Company | retainage_bps | exists | `00579_trade_agreements.sql:58-108` (`retainage_bps`) | |
| Company | warranty_until | missing | no stage or warranty column anywhere | G-24 |
| Company | archived_at | exists | `00417_studio_contacts.sql:70-120` | |
| Household | (object) | missing | one `designer_clients` row per client, `supabase/migrations/00062_client_management_v2.sql:18-26` | G-1 |
| Household | display_name | partial | `designer_clients.client_name` | G-1 |
| Household | member_person_ids | missing | second spouse has no row | G-15 |
| Household | primary_member_person_id | partial | `designer_clients.client_id` | G-1 |
| Household | co_threshold_cents | missing | no threshold column anywhere | G-15 |
| Affiliation | (object) | partial | `studio_contacts.company_id` self FK, `00417_studio_contacts.sql:118-120` | G-12 |
| Affiliation | person_id | exists | same | |
| Affiliation | company_id | exists | same | |
| Affiliation | role_at_firm | missing | `contact_kind` is the person's kind, not the role | G-12 |
| Affiliation | is_paperwork_contact | missing | none | G-4 |
| Affiliation | is_signer | missing | none | G-14 |
| Affiliation | holds_trade_license | missing | none | G-14 |
| Affiliation | from_date | missing | none | G-12 |
| Affiliation | to_date | missing | none | G-12 |
| Role-on-project | (object) | exists | `supabase/migrations/00212_project_parties.sql:27-43`, widened `00281_field_parties.sql:48-61` | |
| Role-on-project | project_id | exists | `00212_project_parties.sql:27-43` | |
| Role-on-project | person_id | missing | `display_name` snapshot only; `profile_id` never written | G-1, G-5 |
| Role-on-project | company_id | missing | `company_name` TEXT snapshot | G-4 |
| Role-on-project | party_kind | partial | 11 values, `packages/types/src/field-config.ts:110-121` | G-13 |
| Role-on-project | inspector_subtype | missing | no inspector kind at all | G-13 |
| Role-on-project | trade | partial | 23 values, `packages/types/src/field-config.ts:18-41`; DB TEXT | G-13 |
| Role-on-project | trade_label | partial | free text renders as an extra chip, `apps/designer-portal/src/components/document/people/directory/trade-chip-row.tsx:73-82` | G-13 |
| Role-on-project | stage | missing | `00212_project_parties.sql:27-43`; status dot derived from SMS consent, `apps/designer-portal/src/lib/document/people-derivation.ts:197-253` | new |
| Role-on-project | on_site_from | missing | `supabase/migrations/00419_project_roster_wiring.sql:97-147` | new |
| Role-on-project | on_site_to | missing | same | new |
| Role-on-project | site_access_mode | missing | no authority or access column | G-15 |
| Role-on-project | contracted_through | missing | `00579_trade_agreements.sql:58-108` is studio-side only | new |
| Role-on-project | show_to_client | exists | `00419_project_roster_wiring.sql:61-62`, client read `00420_client_portal_rls.sql:373-383` | |
| Role-on-project | warranty_until | missing | none | G-20 |
| Role-on-project | warranty_contact_person_id | missing | none | new |
| Role-on-project | off_job_at | missing | Remove is a hard delete, `packages/supabase/src/hooks/use-coordination.ts:808-816` | G-10 |
| Role-on-project | off_job_reason | missing | same | G-10 |
| Role-on-project | studio_contact_id | exists | `supabase/migrations/00418_studio_contacts_backfill.sql:59-63` | G-24 |
| Role-on-project | bid_due_at | missing | `supabase/migrations/00424_trade_rfq_rail.sql:74-96` | new |
| Role-on-project | bid_outcome | partial | quoted / selected / withdrawn only, `supabase/migrations/00423_trade_scope_instrument.sql:221-222` | new |
| Role-on-project | bid_amount_cents | exists | `00423_trade_scope_instrument.sql:213-230` | |
| Role-on-project | bid_valid_until | missing | same | new |
| Role-on-project | bid_quoted_by_person_id | missing | same | new |
| Reach channel | (object) | missing | phone and email are columns on six different tables | G-1 |
| Reach channel | owner_ref | missing | no channel object | G-4 |
| Reach channel | channel_kind | missing | one untyped `phone` per row, `00281_field_parties.sql:48-61` | G-7 |
| Reach channel | value | exists | `phone_e164` trigger on parties; `phone_e164` on `studio_contacts` | |
| Reach channel | label | missing | none | G-4 |
| Reach channel | sms_capable | missing | Invite to texts offered to any phone, `apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:740-756` | G-7 |
| Reach channel | verified | missing | none | G-6 |
| Reach channel | verified_at | missing | none | G-6 |
| Reach channel | preferred | partial | `designer_clients.preferred_contact` free text, unread | G-7 |
| Reach channel | status | missing | `supabase/functions/_shared/send-email.ts:430-434` logs, never marks | G-6 |
| Contact rule | (object) | missing | `current-state.md:236` | G-7 |
| Contact rule | subject_ref | missing | same | G-7 |
| Contact rule | channels_allowed | missing | same | G-7 |
| Contact rule | channels_forbidden | missing | same | G-7 |
| Contact rule | route_to_person_id | missing | same | G-7 |
| Contact rule | contact_hours | missing | same | G-7 |
| Contact rule | escalation_by_class | missing | same | G-7 |
| Contact rule | reason | missing | same | G-7 |
| Contact rule | set_by | missing | same | G-7 |
| Contact rule | set_at | missing | same | G-7 |
| Consent | (object) | partial | per party row, `supabase/migrations/00432_twilio_activation_hardening.sql:4-11` | G-3 |
| Consent | studio_id | missing | consent keys to a project row, not a studio | G-3 |
| Consent | channel_value | partial | `phone_e164` on the row; gate reduces by phone, `supabase/functions/_shared/sms.ts:174-185` | G-3 |
| Consent | channel_kind | missing | SMS only; email has no consent object | G-6 |
| Consent | status | exists | `sms_consent_status`, `00281_field_parties.sql:55-61` | G-3 (scope) |
| Consent | source | exists | `sms_consent_source`, `00432_twilio_activation_hardening.sql:4-11` | |
| Consent | evidence_text | exists | `sms_consent_evidence`, same | |
| Consent | evidence_file | missing | free text only | new |
| Consent | disclosure_version | exists | `sms_consent_disclosure_version`, same | |
| Consent | recorded_by | exists | `sms_consent_recorded_by`, same | |
| Consent | recorded_at | exists | `sms_consent_recorded_at`, same | |
| Consent | opted_out_at | exists | `sms_opt_out_at`, `00281_field_parties.sql:55-61` | |
| Consent | origin_project_id | missing | the row's own project only; the STOP job is lost | G-3 |
| Access grant | (object) | partial | eleven grant tables, `current-state.md:198-218` | G-20 |
| Access grant | tier | partial | implied by which table the row sits in | G-20 |
| Access grant | subject_ref | partial | `field_link_tokens` keys the party, `supabase/migrations/00283_field_links.sql:26-33` | G-20 |
| Access grant | scope_ref | partial | per table | G-20 |
| Access grant | granted_by | partial | per table | G-20 |
| Access grant | granted_at | exists | per table | |
| Access grant | expires_at | exists | 90 days, `00283_field_links.sql:26-33`; none on `invoice_links`, `supabase/migrations/00574_invoice_links.sql:63-89` | G-20 |
| Access grant | last_used_at | partial | `used_count` on `supabase/migrations/00364_fulfillment_exceptions.sql:55-64` only | G-20 |
| Access grant | revoked_at | exists | `00283_field_links.sql:139` revoke RPC | |
| Access grant | revoke_reason | partial | required only on `supabase/migrations/00438_ffe_release_security_hardening.sql:12-26` | G-20 |
| Compliance document | (object) | missing | `supabase/migrations/00579_trade_agreements.sql:84` boolean only | G-14 |
| Compliance document | holder_ref | missing | same | G-14 |
| Compliance document | doc_type | partial | `insurance_certificate_required` names one type, `00579_trade_agreements.sql:84` | G-14 |
| Compliance document | number | missing | grep empty | G-14 |
| Compliance document | issuer | missing | grep empty | G-14 |
| Compliance document | issued_on | missing | grep empty | G-14 |
| Compliance document | expires_on | partial | exists only for the studio's own attestation, `supabase/migrations/00578_design_build_kind.sql:294-307` | G-14 |
| Compliance document | file_path | missing | grep empty | G-14 |
| Compliance document | verified_by | missing | grep empty | G-14 |
| Compliance document | verified_at | missing | grep empty | G-14 |
| Compliance document | held_by | missing | grep empty | G-14 |
| Compliance document | blocks | missing | no gate reads any date | G-14 |
| Lien waiver | (object) | partial | studio design-build draws only, `00578_design_build_kind.sql:491-509`; policy string `00579_trade_agreements.sql:85-86` | G-14 |
| Lien waiver | company_id | missing | waiver rows key a rolodex card, not a firm-as-payee | G-14 |
| Lien waiver | project_id | partial | `00578_design_build_kind.sql:491-509` | G-14 |
| Lien waiver | draw_no | partial | same | G-14 |
| Lien waiver | waiver_type | partial | same | G-14 |
| Lien waiver | through_date | missing | not read back anywhere, `00578_design_build_kind.sql:635-660` | G-14 |
| Lien waiver | amount_cents | partial | same | G-14 |
| Lien waiver | received_at | partial | same | G-14 |
| Lien waiver | file_path | partial | same | G-14 |
| Lien waiver | retainage_held_cents | missing | rate only, `00579_trade_agreements.sql:58-108` | G-14 |
| Authority grant | (object) | missing | no authority column on any object | G-15 |
| Authority grant | engagement_id | missing | same | G-15 |
| Authority grant | scope | partial | `client_decisions.court` CHECK is the only authority vocabulary, `00281_field_parties.sql:167-171` | G-15 |
| Authority grant | threshold_cents | missing | none | G-15 |
| Authority grant | prepares_only | missing | none | G-15 |
| Authority grant | copy_to | missing | none | G-15 |
| Authority grant | source_clause | missing | none | G-15 |
| Authority grant | granted_by | missing | none | G-15 |
| Authority grant | effective_from | missing | none | G-15 |
| Authority grant | effective_to | missing | none | G-15 |
| Touch | (object) | partial | `supabase/migrations/00101_comms_tables.sql:58-69` logins only; SMS rail `supabase/migrations/00282_sms_core.sql:29-31` | G-20 |
| Touch | subject_ref | partial | `people_directory.last_touch_at` per row, `supabase/migrations/00589_return_to_lead_hardening.sql:703-734` | G-9 |
| Touch | channel_kind | partial | separate rails, no union | G-6 |
| Touch | direction | exists | `00282_sms_core.sql:29-31` | |
| Touch | occurred_at | exists | same | |
| Touch | actor_ref | exists | same | |
| Touch | decision_class | missing | none | G-15 |
| Touch | authority_check | missing | none | G-15 |
| Touch | notice_of | missing | none | new |
| Touch | notified_refs | missing | none | new |
| Lifecycle stage | (object) | partial | `designer_clients.status`, `leads.status`; nothing on parties or firms | new |
| Lifecycle stage | subject_ref | partial | client and lead only | new |
| Lifecycle stage | stage | partial | `apps/designer-portal/src/lib/document/people-derivation.ts:197-253` derives a dot from consent | new |
| Lifecycle stage | entered_at | missing | none | new |
| Lifecycle stage | entered_by | missing | none | new |
| Lifecycle stage | reason | missing | none | new |
| Site access card | (object) | missing | none | new |
| Site access card | project_id | missing | no site card exists to key | new |
| Site access card | gate_code | missing | none | new |
| Site access card | lockbox_version | missing | none | new |
| Site access card | alarm_ref | missing | none | new |
| Site access card | key_holder_engagement_id | missing | `PartyKind receiver` is a label only, `packages/types/src/field-config.ts:110-121` | G-15 |
| Site access card | site_hours | missing | none | new |
| Site access card | site_notes | missing | none | new |
| Site access card | emergency_lines | missing | none | new |
| Site access card | receiver_instructions | missing | none | new |
| Site access card | changed_at | missing | none | new |
| Site access card | changed_by | missing | none | new |
| Site access card | told_refs | missing | none | new |

Counts. Fields (the 155 rows of §2): exists 26 · partial 32 · missing 97. Entities (15 objects): exists 1 · partial 8 · missing 6. Together: exists 27 · partial 40 · missing 103 · total 170.

---

## 7. Findings

Consolidated from 144 seat findings. Crosswalk in the evidence column.

| ID | P | Confidence | Claim | Evidence | Proposed |
|---|---|---|---|---|---|
| CRM-1 | P1 | high | No object holds a compliance document with a type, number, expiry, file, and verifier; the only insurance word is a boolean on a per-project agreement, so a lapsed COI is invisible to every surface | CS1-1, CS2-1, CS3-1, CS4-1, CS5-5, CS6-1; `supabase/migrations/00579_trade_agreements.sql:84`; `supabase/migrations/00417_studio_contacts.sql:70-120`; F-11 | Add the compliance document object on the company card (person card for sole proprietors), with `blocks`; the engagement, the picker, and the draw package read expiry from it |
| CRM-2 | P1 | high | Authority is recorded nowhere: no field says who may approve money or change orders, at what threshold, who only prepares, or who holds a key | CS1-2, CS2-2, CS3-4, CS4-3, CS5-1, CS6-3; `supabase/migrations/00281_field_parties.sql:48-61`; F-04, F-05 | Authority grants on the engagement, defaulted from the firm and the household, with scope, threshold, `prepares_only`, copy list, and the source clause |
| CRM-3 | P1 | high | No contact rule exists on any external person: no preferred channel, no forbidden channel, no route-through; the one `preferred_contact` column sits on clients and no sender reads it | CS1-3, CS2-4, CS3-12, CS4-5, CS5-3, CS6-5; `supabase/migrations/00062_client_management_v2.sql:20`; `current-state.md:236`; F-15, F-27 | Contact rule on the person with an optional per-job override; every send gate and every dial or text word reads it before consent is even checked |
| CRM-4 | P1 | high | Consent is stored per party row and displayed per party row while STOP and the send gate act across the whole phone, so F-12's Okonkwo row reads "Not asked" while the gate refuses | CS1-4, CS2-6, CS3-14, CS4-6, CS5-11, CS6-8; `supabase/functions/_shared/sms.ts:174-185`; `supabase/functions/sms-inbound/pipeline.ts:159-164` | Consent becomes one record per studio per channel value; a new engagement on an opted-out phone is born "Opted out 2025-12-03 on Lindqvist" and names another channel |
| CRM-5 | P1 | high | There is no single person: one human is two rolodex cards plus N party rows plus N directory rows, and identity is re-derived heuristically at every seam | CS1-7, CS2-13, CS3-15, CS4-12, CS5-17; `current-state.md:174-192`; `apps/designer-portal/src/lib/document/roster-derivation.ts:282-294` | The person card is the identity; engagements are seats under it; the Directory lists a human once with their seats beneath |
| CRM-6 | P1 | high | The firm is a name: the company card holds no documents, no payee identity, no labeled lines, no signer, so GC facts sit on one of three people | CS1-10, CS2-15, CS5-6, CS6-2, CS6-12; `supabase/migrations/00417_studio_contacts.sql:76-80`; F-07 to F-09 | The company card becomes the unit of compliance and payment; person and engagement rows inherit firm facts |
| CRM-7 | P1 | high | An engagement has no stage and no window: a bidder, a February radon sub, an August stager, and today's framer all read as active crew | CS2-18, CS3-9, CS4-15, CS5-15, CS6-14; `supabase/migrations/00212_project_parties.sql:27-43`; F-19, F-24 | Stage plus `on_site_from` / `on_site_to` on the engagement; the roster groups this week, later, done; links and contact defaults follow the stage |
| CRM-8 | P1 | high | Site access has no object: key holder, lockbox version, alarm, hours, and the emergency lines live in a superintendent's phone | CS1-18, CS2-3, CS4-20, CS5-14; `fixture.md` §3 receiver row; `packages/types/src/field-config.ts:110-121` | One site access card per project, key holder as an engagement reference, with a change log naming who was told |
| CRM-9 | P2 | high | Lien waivers per draw have no ledger the studio reads; `lien_waiver_policy` is a policy string and the design-build waiver rows are never read back | CS1-11, CS3-17, CS4-9, CS5-7, CS6-4; `supabase/migrations/00579_trade_agreements.sql:85-86`; `supabase/migrations/00578_design_build_kind.sql:635-660` | Waiver ledger per firm per draw with through-date and amount; a gap closes the draw line for that firm |
| CRM-10 | P2 | high | The vocabulary cannot hold the job: no kind for inspector, lender, engineer, or owner's rep; `FieldTrade` has no radon; company kinds are five UI labels; `other` rows open nothing | CS1-5, CS1-13, CS1-22, CS2-7, CS2-24, CS3-10, CS3-11, CS3-23, CS4-10, CS4-11, CS5-8, CS6-16, CS6-22; `packages/types/src/field-config.ts:18-41`, `:110-121`; F-19, F-26, F-27 | Widen kinds and trades in code, add `other_named` with a required label, give every kind a profile, and default inspectors and lenders to never-text |
| CRM-11 | P2 | high | Phones are untyped: an office line, a dispatch line, and a cell are the same column, and any of them is offered "Invite to texts" | CS2-15, CS4-7; `supabase/migrations/00281_field_parties.sql:48-61`; `apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:740-756`; F-13, F-17 | Typed reach channels per person and per firm, with `sms_capable`; the SMS invite appears only on a mobile |
| CRM-12 | P2 | high | Email to non-account people has no suppression, no unsubscribe, and no bounce state; F-11's dead address is sent to forever | CS1-20, CS6-10; `supabase/functions/_shared/send-email.ts:247-253`, `:430-434` | Channel status written by the email rail and read by every sender; a dead or unsubscribed address blocks the send and shows on the row |
| CRM-13 | P2 | high | Remove on a roster row hard-deletes the party, taking the consent ledger, the field-link lineage, and any bid with it | CS2-17, CS3-16, CS5-16, CS6-7; `packages/supabase/src/hooks/use-coordination.ts:808-816` | Soft close with `off_job_at` and a reason; hard delete only for a mistaken add with no consent, bid, or waiver |
| CRM-14 | P2 | high | Access grants expire on a fixed 90-day clock unrelated to the work: a ten-month job outlives the link three times and a twelve-month warranty outlives it four | CS1-8, CS2-8, CS3-20, CS4-13, CS4-17, CS5-18; `supabase/migrations/00283_field_links.sql:26-33`; F-28 | Grant lifetime follows the engagement window plus the warranty term, renews on use, and shows its end date on the row |
| CRM-15 | P2 | high | Trades cannot hold an account tier: `project_parties.profile_id` is never written, so F-16 logs in elsewhere and still reads "On paper" | CS5-12; `supabase/migrations/00420_client_portal_rls.sql:57-60`; `apps/designer-portal/src/lib/document/roster-derivation.ts:360-364` | Link on email or phone match at add time and at sign-in; account wins the reach word, as PD-12 already says |
| CRM-16 | P2 | med | The People room Directory shows no reach word, so the studio book cannot answer "how do I reach Dana" without opening a project | CS5-13; `apps/designer-portal/src/components/document/people/directory/person-row.tsx:76-99` | Reach and the contact rule read on the directory row, not only on the Call Sheet |
| CRM-17 | P2 | high | Vendor reps are not people: F-20 to F-22 exist as three TEXT columns on a per-designer account row the room never reads | CS1-6, CS3-5, CS5-19, CS6-11; `supabase/migrations/00009_vendor_management.sql:59-76` | A rep is a person card affiliated to the vendor firm, with a contact rule and the quotes they issued |
| CRM-18 | P2 | high | Every count counts rows: the head count counts a party per project plus hidden rolodex rows, so one GC on two jobs is two people | CS2-13, CS4-21, CS5-23, CS6-18; `apps/designer-portal/src/components/document/people/people-room.tsx:383`; `supabase/migrations/00589_return_to_lead_hardening.sql:824-860` | Count humans by person card and firms by company card, or drop the number |
| CRM-19 | P2 | high | The client side is one row keyed to one spouse, so "Adaeze decides finishes, Chidi signs money" cannot be written down. Seats disagree on the vehicle: CS5-2 wants a second account, CS2-16, CS3-21 and CS4-3 want a `client_rep` party row | CS1-14, CS2-16, CS3-21, CS4-3, CS5-2; `current-state.md:155`; F-04, F-05 | Pick both halves, split by job: a household object holds the members and the threshold; every member who acts on a job gets an engagement carrying the authority grant. Reason: authority must sit where the Call Sheet and the decision court read it, and a login is a reach question, not an authority question. A second account is then optional and additive |
| CRM-20 | P2 | high | Bid coverage cannot be stated: no declined, no no-response, no due date, no quoting person, and every losing bidder sits on the Call Sheet as if on the job | CS3-2, CS3-7, CS3-8, CS3-9; `supabase/migrations/00423_trade_scope_instrument.sql:221-222`; `supabase/migrations/00424_trade_rfq_rail.sql:74-96` | Bid fields on the engagement at bidding stage, with `due_at` and dated outcomes; the sheet groups bidders away from crew |
| CRM-21 | P2 | high | The decision court admits no architect, inspector, or lender, so an RFI with the architect or a draw with the lender's inspector has no court | CS1-9, CS3-4, CS4-22, CS5-9; `supabase/migrations/00281_field_parties.sql:167-171`; F-10, F-26 | Court becomes an engagement reference, or the CHECK widens to architect, engineer, inspector, lender |
| CRM-22 | P2 | med | An inbound approval is matched to a phone and never to an approver, so a "go ahead" from someone with no money authority reads the same as a signature | CS4-4, CS5-10, CS6-3; `supabase/functions/_shared/sms.ts:174-185` | When a message is filed as a decision, attribute it to the engagement and check the authority grant; an unmatched approval reads "received, not authority" |
| CRM-23 | P2 | med | Nothing records who was told when a fact changed: a gate code, a schedule slip, a key handover | CS2-22, CS5-24; `supabase/migrations/00101_comms_tables.sql:58-69` covers logins only | A notice record on the touch: fact changed, told whom, by which channel, when; the site access card and the engagement window write one on change |
| CRM-24 | P2 | high | Bring-forward has no travel list: picking a repeat sub carries a name and a phone, and nothing says that consent, document expiries, and contact rules travel while pricing and project notes must not | CS1-15, CS3-13, CS4-16, CS6-9; `supabase/migrations/00418_studio_contacts_backfill.sql:40-52`; `fixture.md` §4 Q1 | Fixed travel list at pick: identity, typed channels, contact rule, consent by channel value, document expiries, history lines. Never: prior pricing, prior project notes, prior `show_to_client` |
| CRM-25 | P2 | high | A person's role at their firm is not a fact, so F-14 is stored as a drywall tradesperson and "email Rosa, never call Frank" is two unrelated rows | CS1-12, CS3-3, CS4-2, CS6-6; `supabase/migrations/00417_studio_contacts.sql:82-87` | Affiliation object with `role_at_firm`, a paperwork contact, a signer, and a route-to pointer |
| CRM-26 | P2 | med | The trade agreement keys a person card and carries `insurance_certificate_required` as a promise nothing later checks, so a signed agreement proceeds to draws with no COI on file | CS1-16, CS6-24; `supabase/migrations/00579_trade_agreements.sql:58-108`, `:84` | Agreement references the company plus a signer person; a "papered" state requires a current COI and W-9 on the company card |
| CRM-27 | P2 | med | There is no expiry engine: the only expiry Patina evaluates is the studio's own licence attestation | CS6-13; `supabase/migrations/00578_design_build_kind.sql:294-307`, `:362` | A scheduled job writes "lapses in 30 days" and "lapsed" per firm; the facts surface on the card, the roster row, and the draw line |
| CRM-28 | P2 | med | Field-party rails are gated by kind, not by facts: a stager who texts gets no SMS rail, and an `other` party opens no profile | CS1-17, CS4-25, CS6-16; `packages/supabase/src/hooks/use-people.ts:44-49`; `apps/designer-portal/src/components/document/people/views/person-profile.tsx:911-955` | The rail follows a usable channel plus consent, and every kind opens the same sheet |
| CRM-29 | P2 | med | The invoice pay link is a plaintext token with no expiry, unlike every other token rail | CS6-20; `supabase/migrations/00574_invoice_links.sql:63-89` | Hash the token, set an expiry, regenerate on send, record the payer |
| CRM-30 | P3 | med | Person-kind rolodex cards with no project never render in the Directory, and there is no chip for architect, photographer, stager, or inspector | CS4-25; `apps/designer-portal/src/components/document/people/views/directory-view.tsx:34-44`, `:294` | Every kind gets a Directory home; the rolodex is visible without the Companies chip |
| CRM-31 | P3 | med | A firm's crew has no place, so the superintendent cannot see who is coming or who is licensed | CS4-14; `current-state.md:151` | A crew list on the company card, names and licence flags only, no contact rails |
| CRM-32 | P3 | med | From a truck the roster cannot be worked: the phone hides under the unfold and search does not match a number | CS2-9, CS2-23; `apps/designer-portal/src/components/document/roster/roster-row.tsx:170-184`; `apps/designer-portal/src/components/document/people/views/directory-view.tsx:304-316` | Phone on the row at 390 with tap to call; search matches a `phone_e164` suffix |
| CRM-33 | P3 | med | Commercial facts the People room should point at but not own: lead-time commitments, allowance deciders, retainage balances | CS3-6, CS3-24, CS4-23; `supabase/migrations/00009_vendor_management.sql:16-28` | Keep them in the Orders and money books per PD-9; the person card links to them |
| CRM-34 | P3 | med | Inspections and deliveries have no object, so a pass or fail and a received delivery attach to no party | CS2-10, CS2-11; `current-state.md:151` | Out of this room; the engagement points at a schedule item that names the AHJ or the receiver |
| CRM-35 | P3 | med | The homeowner is never told who their one contact is; crew visibility is per-row and says nothing about channel | CS5-20; PD-11 | One "your contact" designation per project, set by the studio, shown on the client page |
| CRM-36 | P3 | low | Staff permission is owner / admin / member / guest with no per-surface scoping, so a two-day bookkeeper sees what a member sees | CS1-25, CS3-22, CS5-22, CS6-15; `supabase/migrations/00416_studio_staff_titles.sql:30-36`; `supabase/migrations/00021_user_management_foundation.sql:22-24` | Out of the People room; route to the studio settings owner with `staff_role` as the default tier |

Disagreements resolved above: CRM-19 (household versus `client_rep`). Two more, resolved here.

| # | Disagreement | Seats | Pick | Reason |
|---|---|---|---|---|
| D-A | Do engagements snapshot or live-read firm and person facts | CS3 AA-1 and CS6-19 want live; PD-3 and CS1-15 keep the snapshot | Hybrid: name at time and trade on job stay snapshotted; typed channels, consent, contact rule, and document expiries read live from the card when `studio_contact_id` is set | A COI expires once for the firm; a do-not-text rule belongs to the human. A snapshot of either is wrong the day after it is taken. Tagged as an amendment to PD-3 |
| D-B | Where a COI lapse is raised | CS3-13 picker; CS5-5 firm card plus every active row plus draw gate; CS6-13 scheduled job | All three, one source: the document on the company card, echoed on the engagement row and the picker mini row, evaluated nightly, blocking the draw line | One fact, three readers, no re-keying |

---

## 8. Ranked top 10 Patina must track and does not

| # | Fact | Object | Seats asking |
|---|---|---|---|
| 1 | Compliance document with expiry: COI (GL, WC, auto), W-9, licence, bond, with what it blocks | Company | CS1, CS2, CS3, CS4, CS5, CS6 |
| 2 | Authority grant: money, change order, selections, schedule, site access, key, draw certify, with threshold and prepares-only | Role-on-project | CS1, CS2, CS3, CS4, CS5, CS6 |
| 3 | Contact rule: never text, do not contact, route-through, hours, escalation by decision class | Person, job override | CS1, CS2, CS3, CS4, CS5, CS6 |
| 4 | Consent as one fact per studio per channel value, displayed truthfully on every seat that shares it and inherited at creation | Consent | CS1, CS2, CS3, CS4, CS5, CS6 |
| 5 | One person identity across jobs and firms, with seats beneath it | Person | CS1, CS2, CS3, CS4, CS5 |
| 6 | Engagement stage and on-site window, from invited-to-bid through warranty and off-job | Role-on-project | CS1, CS2, CS3, CS4, CS5, CS6 |
| 7 | Lien waiver per draw per firm, conditional then unconditional, with through-date, blocking the draw | Company x draw | CS1, CS3, CS4, CS5, CS6 |
| 8 | The firm as the object that holds documents, payee identity, labeled lines, signer, and paperwork contact | Company | CS1, CS2, CS3, CS5, CS6 |
| 9 | Access grant lifetime tied to the engagement window and the warranty term, renewed on use | Access grant | CS1, CS2, CS3, CS4, CS5 |
| 10 | Site access card: key holder, codes with versions, hours, emergency lines, and who was told when it changed | Project | CS1, CS2, CS4, CS5 |

---

## 9. AMENDMENT-ASK register

Seventeen asks, verbatim intent, one line each, with the synthesis read against `docs/vision/VISION-DECISIONS.md:18-21`.

| ID | Seat ask | Touches | Verbatim intent, one line | Side journey under VISION | Read |
|---|---|---|---|---|---|
| AM-1 | CS1-A | PR-3, S2 | The GC's PM adds crew and uploads the firm's COI, W-9, and licence renewals through the field link, landing unverified until a studio member confirms | yes | The writer is a trade; the compliant version is studio intake from the GC's email, with the link read-only |
| AM-2 | CS1-B | PD-1, PR-3 | A platform-level compliance record on the firm, readable by every studio holding it, written by the firm or any studio that verified the document | yes | Cross-studio state on a firm breaks the studio-wide rolodex boundary; compliant version copies the last verified document forward at pick |
| AM-3 | CS1-C | PR-3 | A party row with `contracted_by` pointing at another party, so site access and COI read for every body on site while the studio holds no agreement | yes | Sub-to-sub is outside the studio's paper; compliant version is `contracted_through` studio / gc / owner plus the first-tier crew list |
| AM-4 | CS2-1 | PR-3, S2 | A trade-side write tier over the field link with no login: daily log, mark a sub off the job, confirm a delivery received | yes | Primary user is the GC's super; the seat already accepts the read-only Call Sheet plus site access card as compliant |
| AM-5 | CS2-2 | PD-11 | Default `show_to_client` on for gc and sub rows whose job window covers this week, designer can hide | no, it is a studio-surface default | Still an amendment to PD-11; take the compliant version first, a one-act "show this week's crew" with the default left false |
| AM-6 | CS3 AA-1 | PD-3 | Let the engagement read compliance documents and contact rules live from the firm and person cards while name, trade, and phone stay snapshotted | no, it is internal data shape | Recommend adopting, narrowed per D-A; a snapshot of an expiry is wrong the day after it is taken |
| AM-7 | CS3 AA-2 | PD-4 | A studio-editable extension list for trades and firm kinds, layered over the code-resident base | no, it is a vocabulary policy | Defer; widen `FieldTrade` in code now and revisit when a second region onboards |
| AM-8 | CS3 AA-3 | S2, PR-3 | A tokened upload page on the evidence-upload shape where a sub's office manager drops a fresh COI and the expiry is read from it | yes | Same family as AM-1, AM-11, AM-15; compliant version is studio upload plus a drafted chase landing `awaiting_review` |
| AM-9 | CS3 AA-4 | PR-1 | A `held_by` field (studio or GC firm) on each compliance document, with no GC-facing surface | no, it is one column with no new user | Adopt; it records who owns the chase without making the GC's back office a user |
| AM-10 | CS4 AA-1 | PR-3, S2 | A paperwork page on the trade's field link: upload COI, W-9, licence, sign the draw's waivers, read retainage held and release date | yes | The widest version of the trade-portal ask; compliant version is studio-recorded documents chased to the firm's paperwork contact |
| AM-11 | CS4 AA-2 | PR-3 | A party-on-job may name another sub as the party it contracts through, so the super knows whose COI covers a body on site | yes | Same as AM-3; take `contracted_through` plus crew list |
| AM-12 | CS5-1 | PR-3 | An owner's representative seat: a client-side login with delegated money and change-order authority and read of the decision log | yes | Primary user is the homeowner's agent; compliant version is a `client_rep` engagement with authority facts, approvals recorded by the studio |
| AM-13 | CS5-2 | PR-3, S2 | Firm self-service compliance upload: the sub's office manager uploads a renewed COI or a signed waiver through a tokened link | yes | Same family as AM-1, AM-8, AM-10, AM-15 |
| AM-14 | CS5-3 | PR-3 | A lender draw packet link: the draw inspector reads the draw package and the waiver ledger through a read-only link | yes | Lender-facing; compliant version is a PDF export from the waiver ledger |
| AM-15 | CS6 AA-1 | PR-3, S2 | One upload door on the field link page for COI, W-9, and licence, writing with `source = field_link` | yes | Fifth seat asking the same thing; see the note below |
| AM-16 | CS6 AA-2 | PR-3 | A 30-day hashed read link on the draw, minted by the bookkeeper, for the lender's inspector | yes | Same as AM-14 |
| AM-17 | CS6 AA-3 | PD-3 | Read phone and consent from the rolodex card when `studio_contact_id` is set; the row keeps history only | no, it is internal data shape | Recommend adopting for phone and consent, folded into AM-6 and D-A |

Convergence worth Kody's ruling: five of six seats (AM-1, AM-8, AM-10, AM-13, AM-15) ask for the same object, a trade-side upload door for compliance paper. Each is a side journey under S2 taken alone. Together they are one ruling, not five, and the compliant fallback is identical in all five: the studio records the document on the company card and Patina drafts the chase to the firm's paperwork contact, landing `awaiting_review`.

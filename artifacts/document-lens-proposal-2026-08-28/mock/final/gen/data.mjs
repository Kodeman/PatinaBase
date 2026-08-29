/* The Vandersteen residence -- source/specimen.md, verbatim where the specimen
   speaks. Every name the specimen does NOT give is invented in its own register
   (Wisconsin and Illinois places, real-sounding makers, plain Midwest nouns) and
   is listed in FINAL.md "What the mock does not claim". ASCII only. */

export const JOB = {
  title: 'The Vandersteen residence',
  household: 'Marit &amp; Dale Vandersteen',
  place: 'Shorewood Hills, Madison WI',
  studio: 'Middlewest Studio, Madison',
  opened: '2026-03-02',
  phase: 'Procurement &amp; Orders',
  phaseCount: '4 OF 6',
  section: 'PROJECT',
  install: 'Tuesday 2026-09-15',
  today: 'Tuesday 2026-08-25',
  timer: '0:47'
};

/* the six phases behind the letterhead's PHASES fold */
export const PHASES = [
  ['01', 'Brief', 'Closed 2026-03-14', 'SETTLED'],
  ['02', 'Discovery', 'Closed 2026-04-02', 'SETTLED'],
  ['03', 'Direction', 'Closed 2026-05-19', 'SETTLED'],
  ['04', 'Procurement &amp; Orders', 'Open since 2026-06-08', 'IN HAND'],
  ['05', 'Install', 'Tue 2026-09-15', 'AHEAD'],
  ['06', 'Closing the book', 'Not dated', 'AHEAD']
];

/* the standing set, ranked by deadline. Four, so line 2 prints one and
   "+3 MORE" -- the proposal's own count. */
export const STANDING = [
  {
    when: 'OVERDUE 6 DAYS',
    line: 'Primary bedroom approval &mdash; the Hartland wool rug and the walnut nightstands, with the client since Aug 13',
    owner: 'CLIENT',
    act: 'SEND A REMINDER',
    short: 'Primary bedroom approval, six days with the client'
  },
  {
    when: 'OVERDUE 3 DAYS',
    line: 'Living room fabric selection for the reading chair &mdash; the workroom needed COM by Aug 22 to hold install',
    owner: 'DESIGNER',
    act: 'CHOOSE THE FABRIC',
    short: 'Living room fabric, three days past the workroom date'
  },
  {
    when: 'CLOSES TOMORROW',
    line: 'Damage claim on the brass-and-oak console, Fond du Lac Ironworks &mdash; the carrier window closes Aug 26',
    owner: 'DESIGNER',
    act: 'FILE THE CLAIM',
    short: 'Carrier window on the console claim closes tomorrow'
  },
  {
    when: '14 DAYS NO ACK',
    line: 'PO-2026-0418, Sturdy Oak Woodworks, $14,880 &mdash; sent Aug 11, never acknowledged',
    owner: 'MAKER',
    act: 'CHASE THE PO',
    short: 'PO-2026-0418 unacknowledged fourteen days'
  }
];

export const APPROVALS = [
  {
    stamp: 'OVERDUE 6D',
    name: 'Primary bedroom &mdash; rug and nightstands',
    sub: 'SENT 2026-08-13 &middot; OWNER CLIENT &middot; HARTLAND WOOL RUG 9 x 12, WALNUT NIGHTSTANDS PAIR',
    act: 'SEND A REMINDER'
  },
  {
    stamp: 'OVERDUE 3D',
    name: 'Living room &mdash; fabric for the reading chair',
    sub: 'WORKROOM NEEDS COM BY 2026-08-22 TO HOLD INSTALL &middot; OWNER DESIGNER',
    act: 'CHOOSE THE FABRIC'
  },
  {
    stamp: null,
    name: 'Dining room &mdash; finish sample, white oak',
    sub: 'AUTHORED 2026-07-28 &middot; APPROVED 2026-08-01 &middot; OWNER CLIENT',
    act: 'OPEN THE RECORD'
  },
  {
    stamp: null,
    name: 'Whole house &mdash; hardware finish, unlacquered brass',
    sub: 'AUTHORED 2026-06-30 &middot; APPROVED 2026-07-06 &middot; OWNER CLIENT',
    act: 'OPEN THE RECORD'
  }
];

export const SCHEDULE = [
  ['2026-08-22', 'COM to the workroom, Baraboo', 'OVERDUE 3D', true],
  ['2026-08-26', 'Carrier claim window, Fond du Lac console', 'CLOSES TOMORROW', true],
  ['2026-09-02', 'Case goods to receiving, Waukesha', 'THIS WEEK', false],
  ['2026-09-08', 'Site walk with the trades', 'AHEAD', false],
  ['2026-09-15', 'Install &mdash; Tuesday', 'THREE WEEKS OUT', false],
  ['2026-09-19', 'Punch list and handover', 'AHEAD', false]
];

/* Pieces -- all four rooms, 36 lines, with the states the specimen gives each.
   st: ordered | transit | delivered | decision | damaged | unspecified */
export const ROOMS = [
  {
    id: 'living',
    name: 'Living room',
    alloc: '14 LINES &middot; 11 ORDERED &middot; 2 IN TRANSIT &middot; 1 DAMAGED',
    lines: [
      ['Brass-and-oak console', 'Fond du Lac Ironworks', 'damaged', '$3,240', 'DELIVERED 2026-08-19 &middot; TOP PANEL GOUGED &middot; CLAIM DRAFTED, NOT FILED'],
      ['Sectional sofa, 112 in', 'Baraboo Upholstery Works', 'ordered', '$8,450', 'PO-2026-0402 &middot; ACKNOWLEDGED 2026-07-31'],
      ['Reading chair', 'Baraboo Upholstery Works', 'ordered', '$2,180', 'HELD FOR COM &middot; FABRIC NOT CHOSEN'],
      ['Live-edge coffee table', 'Blue Mounds Joinery', 'transit', '$4,100', 'SHIPPED 2026-08-21 &middot; DUE 2026-08-29'],
      ['Wool area rug, 10 x 14', 'Oconomowoc Rug Merchants', 'ordered', '$6,900', 'PO-2026-0407 &middot; 6 WEEK LEAD'],
      ['Floor lamp, pair', 'Racine Lamp Company', 'ordered', '$1,760', 'PO-2026-0411'],
      ['Table lamp, walnut base', 'Racine Lamp Company', 'ordered', '$840', 'PO-2026-0411'],
      ['Linen drapery, four panels', 'Spring Green Textiles', 'ordered', '$3,320', 'PO-2026-0409 &middot; WORKROOM CUT 2026-08-18'],
      ['Drapery hardware, brass', 'Whitewater Metal Shop', 'transit', '$980', 'SHIPPED 2026-08-23'],
      ['Side table, marble top', 'Evanston Marble Works', 'ordered', '$1,540', 'PO-2026-0414'],
      ['Ottoman, leather', 'Prairie du Sac Leather', 'ordered', '$1,120', 'PO-2026-0414'],
      ['Bookcase, built-in trim', 'Galena Cabinet Shop', 'ordered', '$5,600', 'PO-2026-0416 &middot; FIELD MEASURED 2026-08-04'],
      ['Ceramic vessel, large', 'Mineral Point Pottery', 'ordered', '$410', 'PO-2026-0417', 'planter-set'],
      ['Throw pillows, set of six', 'Kettle Moraine Weavers', 'ordered', '$520', 'PO-2026-0417']
    ]
  },
  {
    id: 'dining',
    name: 'Dining room',
    alloc: '8 LINES &middot; 8 ORDERED &middot; 6 DELIVERED',
    lines: [
      ['Heirloom oak dining table', 'Sturdy Oak Woodworks, Dodgeville WI', 'ordered', '$6,480', 'PO-2026-0418 &middot; SENT 2026-08-11 &middot; 14 DAYS NO ACK', 'heirloom-thumb'],
      ['Side chairs, set of six', 'Sturdy Oak Woodworks, Dodgeville WI', 'ordered', '$8,400', 'PO-2026-0418 &middot; 8 WEEK LEAD, PAST INSTALL MATH', 'live-edge-coffee-table'],
      ['Sideboard, white oak', 'Blue Mounds Joinery', 'delivered', '$5,200', 'RECEIVED 2026-08-12, WAUKESHA'],
      ['Pendant, hand-blown glass', 'Cedarburg Glassworks', 'delivered', '$2,340', 'RECEIVED 2026-08-12, WAUKESHA', 'pendant-lamp'],
      ['Dining rug, flatweave', 'Oconomowoc Rug Merchants', 'delivered', '$3,150', 'RECEIVED 2026-08-05, WAUKESHA', 'heirloom-oak-dining-table'],
      ['Wall sconces, pair', 'Racine Lamp Company', 'delivered', '$1,280', 'RECEIVED 2026-08-05, WAUKESHA'],
      ['Linen runner and napkins', 'Kettle Moraine Weavers', 'delivered', '$340', 'RECEIVED 2026-07-29, WAUKESHA'],
      ['Mirror, antiqued brass', 'Rockford Brass &amp; Iron', 'delivered', '$1,890', 'RECEIVED 2026-07-29, WAUKESHA']
    ]
  },
  {
    id: 'primary',
    name: 'Primary bedroom',
    alloc: '9 LINES &middot; 7 ORDERED &middot; 2 AWAITING THE CLIENT, OVERDUE',
    lines: [
      ['Hartland wool rug, 9 x 12', 'Oconomowoc Rug Merchants', 'decision', '$7,400', 'SENT TO THE CLIENT 2026-08-13 &middot; OVERDUE 6 DAYS'],
      ['Walnut nightstands, pair', 'New Glarus Woodturning', 'decision', '$4,600', 'SENT TO THE CLIENT 2026-08-13 &middot; OVERDUE 6 DAYS'],
      ['Bed, upholstered king', 'Baraboo Upholstery Works', 'ordered', '$6,200', 'PO-2026-0405'],
      ['Bench, foot of bed', 'Prairie du Sac Leather', 'ordered', '$1,480', 'PO-2026-0414'],
      ['Dresser, nine-drawer', 'Galena Cabinet Shop', 'ordered', '$5,900', 'PO-2026-0416'],
      ['Reading sconces, pair', 'Racine Lamp Company', 'ordered', '$960', 'PO-2026-0411'],
      ['Drapery, blackout lined', 'Spring Green Textiles', 'ordered', '$2,880', 'PO-2026-0409'],
      ['Armchair, corner', 'Baraboo Upholstery Works', 'ordered', '$2,340', 'PO-2026-0402'],
      ['Bedding, layered set', 'Kettle Moraine Weavers', 'ordered', '$1,150', 'PO-2026-0417']
    ]
  },
  {
    id: 'mudroom',
    name: 'Mudroom',
    alloc: '5 LINES &middot; 3 ORDERED &middot; 2 NOT SPECIFIED',
    lines: [
      ['Bench with cubbies', 'Galena Cabinet Shop', 'ordered', '$3,400', 'PO-2026-0416 &middot; THE CLIENT HAS A QUESTION ON THIS LINE'],
      ['Hooks and rail, blackened steel', 'Whitewater Metal Shop', 'ordered', '$620', 'PO-2026-0413'],
      ['Runner, indoor-outdoor', 'Oconomowoc Rug Merchants', 'ordered', '$780', 'PO-2026-0407'],
      ['Ceiling fixture', 'Not specified', 'unspecified', 'Not known yet', 'NOTHING SPECIFIED &middot; NAME A PIECE TO PRICE THE ROOM'],
      ['Boot tray', 'Not specified', 'unspecified', 'Not known yet', 'NOTHING SPECIFIED &middot; NAME A PIECE TO PRICE THE ROOM']
    ]
  }
];

export const MONEY = [
  ['FF&amp;E approved', '$184,500', 'THE BUDGET THE CLIENT SIGNED'],
  ['Specified', '$171,240', '92.8% OF APPROVED'],
  ['Ordered', '$141,600', '$29,640 SPECIFIED, NOT ORDERED'],
  ['Invoiced', '$96,400', 'ACROSS 7 INVOICES'],
  ['Paid', '$78,900', 'LAST PAYMENT 2026-08-03'],
  ['Outstanding', '$17,500', 'INVOICE 2026-114 &middot; 22 DAYS'],
  ['Deposit due, not drawn', '$12,300', 'PO-2026-0418 &middot; 50% AT RELEASE'],
  ['Design fee', '$34,000', '3 OF 4 MILESTONES BILLED'],
  ['Hours this week', '6.4', 'MON 2.1 &middot; TUE 4.3']
];

export const CARE = [
  ['Warranty file', 'Nothing yet', 'START THE FILE'],
  ['Care card for the household', 'Nothing yet', 'DRAFT THE CARD'],
  ['Maker letters', 'Nothing yet', 'WRITE THE LETTERS'],
  ['Photography', 'Nothing yet', 'BOOK THE SHOOT'],
  ['Final invoice', 'Nothing yet', 'DRAW THE INVOICE'],
  ['Handover book', 'Nothing yet', 'OPEN THE BOOK']
];

export const RECORD = [
  ['Okonkwo kitchen', 'Middleton WI', 'COMPLETED 2026-08-14 &middot; PUNCH LIST PENDING'],
  ['Halvorsen porch', 'Maple Bluff WI', 'COMPLETED 2026-05-30'],
  ['Ives loft', 'Milwaukee WI', 'COMPLETED 2026-03-11'],
  ['Danforth farmhouse', 'Mount Horeb WI', 'COMPLETED 2025-11-22'],
  ['Sandoval townhouse', 'Evanston IL', 'COMPLETED 2025-09-05']
];

/* the margin, seven items -- all MONEY and TIME kinds, exactly as F66 records
   the specimen. Three anchored to Pieces, four about the whole job. */
export const MARGIN_ITEMS = [
  ['TIME', 'ffe', 'The carrier window on the console claim closes tomorrow', 'FOND DU LAC IRONWORKS &middot; 2026-08-26'],
  ['TIME', 'ffe', 'COM to the workroom is three days past', 'BARABOO UPHOLSTERY WORKS &middot; 2026-08-22'],
  ['TIME', 'ffe', 'PO-2026-0418 has gone fourteen days without an acknowledgement', 'STURDY OAK WOODWORKS &middot; SENT 2026-08-11'],
  ['MONEY', null, 'Invoice 2026-114 is twenty-two days outstanding', '$17,500 &middot; SENT 2026-08-03'],
  ['MONEY', null, 'The deposit on PO-2026-0418 has not been drawn', '$12,300 &middot; 50% AT RELEASE'],
  ['MONEY', null, 'Milestone four of the design fee is unbilled', '$34,000 FEE &middot; 3 OF 4 BILLED'],
  ['MONEY', null, 'Specified but not ordered', '$29,640 &middot; ACROSS 3 ROOMS']
];

/* the ladder -- one line per stop, the value strings from proposal.md section 4 */
export const STOPS = [
  ['approvals', 'Client approvals', '2 AWAITING &middot; 1 OVERDUE 6D', 'SEND A REMINDER', 59],
  ['schedule', 'Schedule', 'INSTALL SEP 15 &middot; 3 WEEKS', 'MOVE THE DATE', 54],
  ['ffe', 'Pieces', '36 LINES &middot; 1 DAMAGED AUG 26', 'SPEC THE 2 UNSPECIFIED', 177],
  ['money', 'Money', '$17,500 OUT &middot; $12,300 UNDRAWN', 'DRAW AN INVOICE', 50],
  ['care', 'Closing the book', '0 OF 6 CLOSED OUT', 'START THE CLOSE', 52],
  ['record', 'The record', '12 COMPLETE', 'OPEN THE RECORD', 51]
];

export const COUNT_LINES = {
  approvals: '2 awaiting the client &middot; 1 overdue 6d',
  schedule: 'Install Tue Sep 15 &middot; 3 weeks out',
  ffe: '36 lines &middot; 4 rooms &middot; 1 damaged',
  money: '$17,500 out &middot; $12,300 not drawn',
  care: '0 of 6 closed out',
  record: '12 complete'
};

export const REGION_NAMES = {
  approvals: 'Client approvals',
  schedule: 'Schedule',
  ffe: 'Pieces',
  money: 'Money',
  care: 'Closing the book',
  record: 'The record'
};

export const DOORS = ['Plan room', 'Spec book', 'Mood boards', 'Call sheet'];

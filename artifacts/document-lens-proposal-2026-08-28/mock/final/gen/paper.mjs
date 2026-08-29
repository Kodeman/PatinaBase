import { JOB, PHASES, STANDING, APPROVALS, SCHEDULE, ROOMS, MONEY, CARE, RECORD,
         MARGIN_ITEMS, STOPS, COUNT_LINES, REGION_NAMES, DOORS } from './data.mjs';

/* ---------- small print helpers, in the R126 register ---------- */

const act = (label, cls, attrs) =>
  '<button type="button" class="act ' + (cls || '') + '"' + (attrs ? ' ' + attrs : '') +
  '><span class="da-pool" aria-hidden="true"></span><span class="da-label">' + label + '</span></button>';

const mark = (state, size) =>
  '<span class="strata-mark size-' + (size || 'xs') + ' state-' + state + '"' +
  (state === 'active' ? ' data-breath="1"' : '') + ' aria-hidden="true"><i></i><i></i><i></i></span>';

const stamp = (kind, word) =>
  '<span class="stamp stamp-' + kind + '"><span class="stamp-fill" aria-hidden="true"></span>' +
  '<span class="stamp-word">' + word + '</span></span>';

/* the six states a Pieces line can be in. Only the three states that still owe
   the designer something are struck as filled stamps -- ORDERED (clay),
   DECISION DUE (golden hour), DAMAGED (terracotta), the three tinted stamp
   recipes the R126 register ships. A settled or not-yet-begun state prints as a
   plain mono word: colour belongs on the small things that still carry a need. */
const STATE_MARK = {
  ordered: () => stamp('ordered', 'ORDERED'),
  decision: () => stamp('decision', 'DECISION DUE'),
  damaged: () => stamp('damaged', 'DAMAGED'),
  transit: () => '<span class="ffe-state">IN TRANSIT</span>',
  delivered: () => '<span class="ffe-state">DELIVERED</span>',
  unspecified: () => '<span class="ffe-state">NOT SPECIFIED</span>'
};

/* ---------- the letterhead and the band ---------- */

function letterhead(f) {
  return '' +
  '<div class="letterhead">' +
    '<div class="lh-marks">' +
      mark('settled', 'lg') +
    '</div>' +
    '<h1 class="lh-title" id="doc-title-' + f + '">' + JOB.title + '</h1>' +
    '<p class="lh-house">' +
      '<span class="lh-household">' + JOB.household + '</span>' +
      '<span class="stage-plate">' + JOB.section + '</span>' +
    '</p>' +
    '<p class="vitals">' +
      '<span class="vital">OPENED<b>' + JOB.opened + '</b></span>' +
      '<span class="vital">PHASE<b>' + JOB.phaseCount + '</b></span>' +
      '<span class="vital">STUDIO<b>MIDDLEWEST, MADISON</b></span>' +
      '<span class="vital">IN HAND TODAY<b>' + JOB.timer + '</b></span>' +
      '<span class="vital-act">' +
        act('PHASES', 'is-quiet', 'data-fold="phases-' + f + '" aria-expanded="false" aria-controls="phases-' + f + '"') +
      '</span>' +
    '</p>' +
    '<div class="lh-fold" id="phases-' + f + '" data-open="false">' +
      '<div class="lh-fold-body"><div><ol>' +
        PHASES.map(function (p) {
          return '<li class="phase-row' + (p[3] === 'IN HAND' ? ' is-active' : '') + '">' +
            '<span class="phase-num">' + p[0] + '</span>' +
            '<span class="phase-name">' + p[1] + '</span>' +
            '<span class="phase-when">' + p[2] + '</span>' +
            (p[3] === 'SETTLED' ? stamp('ordered', 'SETTLED')
              : p[3] === 'IN HAND' ? stamp('decision', 'IN HAND')
              : '<span class="phase-state">AHEAD</span>') +
          '</li>';
        }).join('') +
      '</ol></div></div>' +
    '</div>' +
  '</div>';
}

function band(f) {
  const worst = STANDING[0];
  const left390 = f === '390';
  /* Line 1 is TWO layers in one 15.4px box, both absolutely placed, crossfading
     (L-1's own grammar). At rest it prints the one fact the letterhead does not
     carry -- the money -- flush left; pinned, it prints identity and phase left
     with the install date and the money right-flush. Neither layer moves the
     other, so the yield costs no layout and files no shift. */
  return '' +
  '<div class="lens-band lens-line" id="lens-' + f + '" data-lens-open="true" style="--lens-height: var(--lens-h-open);">' +
    '<p class="band-1">' +
      /* at 390 line 1 carries the two facts the letterhead does not print and
         nothing else -- the household is in the mobile bar's left zone, where it
         prints at every offset for free -- so the line does not turn at all. */
      (left390
        ? '<span class="band-1-layer band-1-rest" style="opacity:1">' +
            '<button type="button" class="band-house" data-top="' + f + '">$17,500 OUT</button>' +
            ' &middot; INSTALL SEP 15</span>'
        : '<span class="band-1-layer band-1-rest">$17,500 OUT</span>' +
          '<span class="band-1-layer band-1-read">' +
            '<span class="band-1-left">' +
              '<button type="button" class="band-house" data-top="' + f + '">VANDERSTEEN RESIDENCE</button>' +
              ' &middot; PROCUREMENT &amp; ORDERS ' + JOB.phaseCount +
            '</span>' +
            '<span class="band-1-right" data-money-slot="1">INSTALL SEP 15 &middot; $17,500 OUT</span>' +
          '</span>') +
    '</p>' +
    '<p class="band-2" data-lens-live="1" aria-live="polite">' +
      '<span class="band-2-text lens-sentence-incoming" data-arrived="true">' +
        (left390 ? 'OVERDUE 6D &middot; BEDROOM'
                 : worst.when + ' &middot; Primary bedroom approval, with the client since Aug 13') +
      '</span>' +
      act(left390 ? 'REMIND' : worst.act, 'is-lead', 'data-standing-act="1"') +
      act('+3 MORE', 'is-quiet', 'data-open-sheet="sheet-standing-' + f + '"') +
    '</p>' +
  '</div>';
}

/* ---------- the regions ---------- */

function regionShell(f, id, bodyHtml, leader) {
  /* the rest state is painted by markup + CSS alone: approvals is the reading
     stop at scroll 0, every stop below it is condensed. */
  const d = (id === 'approvals') ? 'full' : 'condensed';
  return '' +
  '<section class="region" data-region="' + id + '" data-density="' + d + '"' +
    ' data-reserve="' + ((id === 'care' || id === 'record') ? 'short' : 'standing') + '"' +
    ' id="region-' + id + '-' + f + '">' +
    '<div class="region-rule" aria-hidden="true"></div>' +
    '<header class="region-head" data-region-head="' + id + '">' +
      '<div>' +
        '<h2 class="rh-name" id="head-' + id + '-' + f + '" tabindex="-1">' + REGION_NAMES[id] + '</h2>' +
        '<p class="rh-count">' + COUNT_LINES[id] + '</p>' +
        '<p class="rh-quiet">NOT YET ON THE PAPER &middot; PRESS ' +
          REGION_NAMES[id].toUpperCase() + ' ON THE INDEX TO OPEN</p>' +
      '</div>' +
      '<div class="rh-ledger">' + act(leader, 'is-lead') + '</div>' +
    '</header>' +
    '<div class="region-body">' + bodyHtml + '</div>' +
  '</section>';
}

function approvals(f) {
  return regionShell(f, 'approvals',
    APPROVALS.map(function (a) {
      return '<div class="appr-row">' +
        '<p><span class="appr-name">' + a.name + '</span>' +
          '<span class="appr-sub">' + a.sub + '</span></p>' +
        '<span class="appr-right">' +
          (a.stamp ? stamp('damaged', a.stamp) : stamp('ordered', 'APPROVED')) +
          act(a.act, a.stamp ? 'is-lead' : 'is-quiet') +
        '</span>' +
      '</div>';
    }).join(''),
    'SEND A REMINDER');
}

function schedule(f) {
  const marks = [
    [0, 'AUG 22'], [14, 'AUG 26'], [38, 'SEP 2'], [60, 'SEP 8'], [82, 'SEP 15'], [100, 'SEP 19']
  ];
  const rule = '<div class="sched-rule" aria-hidden="true">' +
    marks.map(function (m) {
      return '<i style="left:' + m[0] + '%"></i><b style="left:' + m[0] + '%">' + m[1] + '</b>';
    }).join('') + '</div><div style="height:26px"></div>';
  return regionShell(f, 'schedule',
    rule +
    SCHEDULE.map(function (s) {
      return '<div class="sched-row' + (s[3] ? ' is-late' : '') + '">' +
        '<span class="sched-date">' + s[0] + '</span>' +
        '<span class="sched-what">' + s[1] + '</span>' +
        '<span class="sched-when">' + s[2] + '</span>' +
      '</div>';
    }).join(''),
    'MOVE THE DATE');
}

function ffe(f) {
  let body = '';
  ROOMS.forEach(function (room) {
    body += '<div class="room-head" id="room-' + room.id + '-' + f + '">' +
      mark(room.id === 'mudroom' ? 'future' : 'active', 'sm') +
      '<span class="room-name">' + room.name + '</span>' +
      '<span class="room-alloc">' + room.alloc + '</span>' +
    '</div>';
    room.lines.forEach(function (l, i) {
      const st = l[2];
      /* RF-01: l[5] is the basename of the crop in mock/img/ that this line is
         catalog-linked to, or undefined. Five lines carry a real 48px crop; the
         placeholder glyph is left only where the line has no catalog piece. */
      const crop = l[5];
      const editable = st === 'unspecified';
      body += '<div class="ffe-row st-' + st + (editable ? ' lens-row-editing" data-editing="false' : '') + '">' +
        '<span class="row-wash" aria-hidden="true"></span>' +
        '<span class="thumb ' + (crop ? 'is-catalog crop-' + crop : 'is-unlinked') + '" role="img" aria-label="' +
          (crop ? 'Catalog crop, ' + l[0].toLowerCase() : 'No catalog crop on this line') + '"></span>' +
        '<span><span class="ffe-name">' + l[0] + '</span>' +
          '<span class="ffe-vendor">' + l[1] + '</span>' +
          '<span class="ffe-note">' + l[4] + '</span></span>' +
        '<span class="ffe-right">' +
          (editable
            ? '<input class="spec-input" id="spec-' + room.id + '-' + i + '-' + f +
              '" type="text" placeholder="NAME A PIECE" data-pen="1" aria-label="Specify ' +
              l[0] + ', ' + room.name + '">'
            : '') +
          STATE_MARK[st]() +
          '<span class="ffe-price' + (l[3].charAt(0) === '$' ? '' : ' is-none') + '">' + l[3] + '</span>' +
        '</span>' +
      '</div>';
    });
  });
  return regionShell(f, 'ffe', body, 'SPEC THE 2 UNSPECIFIED');
}

function money(f) {
  return regionShell(f, 'money',
    '<div class="money-ladder">' + MONEY.map(function (m) {
      return '<div class="ml-rung' + (m[0] === 'Outstanding' ? ' is-out' : '') + '">' +
        '<span class="ml-label">' + m[0] + '</span>' +
        '<span class="ml-value">' + m[1] + '</span>' +
        '<span class="ml-note">' + m[2] + '</span>' +
      '</div>';
    }).join('') + '</div>',
    'DRAW AN INVOICE');
}

function care(f) {
  return regionShell(f, 'care',
    CARE.map(function (c) {
      return '<div class="care-row">' +
        '<span class="care-name">' + c[0] + '</span>' +
        '<span class="care-state">' + c[1] + '</span>' +
        act(c[2], 'is-quiet') +
      '</div>';
    }).join(''),
    'START THE CLOSE');
}

function record(f) {
  return regionShell(f, 'record',
    '<div class="rec-bars" aria-hidden="true">' +
      mark('settled') + mark('settled') + mark('settled') + mark('settled') +
      mark('settled') + mark('settled') + mark('settled') +
    '</div>' +
    RECORD.map(function (r) {
      return '<div class="rec-row">' +
        '<span class="rec-name">' + r[0] + '</span>' +
        '<span class="rec-state">' + r[1] + '</span>' +
        '<span class="rec-state">' + r[2] + '</span>' +
      '</div>';
    }).join(''),
    'OPEN THE RECORD');
}

function colophon(f) {
  return '<footer class="colophon">' +
    '<span class="colophon-line">' + JOB.title.toUpperCase() + ' &middot; ' + JOB.place.toUpperCase() +
      ' &middot; ' + JOB.studio.toUpperCase() + ' &middot; OPENED ' + JOB.opened + '</span>' +
    '<span class="colophon-acts">' + act('PRINT THIS PAPER', 'is-quiet') +
      act('EXPORT THE SET', 'is-quiet') + '</span>' +
  '</footer>';
}

export function paper(f) {
  return '' +
  '<main class="paper" id="paper-' + f + '"><div class="paper-measure">' +
    '<div class="lens-sentinel" id="sentinel-' + f + '">' + letterhead(f) + '</div>' +
    band(f) +
    approvals(f) + schedule(f) + ffe(f) + money(f) + care(f) + record(f) +
    colophon(f) +
  '</div></main>';
}

/* ---------- the rail ---------- */

/* the ladder's declared extents, per tier. 36px floor first, the remainder by
   data-derived extent (proposal section 4); the Pieces slot additionally
   reserves its four 28px room sub-rungs INSIDE its own box. */
const SLOTS = {
  '1440': [59, 54, 177, 50, 52, 51],
  '1280': [46, 46, 115, 61, 46, 30]
};

/* 1280 rail fix: at 136px, every value already wraps to 2-3 lines (measured:
   approvals/schedule/care 42.8px, money 58.2px, record 27.4px) and the Pieces
   seg alone -- before its four room rows even open -- runs 3-4 lines. The old
   uniform 24px floor (143px for Pieces) under-budgeted every one of those
   against the real 1280 rail width; 1440's wider column never hits it, so its
   floors are untouched. Floors are the measured content height + a few px. */
const MIN_HEIGHTS = {
  '1440': [24, 24, 143, 24, 24, 24],
  '1280': [45, 45, 112, 60, 45, 29]
};

export function rail(f) {
  const heights = SLOTS[f];
  const track = heights.reduce(function (a, b) { return a + b; }, 0);
  const floors = MIN_HEIGHTS[f];

  let segs = '';
  STOPS.forEach(function (s, i) {
    /* RF-05: the extent stays DATA-DERIVED -- it is the flex basis and the grow
       and shrink weight -- but the ladder now takes the height the rail has
       between the head rule and FILED WITH THIS JOB instead of a declared
       443px with slack under it. */
    /* Override 2 (proposal.md): at 1280 the rail cannot hold Pieces' own
       wrapped value AND all four open room rows without clipping, so the
       rows stay collapsed (see the frame-1280 CSS override) and the count
       prints in the value line instead -- "36 LINES ROOMS 1 DAMAGED" ->
       "36 LINES 4 ROOMS 1 DAMAGED". 1440 has the room, so it keeps listing
       the rows open and its value text is untouched. */
    const collapseRooms = f === '1280' && s[0] === 'ffe';
    const value = collapseRooms ? s[2].replace('&middot;', '&middot; 4 ROOMS &middot;') : s[2];
    segs += '<div class="seg-slot" style="flex:' + heights[i] + ' ' + heights[i] +
      ' auto;min-height:' + floors[i] + 'px">' +
      '<button type="button" class="seg lens-nav-segment" data-seg="' + s[0] + '"' +
      ' data-reading-index="false"' +
      ' aria-label="' + s[1] + ' &mdash; ' + value.replace(/&middot;/g, 'and').replace(/&amp;/g, 'and') + '">' +
      '<span class="seg-value lens-segment-value" data-region-head-in-frame="false">' + value + '</span>' +
      /* RF-02: a segment that yields its VALUE still prints its NAME. A map that
         does not name the place you are standing is F13 in a new coat, so the
         two are one crossfading pair in one 15.4px box -- the value while the
         head is elsewhere, the name in --text-muted while the head is in frame.
         The name is a position signal, never a fact, so SP-08 still holds. */
      '<span class="seg-name" data-region-head-in-frame="false">' +
        s[1].toUpperCase() + '</span>' +
      '</button>' +
      (s[0] === 'ffe'
        ? '<div class="rungs" data-rungs="1">' + ROOMS.map(function (r) {
            return '<button type="button" class="rung lens-nav-room-rung" data-room-visible="false"' +
              ' data-room="' + r.id + '" aria-pressed="false">' +
              '<span class="rung-name">' + r.name + '</span></button>';
          }).join('') + '</div>'
        : '') +
      '</div>';
  });

  return '' +
  '<aside class="spine" id="rail-' + f + '" data-reading-index="approvals" aria-label="This paper">' +
    '<button type="button" class="act is-quiet spine-put-down" data-put-down="1">' +
      '<span class="da-pool" aria-hidden="true"></span>' +
      '<span class="da-label">&larr; PUT DOWN</span></button>' +
    '<div class="rail-head">' +
      '<button type="button" class="rail-head-btn" data-top="' + f + '">' +
        /* RF-02 (L-6): the household is a position signal too, so the name line
           does NOT yield while the letterhead is in frame -- it prints in
           --text-muted and turns to --text-primary once the letterhead is gone.
           Only the stage phrase and the phase count yield. */
        '<span class="rail-name" data-letterhead-in-frame="true">Vandersteen</span>' +
        '<span class="rail-arc" aria-hidden="true">' +
          mark('settled') + mark('settled') + mark('settled') + mark('active') +
          mark('future') + mark('future') + mark('future') +
        '</span>' +
        '<span class="rail-stage lens-rail-head-line" data-letterhead-in-frame="true">PROCUREMENT &amp; ORDERS</span>' +
        '<span class="rail-count" data-letterhead-in-frame="true">' + JOB.phaseCount + '</span>' +
      '</button>' +
    '</div>' +
    '<div class="rail-rule-mid" aria-hidden="true"></div>' +
    '<div class="ladder" style="flex-basis:' + track + 'px">' +
      '<span class="lens-reading-window" data-window="1" aria-hidden="true"></span>' +
      segs +
    '</div>' +
    '<div class="rail-rule-hair" aria-hidden="true"></div>' +
    '<p class="doors-head">FILED WITH THIS JOB</p>' +
    DOORS.map(function (d) {
      return '<button type="button" class="door"><span class="door-name">' + d + '</span></button>';
    }).join('') +
  '</aside>';
}

/* ---------- the margin ---------- */

export function marginBody(f) {
  const beside = MARGIN_ITEMS.filter(function (m) { return m[1] === 'ffe'; });
  const whole = MARGIN_ITEMS.filter(function (m) { return !m[1]; });
  const chip = function (m) {
    return '<button type="button" class="margin-chip doc-elevated" data-chip="' + (m[1] || 'job') + '">' +
      '<span class="mc-anchor">' + m[0] + ' &middot; ' + (m[1] ? 'BESIDE PIECES' : 'ABOUT THE WHOLE JOB') + '</span>' +
      '<span class="mc-line">' + m[2] + '</span>' +
      '<span class="mc-sub">' + m[3] + '</span>' +
    '</button>';
  };
  return '' +
    '<p class="margin-note">The margin holds what is beside the paper and not on it &mdash; ' +
      'a note, a photograph from receiving, a figure you are not ready to write down. ' +
      'It is yours; the household never sees it.</p>' +
    '<p class="margin-head">IN THE MARGIN <span>' + MARGIN_ITEMS.length + '</span></p>' +
    '<p class="margin-capture">' + act('NOTE', 'is-quiet') + act('PHOTO', 'is-quiet') +
      act('VOICE', 'is-quiet') + '</p>' +
    '<textarea class="composer" id="composer-' + f + '" data-pen="1" ' +
      'aria-label="Write a margin note" placeholder="Write it in the margin..."></textarea>' +
    /* RF-03: ONE GROUP PER ANCHOR THAT HAS ITEMS, each head naming its own
       anchor and its own count -- so the head can never contradict the cards
       under it, which is what "BESIDE APPROVALS 0 / NOTHING BESIDE THIS STOP
       YET" over three BESIDE PIECES cards did. The lift is carried by
       data-beside-current on the head (the count turns from --text-muted to
       --text-primary while the reader is standing in that anchor's stop): the
       margin lifts, it does not filter, and nothing physically moves, so probe
       item 8 still measures CLS 0. The empty line is gone with the
       contradiction -- it can only be true when the current stop's group is the
       ONLY group, and this paper always prints two. */
    '<p class="margin-head" data-beside-head="ffe" data-beside-current="false">BESIDE PIECES ' +
      '<span>' + beside.length + '</span></p>' +
    '<div data-beside-list="1">' + beside.map(chip).join('') + '</div>' +
    '<p class="margin-head" data-beside-head="job" data-beside-current="false">THE WHOLE JOB ' +
      '<span>' + whole.length + '</span></p>' +
    whole.map(chip).join('') +
    '<p class="margin-head">FILE CHANGES <span>3</span></p>' +
    '<span class="margin-file"><b>2026-08-25</b> Kody moved the install date on the schedule</span>' +
    '<span class="margin-file"><b>2026-08-24</b> Leah filed two receiving photographs</span>' +
    '<span class="margin-file"><b>2026-08-21</b> Kody drafted the damage claim, unsent</span>' +
    '<p class="margin-head">DRAFTS <span>2</span></p>' +
    '<span class="margin-file"><b>CLAIM</b> Fond du Lac Ironworks, awaiting review</span>' +
    '<span class="margin-file"><b>REMINDER</b> Vandersteen approval, awaiting review</span>' +
    '<p class="margin-head">HANDOFFS <span>2</span></p>' +
    '<span class="margin-file"><b>LEAH B.</b> Receiving and claims, Waukesha</span>' +
    '<span class="margin-file"><b>THE WORKROOM</b> Baraboo, holding on COM</span>';
}

export function margin(f) {
  return '<aside class="margin" id="margin-' + f + '" aria-label="The margin">' +
    marginBody(f) + '</aside>';
}

/* ---------- the sheets ---------- */

export function standingSheet(f) {
  return '' +
  '<div class="sheet-wrap" id="sheet-standing-' + f + '" data-open="false" aria-hidden="true">' +
    '<div class="sheet-scrim" data-close-sheet="sheet-standing-' + f + '"></div>' +
    '<div class="lens-sheet-panel doc-elevated" role="dialog" aria-modal="true"' +
      ' aria-label="Everything standing on this paper" data-open="false">' +
      '<div class="sheet-head">' +
        '<p class="sheet-title">EVERYTHING STANDING <span>' + STANDING.length + '</span></p>' +
        act('CLOSE', 'is-quiet', 'data-close-sheet="sheet-standing-' + f + '"') +
      '</div>' +
      STANDING.map(function (s) {
        return '<div class="standing-row">' +
          '<span><span class="standing-when">' + s.when + '</span>' +
            '<span class="standing-line">' + s.line + '</span>' +
            '<span class="standing-owner">OWNER ' + s.owner + '</span></span>' +
          act(s.act, 'is-lead') +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}

export function marginSheet(f) {
  return '' +
  '<div class="sheet-wrap" id="sheet-margin-' + f + '" data-open="false" aria-hidden="true">' +
    '<div class="sheet-scrim" data-close-sheet="sheet-margin-' + f + '"></div>' +
    '<div class="lens-sheet-panel doc-elevated" role="dialog" aria-modal="true"' +
      ' aria-label="The margin" data-open="false">' +
      '<div class="sheet-head">' +
        '<p class="sheet-title">THE MARGIN <span>' + MARGIN_ITEMS.length + '</span></p>' +
        '<span>' +
          act('CAPTURE A NOTE', 'is-lead', 'data-landing="1"') +
          act('CLOSE', 'is-quiet', 'data-close-sheet="sheet-margin-' + f + '"') +
        '</span>' +
      '</div>' +
      marginBody(f) +
    '</div>' +
  '</div>';
}

export function sectionsSheet(f) {
  return '' +
  '<div class="sheet-wrap" id="sheet-sections-' + f + '" data-open="false" aria-hidden="true">' +
    '<div class="sheet-scrim" data-close-sheet="sheet-sections-' + f + '"></div>' +
    '<div class="lens-sheet-panel doc-elevated" role="dialog" aria-modal="true"' +
      ' aria-label="Sections" data-open="false">' +
      '<div class="sheet-head">' +
        '<p class="sheet-title">SECTIONS <span>' + STOPS.length + '</span></p>' +
        act('CLOSE', 'is-quiet', 'data-close-sheet="sheet-sections-' + f + '"') +
      '</div>' +
      '<button type="button" class="sheet-row" data-put-down="1" data-landing="1">' +
        '<span class="sheet-row-name">&larr; Put down</span>' +
        '<span class="sheet-row-value">BACK TO THE DESK</span></button>' +
      STOPS.map(function (s) {
        return '<button type="button" class="sheet-row" data-seg="' + s[0] + '">' +
          '<span class="sheet-row-name">' + s[1] + '</span>' +
          '<span class="sheet-row-value">' + s[2] + '</span></button>';
      }).join('') +
      '<p class="margin-head">FILED WITH THIS JOB <span>' + DOORS.length + '</span></p>' +
      DOORS.map(function (d) {
        return '<button type="button" class="sheet-row">' +
          '<span class="sheet-row-name">' + d + '</span>' +
          '<span class="sheet-row-value">OPEN</span></button>';
      }).join('') +
    '</div>' +
  '</div>';
}

/* ---------- the chrome inside a frame ---------- */

export function drawer(f) {
  return '' +
  '<div class="drawer doc-elevated">' +
    '<div class="drawer-left">' +
      '<span class="drawer-word">THE STUDIO</span>' +
      '<span class="drawer-crumb">MIDDLEWEST STUDIO &middot; MADISON</span>' +
    '</div>' +
    '<div class="drawer-center">' +
      act('LEDGERS', 'is-quiet') + act('THE POST', 'is-quiet') + act('FIND ANYTHING', 'is-quiet') +
    '</div>' +
    '<div class="drawer-right">' +
      '<span class="drawer-hands">IN HAND TODAY<b>' + JOB.timer + '</b></span>' +
      '<span class="drawer-avatar" aria-hidden="true">K</span>' +
    '</div>' +
  '</div>';
}

export function mobileBar(f) {
  return '' +
  '<div class="mobile-bar" data-reading-index="approvals">' +
    '<span class="mb-item">' +
      '<span class="mb-eyebrow">IN THIS DOCUMENT</span>' +
      '<span class="mb-value">' + JOB.title + '</span>' +
    '</span>' +
    /* RF-04: the slot prints the stop the reader is actually standing in, read
       off the same data-reading-index the rail would read at a wider tier (at
       390 there is no rail root, so the frame root and this bar publish it).
       All six names are pre-printed in one fixed box and swapped by VISIBILITY,
       so naming the stop costs no layout shift. */
    '<button type="button" class="mb-item" data-open-sheet="sheet-sections-' + f + '">' +
      '<span class="mb-eyebrow">SECTIONS</span>' +
      '<span class="mb-value mb-swap">' + STOPS.map(function (st) {
        return '<span data-mb-name="' + st[0] + '" data-on="' +
          (st[0] === 'approvals' ? 'true' : 'false') + '">' + st[1] + '</span>';
      }).join('') + '</span>' +
    '</button>' +
    '<button type="button" class="mb-item" data-open-sheet="sheet-margin-' + f + '">' +
      '<span class="mb-eyebrow">MARGIN</span>' +
      '<span class="mb-value">7 &middot; 1 overdue</span>' +
    '</button>' +
  '</div>';
}

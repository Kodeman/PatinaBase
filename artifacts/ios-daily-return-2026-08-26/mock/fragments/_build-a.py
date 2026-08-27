#!/usr/bin/env python3
"""Builds the Direction A mock fragments.

Every fragment is a bare HTML fragment: one .frame-wrap holding exactly one
.frame, plus its numbered callouts, plus a <style> block scoped under a unique
root class for the handful of things kit.css does not carry. Nothing here
redefines a kit token or a kit component.

Run:  python3 _build-a.py
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# frame chrome
# ---------------------------------------------------------------------------

def statusbar(ink=None):
    s = '' if ink is None else ' style="color:%s"' % ink
    return (
        '      <div class="statusbar">\n'
        '        <span class="statusbar__time"%s>9:41</span>\n'
        '        <span class="statusbar__right"%s>\n'
        '          <span class="sb-signal"><i></i><i></i><i></i><i></i></span>\n'
        '          <span class="sb-wifi"></span><span class="sb-battery"></span>\n'
        '        </span>\n'
        '      </div>\n' % (s, s)
    )

ISLAND = '      <div class="island"></div>\n'

def home_indicator(ink=None):
    s = '' if ink is None else ' style="background:%s;opacity:.4"' % ink
    return '      <div class="home-indicator"%s></div>\n' % s

HAND = ('<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" '
        'stroke-linecap="round" stroke-linejoin="round">'
        '<path d="M9.1 11.4V4.7a1.3 1.3 0 0 1 2.6 0v5.5"/>'
        '<path d="M11.7 10.2V3.7a1.3 1.3 0 0 1 2.6 0v6.4"/>'
        '<path d="M14.3 10.1V5.6a1.3 1.3 0 0 1 2.6 0v7.7"/>'
        '<path d="M9.1 11.4V8.7a1.3 1.3 0 0 0-2.6 0v4.9c0 4 2.3 6.8 5.9 6.8 3.5 0 4.5-2.7 4.5-6.5"/>'
        '</g></svg>')

def dock(hint=None):
    h = '' if hint is None else '        <span class="companion-hint">%s</span>\n' % hint
    return ('      <div class="companion-dock">\n'
            '        <span class="orb"><span class="strata"><i></i><i></i><i></i></span></span>\n'
            '%s      </div>\n' % h)

# ---------------------------------------------------------------------------
# scoped CSS the kit does not carry.  {P} is replaced with the fragment root.
# ---------------------------------------------------------------------------

CSS_MOVED = """
/* WHAT MOVED — new block, lives inside DailyGreetingHeader's stack */
{P} .a-moved { padding:0 var(--pat-gutter-home); margin-top:4px; }
{P} .a-moved__label { display:block; font:400 10px/1.6 var(--pat-mono);
  text-transform:uppercase; letter-spacing:.5px; color:var(--pat-text-muted); }
{P} .a-moved__line { display:block; margin-top:5px; font:400 14px/1.45 var(--pat-sans);
  color:var(--pat-text-2); }
"""

CSS_NM_LABEL = """
{P} .a-nm__label { font:400 10px/1.6 var(--pat-mono); text-transform:uppercase;
  letter-spacing:.5px; color:var(--pat-text-muted); }
"""

CSS_NM_HERO = """
/* Next Move at hero weight — A's content-driven card weight */
{P} .a-nm--hero { padding:20px 14px 20px 20px; margin-top:24px; gap:14px; }
{P} .a-nm--hero .next-move__icon { width:48px; height:48px; align-self:flex-start;
  margin-top:4px; }
{P} .a-nm--hero .next-move__icon svg { width:22px; height:22px; }
{P} .a-nm--hero .next-move__title { font:400 30px/1.18 var(--pat-serif); }
{P} .a-nm--hero .next-move__detail { font:400 14px/1.45 var(--pat-sans);
  color:var(--pat-text-2); padding-top:2px; }
"""

CSS_STORY_ROW = """
/* DailyStoryCard as a 96pt row — A's compact variant */
{P} .a-story-row { position:relative; display:flex; align-items:center; gap:14px;
  height:96px; padding:12px; margin:16px var(--pat-gutter-home) 0;
  background:var(--pat-bg-2); border-radius:var(--pat-r-xl); }
{P} .a-story-row__art { width:72px; height:72px; flex:0 0 auto;
  border-radius:var(--pat-r-lg); }
{P} .a-story-row__copy { display:flex; flex-direction:column; gap:2px;
  flex:1 1 auto; min-width:0; }
{P} .a-story-row__tag { font:400 9px/1.4 var(--pat-mono); text-transform:uppercase;
  letter-spacing:.6px; color:var(--pat-text-link); }
{P} .a-story-row__title { font:400 18px/1.24 var(--pat-serif); color:var(--pat-text); }
{P} .a-story-row__meta { font:400 9px/1.5 var(--pat-mono); text-transform:uppercase;
  letter-spacing:.4px; color:var(--pat-text-muted); }
{P} .a-story-row__dot { position:absolute; top:14px; right:14px; width:7px; height:7px;
  border-radius:50%; background:var(--pat-clay); }
"""

CSS_FILL = """
/* the room's fill line — spend beside the quiz's own band label */
{P} .a-fill { font:400 10px/1.6 var(--pat-mono); text-transform:uppercase;
  letter-spacing:.5px; color:var(--pat-text-2); }
"""

CSS_MINDOCK = """
/* the Hearth in .minimal mode — bottom-trailing, no hint
   (CompanionOverlay.swift:386-391), which is what pushed screens show */
{P} .a-dock--min { position:absolute; right:20px; z-index:30; }
"""

CSS_ACTBAR = """
/* A's act bar: one primary verb, one caption, one ghost — replaces the shipped
   single-CTA .detail-bar */
{P} .a-actbar { position:absolute; left:0; right:0; bottom:0; z-index:20;
  display:flex; flex-direction:column; align-items:stretch; gap:8px;
  padding:16px 24px 30px; border-top:.5px solid var(--pat-pearl);
  background:rgba(250,247,242,.86);
  backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); }
{P} [data-scheme="dark"] .a-actbar { background:rgba(33,30,27,.86); }
{P} .a-actbar__note { text-align:center; font:400 12px/1.4 var(--pat-sans);
  color:var(--pat-text-muted); }
{P} .a-actbar__ghost { align-self:center; }
"""

CSS_FACTS = """
/* the three lines under the price — each omitted entirely when null */
{P} .a-facts { display:flex; flex-direction:column; gap:4px; padding-bottom:12px; }
{P} .detail-body { padding-top:20px; }
{P} .detail-materials { padding-bottom:12px; }
{P} .detail-price-row { padding-bottom:10px; }
{P} .a-facts__line { font:400 14px/1.45 var(--pat-sans); color:var(--pat-text-2); }
{P} .a-desc { font:400 14px/1.6 var(--pat-sans); color:var(--pat-text-2); }
"""

CSS_STATS = """
/* the room's stat tiles — two, not three (SP-18 takes IN AR and bare MATCH down) */
{P} .a-stats { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
{P} .a-stat { background:var(--pat-bg-2); border-radius:var(--pat-r-xl);
  padding:11px 12px; display:flex; flex-direction:column; align-items:center; gap:3px; }
{P} .a-stat__val { font:400 22px/1.2 var(--pat-serif); color:var(--pat-text); }
{P} .a-stat__key { font:400 10px/1.4 var(--pat-mono); text-transform:uppercase;
  letter-spacing:.5px; color:var(--pat-text-muted); }
"""

CSS_ITEMS = """
/* the room's item rows — thumbnail, name, maker, price, and the save date */
{P} .a-item { display:flex; align-items:center; gap:12px; padding:2px 0; }
{P} .a-item + .a-item { border-top:1px solid var(--pat-pearl); }
{P} .a-item__thumb { width:64px; height:64px; flex:0 0 auto; overflow:hidden;
  border-radius:var(--pat-r-md); position:relative; }
{P} .a-item__copy { display:flex; flex-direction:column; gap:2px; flex:1 1 auto; min-width:0; }
{P} .a-item__name { font:500 13px/1.35 var(--pat-sans); color:var(--pat-text); }
{P} .a-item__maker { font:400 9px/1.5 var(--pat-mono); text-transform:uppercase;
  letter-spacing:.4px; color:var(--pat-text-muted); }
{P} .a-item__right { margin-left:auto; display:flex; flex-direction:column;
  align-items:flex-end; gap:2px; }
{P} .a-item__price { font:500 18px/1.28 var(--pat-serif); color:var(--pat-text); }
{P} .a-item__saved { font:400 9px/1.5 var(--pat-mono); text-transform:uppercase;
  letter-spacing:.4px; color:var(--pat-text-muted); }
"""

CSS_MONEY = """
/* the order sheet's money block — label left, figure right, pearl hairlines */
{P} .a-money { border-top:1px solid var(--pat-pearl); }
{P} .a-money__row { display:flex; align-items:baseline; justify-content:space-between;
  gap:16px; padding:9px 0; border-bottom:1px solid var(--pat-pearl); }
{P} .a-money__k { font:400 14px/1.45 var(--pat-sans); color:var(--pat-text-2); }
{P} .a-money__v { font:400 14px/1.45 var(--pat-sans); color:var(--pat-text); }
{P} .a-money__row--total { border-bottom:0; padding-top:12px; }
{P} .a-money__row--total .a-money__k,
{P} .a-money__row--total .a-money__v { font-weight:600; color:var(--pat-text); }
{P} .a-note { font:400 14px/1.45 var(--pat-sans); color:var(--pat-text-2); }
{P} .a-thumb56 { width:56px; height:56px; border-radius:var(--pat-r-md);
  overflow:hidden; flex:0 0 auto; }
{P} .a-thumb56 img { width:100%; height:100%; object-fit:cover; display:block; }
"""

# Safari / Stripe / client-portal chrome is Apple's and Stripe's, not Patina's:
# system metrics and system colours on purpose, exactly as kit.css §14 draws the
# iOS system set.
CSS_SAFARI = """
{P} .a-safari { position:absolute; inset:0; display:flex; flex-direction:column;
  background:#FFFFFF; font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; }
{P} .a-safari__bar { padding:calc(var(--pat-safe-top) + 4px) 16px 10px;
  background:#F2F2F7; border-bottom:.5px solid rgba(60,60,67,.22);
  display:flex; align-items:center; gap:12px; flex:0 0 auto; }
{P} .a-safari__done { font:400 17px/1 -apple-system,sans-serif; color:#007AFF; flex:0 0 auto; }
{P} .a-safari__url { flex:1 1 auto; height:34px; border-radius:9px; background:#E4E4E9;
  display:flex; align-items:center; justify-content:center; gap:5px;
  font:400 14px/1 -apple-system,sans-serif; color:#3C3C43; }
{P} .a-safari__url svg { width:11px; height:11px; }
{P} .a-safari__page { flex:1 1 auto; overflow:hidden; padding:26px 22px; color:#1A1A1A; }
{P} .a-safari__foot { flex:0 0 auto; height:76px; padding-bottom:22px;
  border-top:.5px solid rgba(60,60,67,.22); background:#F2F2F7;
  display:flex; align-items:center; justify-content:space-around; color:#007AFF; }
{P} .a-safari__foot svg { width:19px; height:19px; }
{P} .a-safari__foot .is-off { color:rgba(60,60,67,.3); }
{P} .a-co__merch { font:400 13px/1.3 -apple-system,sans-serif; color:#6A6A72; }
{P} .a-co__amt { font:600 32px/1.2 -apple-system,sans-serif; color:#1A1A1A; margin-top:2px; }
{P} .a-co__line { display:flex; justify-content:space-between; gap:12px;
  font:400 13px/1.5 -apple-system,sans-serif; color:#4A4A52; padding:5px 0; }
{P} .a-co__rule { height:1px; background:#E6E6EA; margin:10px 0 18px; }
{P} .a-co__apay { height:46px; border-radius:8px; background:#000; color:#fff;
  display:flex; align-items:center; justify-content:center; gap:6px;
  font:500 17px/1 -apple-system,sans-serif; }
{P} .a-co__or { display:flex; align-items:center; gap:10px; margin:16px 0;
  font:400 12px/1 -apple-system,sans-serif; color:#8A8A92; }
{P} .a-co__or::before, {P} .a-co__or::after { content:''; height:1px; flex:1 1 auto; background:#E6E6EA; }
{P} .a-co__label { font:500 12px/1.4 -apple-system,sans-serif; color:#4A4A52; margin-bottom:4px; }
{P} .a-co__field { height:40px; border:1px solid #DCDCE2; border-radius:6px;
  background:#fff; padding:0 11px; display:flex; align-items:center;
  font:400 14px/1 -apple-system,sans-serif; color:#9A9AA2; margin-bottom:11px;
  box-shadow:0 1px 1px rgba(0,0,0,.03); }
{P} .a-co__pair { display:flex; gap:11px; }
{P} .a-co__pair > * { flex:1 1 0; }
{P} .a-co__pay { height:46px; border-radius:6px; background:#4A4A52; color:#fff;
  display:flex; align-items:center; justify-content:center;
  font:600 15px/1 -apple-system,sans-serif; margin-top:5px; }
"""

CSS_SUCCESS = """
{P} .a-ok { display:flex; flex-direction:column; gap:14px; padding-top:26px; }
{P} .a-ok__mark { width:44px; height:44px; border-radius:50%;
  background:rgba(122,155,118,.14); color:var(--pat-success);
  display:flex; align-items:center; justify-content:center; }
{P} .a-ok__mark svg { width:24px; height:24px; }
"""

CSS_LSWIDGET = """
/* Lock Screen accessoryRectangular widget — Apple's metrics, Patina's copy */
{P} .a-lsw { width:172px; padding:9px 11px; border-radius:14px;
  background:rgba(255,255,255,.16); color:#fff;
  display:flex; flex-direction:column; gap:3px; }
{P} .a-lsw__head { display:flex; align-items:center; gap:5px; }
{P} .a-lsw__mark { width:13px; height:13px; border-radius:3px; background:rgba(255,255,255,.9);
  display:flex; align-items:center; justify-content:center; }
{P} .a-lsw__mark .strata i { height:1px; background:var(--pat-charcoal); }
{P} .a-lsw__mark .strata i:nth-child(1){width:7px;}
{P} .a-lsw__mark .strata i:nth-child(2){width:5.5px;}
{P} .a-lsw__mark .strata i:nth-child(3){width:4px;}
{P} .a-lsw__label { font:400 9px/1.4 var(--pat-mono); text-transform:uppercase;
  letter-spacing:.4px; opacity:.7; }
{P} .a-lsw__title { font:600 15px/1.22 var(--pat-sans); }
{P} .a-lsw__meta { font:400 12px/1.3 var(--pat-sans); opacity:.72; }
"""

CSS_DHEAD = """
/* the Companion panel's new header — the designer, named */
{P} .a-dhead { display:flex; align-items:center; gap:12px; }
{P} .a-dhead__mono { width:44px; height:44px; border-radius:50%; flex:0 0 auto;
  background:var(--pat-g-earth); display:flex; align-items:center; justify-content:center;
  font:500 17px/1 var(--pat-serif); color:var(--pat-off-white); }
{P} .a-dhead__copy { display:flex; flex-direction:column; gap:3px; min-width:0; }
{P} .a-dhead__name { font:500 18px/1.28 var(--pat-serif); color:var(--pat-off-white); }
{P} .a-dhead__meta { font:400 9px/1.5 var(--pat-mono); text-transform:uppercase;
  letter-spacing:.4px; color:var(--pat-clay); }
{P} .a-count { min-width:22px; height:22px; padding:0 8px; border-radius:var(--pat-r-full);
  background:var(--pat-clay); color:var(--pat-off-white);
  font:600 12px/22px var(--pat-sans); text-align:center; flex:0 0 auto; }
"""

CSS_PERM = """
{P} .a-mark { display:flex; }
{P} .a-mark .strata { align-items:flex-start; }
{P} .a-mark .strata i { height:3px; border-radius:2px; background:var(--pat-clay); }
{P} .a-mark .strata i:nth-child(1){width:32px; opacity:1;}
{P} .a-mark .strata i:nth-child(2){width:24px; opacity:.7;}
{P} .a-mark .strata i:nth-child(3){width:16px; opacity:.5;}
{P} .a-perm__row { display:flex; align-items:center; gap:10px;
  font:400 10px/1.6 var(--pat-mono); text-transform:uppercase; letter-spacing:.5px;
  color:var(--pat-text-2); }
{P} .a-perm__dot { width:6px; height:6px; border-radius:50%; flex:0 0 auto;
  background:var(--pat-clay); }
"""

CSS_INSET = """
/* deck furniture, not app UI: the variant inset the manifest calls for */
{P} .a-inset { width:402px; margin:14px 0 0 13px; padding:12px 14px;
  border:1px solid var(--pat-pearl); border-radius:var(--pat-r-lg);
  background:var(--pat-bg); }
{P} .a-inset__label { display:block; font:600 12px/1.3 var(--pat-sans);
  text-transform:uppercase; letter-spacing:1.5px; color:var(--pat-text-muted);
  padding-bottom:5px; }
{P} .a-inset__line { display:block; font:400 14px/1.45 var(--pat-sans); color:var(--pat-text); }
"""


def css(root, *blocks):
    sel = root if root.startswith(".") else "." + root
    body = "".join(b.replace("{P}", sel) for b in blocks)
    return "<style>%s</style>\n" % body


def write(name, html):
    path = os.path.join(HERE, name)
    with open(path, "w") as fh:
        fh.write(html)
    print("wrote", name, len(html))


def wrap(root, scheme, screen, callouts="", after="", battery=True, styles=""):
    bat = ' data-battery="charging"' if battery else ""
    return (
        '<div class="frame-wrap %s">\n'
        '  <div class="frame" data-scheme="%s"%s>\n'
        '    <div class="frame__screen">\n'
        '%s'
        '    </div>\n'
        '  </div>\n'
        '%s'
        '%s'
        '</div>\n'
        '%s' % (root, scheme, bat, screen, callouts, after, styles)
    )


def co(n, css_pos, clay=False, ondark=False):
    cls = "callout-n"
    if clay:
        cls += " callout-n--clay"
    if ondark:
        cls += " callout-n--ondark"
    return '  <span class="%s" style="%s">%d</span>\n' % (cls, css_pos, n)


# ---------------------------------------------------------------------------
# shared screen pieces
# ---------------------------------------------------------------------------

def home_header(mono, dot=True):
    d = '<span class="icon-btn__dot"></span>' if dot else ''
    return (
        '        <div class="home-header">\n'
        '          <div class="home-header__stack">\n'
        '            <div class="home-header__date">Wednesday &middot; Aug 26</div>\n'
        '            <div class="home-header__titlerow">\n'
        '              <span class="home-header__title">Today</span>\n'
        '              <span class="home-header__title-help"><svg><use href="#i-qcircle"/></svg></span>\n'
        '            </div>\n'
        '          </div>\n'
        '          <div class="home-header__actions">\n'
        '            <span class="icon-btn"><svg><use href="#i-bell"/></svg>%s</span>\n'
        '            <span class="icon-btn"><svg><use href="#i-qcircle"/></svg></span>\n'
        '          </div>\n'
        '          <span class="monogram">%s</span>\n'
        '        </div>\n' % (d, mono)
    )


def moved(line):
    return ('        <div class="a-moved">\n'
            '          <span class="a-moved__label">What moved</span>\n'
            '          <span class="a-moved__line">%s</span>\n'
            '        </div>\n' % line)


def story_row(tag, title, meta, grad, dot=True):
    d = '          <span class="a-story-row__dot"></span>\n' if dot else ''
    return ('        <div class="a-story-row">\n'
            '          <span class="a-story-row__art %s"></span>\n'
            '          <span class="a-story-row__copy">\n'
            '            <span class="a-story-row__tag">%s</span>\n'
            '            <span class="a-story-row__title">%s</span>\n'
            '            <span class="a-story-row__meta">%s</span>\n'
            '          </span>\n'
            '%s'
            '        </div>\n' % (grad, tag, title, meta, d))


# ===========================================================================
# M1 / M6b — Today, activeProject (Ruth on client@patina.dev)
# ===========================================================================

M1_BODY = (
    '      <div class="screen-body">\n'
    + home_header('C')
    + moved('Leah moved Aspen Loft Refresh into Installation &amp; Styling on Monday. '
            'A proposal arrived Thursday.')
    + '        <div class="next-move a-nm--hero">\n'
      '          <span class="next-move__icon">' + HAND + '</span>\n'
      '          <span class="next-move__body">\n'
      '            <span class="a-nm__label">Next move</span>\n'
      '            <span class="next-move__title">Leah is waiting on two things</span>\n'
      '            <span class="next-move__detail">A rug colour since Aug 22 &middot; a proposal by '
      'Sep 8 &middot; your invoice is due Sep 1</span>\n'
      '          </span>\n'
      '          <span class="next-move__arrow"><svg><use href="#i-arrow-ur"/></svg></span>\n'
      '        </div>\n'
    + story_row('Maker Spotlight', 'The Grain Whisperer of Maine', '4 min read', 'g-hero')
    + '      </div>\n'
)

M1_SCREEN = (M1_BODY
             + dock('Leah Hartwell &middot; your designer')
             + statusbar() + ISLAND + home_indicator())

M1_CO = (co(1, "top:184px;left:2px")
         + co(2, "top:300px;left:2px", clay=True)
         + co(3, "top:430px;right:2px")
         + co(4, "top:534px;left:2px")
         + co(5, "top:640px;right:2px")
         + co(6, "top:756px;left:2px"))

M1_CSS = (CSS_MOVED, CSS_NM_LABEL, CSS_NM_HERO, CSS_STORY_ROW)

write("a-M1.html", wrap("a-m1", "light", M1_SCREEN, M1_CO, styles=css("a-m1", *M1_CSS)))

M1D_CO = (co(1, "top:184px;left:2px", ondark=True)
          + co(2, "top:300px;left:2px", clay=True, ondark=True)
          + co(3, "top:404px;right:2px", ondark=True)
          + co(6, "top:756px;left:2px", ondark=True))
write("a-M1-dark.html", wrap("a-m1d", "dark", M1_SCREEN, M1D_CO, styles=css("a-m1d", *M1_CSS)))

# ===========================================================================
# M2 — Today, discovering, one room (Maya)
# ===========================================================================

M2_SCREEN = (
    '      <div class="screen-body">\n'
    + home_header('M', dot=False)
    + moved('The jute rug has been in the Living Room since Sunday.')
    + '        <div class="next-move" style="margin-top:24px">\n'
      '          <span class="next-move__icon"><svg><use href="#i-sparkles"/></svg></span>\n'
      '          <span class="next-move__body">\n'
      '            <span class="a-nm__label">Next move</span>\n'
      '            <span class="next-move__title">Return to the Living Room</span>\n'
      '            <span class="next-move__detail">Three pieces are gathering there.</span>\n'
      '          </span>\n'
      '          <span class="next-move__arrow"><svg><use href="#i-arrow-ur"/></svg></span>\n'
      '        </div>\n'
    + story_row("Editor&rsquo;s Note", 'Patina: The slow shape of home', '3 min read', 'g-walnut')
    + '        <div class="room-card a-room--compact" style="margin-top:18px">\n'
      '          <div class="room-card__art g-warm"></div>\n'
      '          <div class="room-card__body">\n'
      '            <div class="room-card__copy">\n'
      '              <span class="mono-label">Active room</span>\n'
      '              <span class="room-card__name">Living Room</span>\n'
      '              <span class="room-card__meta">18 &times; 14 ft &middot; 3 pieces saved</span>\n'
      '              <span class="a-fill">$3,590 saved &middot; your range $5K+</span>\n'
      '            </div>\n'
      '            <span class="room-card__chev"><svg><use href="#i-chev-r"/></svg></span>\n'
      '          </div>\n'
      '        </div>\n'
      '      </div>\n'
    + dock('Living Room &middot; 3 saved')
    + statusbar() + ISLAND + home_indicator()
)

M2_CO = (co(1, "top:184px;left:2px")
         + co(2, "top:288px;left:2px")
         + co(3, "top:400px;left:2px")
         + co(4, "top:520px;right:2px")
         + co(5, "top:718px;left:2px", clay=True))

CSS_M2_ROOM = """
/* the quiet-day Active Room card: kit .room-card__art is 150; at 150 this
   composition's last 30pt sit under the hearth at 402x874 */
{P} .a-room--compact .room-card__art { height:118px; }
{P} .a-room--compact .room-card__copy { gap:4px; }
"""

write("a-M2.html", wrap("a-m2", "light", M2_SCREEN, M2_CO,
                        styles=css("a-m2", CSS_MOVED, CSS_NM_LABEL, CSS_STORY_ROW,
                                   CSS_FILL, CSS_M2_ROOM)))

# ===========================================================================
# M3 — Piece detail, Heirloom Oak Dining Table
# ===========================================================================

def m3_body(dark):
    return (
        '      <div class="screen-body">\n'
        '        <div class="detail-hero">\n'
        '          <img src="img/heirloom-oak-dining-table.jpg" alt="Heirloom Oak Dining Table">\n'
        '          <div class="detail-hero__bar">\n'
        '            <span class="circ-btn circ-btn--lg"><svg><use href="#i-chev-l"/></svg></span>\n'
        '            <span class="spacer"></span>\n'
        '            <span class="circ-btn circ-btn--lg"><svg><use href="#i-q"/></svg></span>\n'
        '            <span class="circ-btn circ-btn--lg"><svg><use href="#i-share"/></svg></span>\n'
        '            <span class="circ-btn circ-btn--lg"><svg><use href="#i-heart"/></svg></span>\n'
        '          </div>\n'
        '        </div>\n'
        '        <div class="detail-body">\n'
        '          <div class="detail-maker">Nordic Atelier &middot; Aarhus, Denmark</div>\n'
        '          <div class="detail-name">Heirloom Oak Dining Table</div>\n'
        '          <div class="detail-materials">Quarter-sawn white oak &middot; Hand-rubbed tung oil</div>\n'
        '          <div class="detail-price-row"><span class="detail-price">$4,200</span></div>\n'
        '          <div class="a-facts">\n'
        '            <span class="a-facts__line">38&Prime; W &times; 20&Prime; D &times; 30&Prime; H</span>\n'
        '            <span class="a-facts__line">38&Prime; wide &middot; your Living Room is 18 &times; 14 ft</span>\n'
        '            <span class="a-facts__line">Ships in 10&ndash;12 weeks</span>\n'
        '          </div>\n'
        '          <div class="a-desc">Solid quarter-sawn white oak with hand-rubbed tung oil finish. '
        'Each table is made to order by a three-person workshop outside Aarhus.</div>\n'
        '        </div>\n'
        '      </div>\n'
    )

def m3_bar(primary, ghost, note=None):
    n = '' if note is None else '        <span class="a-actbar__note">%s</span>\n' % note
    return ('      <div class="a-actbar">\n'
            '        <span class="btn btn--primary">%s</span>\n'
            '%s'
            '        <span class="btn btn--ghost btn--pill-sm a-actbar__ghost">%s</span>\n'
            '      </div>\n' % (primary, n, ghost))

M3_MIN_DOCK = ('      <div class="a-dock--min" style="bottom:151px">\n'
               '        <span class="orb"><span class="strata"><i></i><i></i><i></i></span></span>\n'
               '      </div>\n')

M3_SCREEN = (m3_body(False)
             + M3_MIN_DOCK
             + m3_bar('Buy it &middot; $4,200', 'Get design help with this room',
                      'Payment opens securely in Safari.')
             + statusbar('var(--pat-charcoal)') + ISLAND + home_indicator('var(--pat-charcoal)'))

M3_CO = (co(1, "top:78px;right:2px")
         + co(2, "top:400px;left:2px")
         + co(3, "top:470px;right:2px", clay=True)
         + co(4, "top:540px;left:2px")
         + co(5, "top:740px;right:2px")
         + co(6, "top:812px;left:2px"))

M3_CSS = (CSS_FACTS, CSS_ACTBAR, CSS_MINDOCK)
write("a-M3.html", wrap("a-m3", "light", M3_SCREEN, M3_CO, styles=css("a-m3", *M3_CSS)))

M3D_SCREEN = (m3_body(True)
              + ('      <div class="a-dock--min" style="bottom:126px">\n'
                 '        <span class="orb"><span class="strata"><i></i><i></i><i></i></span></span>\n'
                 '      </div>\n')
              + m3_bar('Ask Leah to source this', 'Save to the Living Room')
              + statusbar('var(--pat-charcoal)') + ISLAND + home_indicator())

M3D_CO = (co(2, "top:400px;left:2px", ondark=True)
          + co(3, "top:470px;right:2px", clay=True, ondark=True)
          + co(7, "top:756px;right:2px", ondark=True))
write("a-M3-dark.html", wrap("a-m3d", "dark", M3D_SCREEN, M3D_CO, styles=css("a-m3d", *M3_CSS)))

# ===========================================================================
# M4 — The room, Living Room
# ===========================================================================

def item(grad, name, maker, price, saved):
    return ('          <div class="a-item">\n'
            '            <span class="a-item__thumb tile-placeholder tile-placeholder--gradient %s"></span>\n'
            '            <span class="a-item__copy">\n'
            '              <span class="a-item__name">%s</span>\n'
            '              <span class="a-item__maker">%s</span>\n'
            '            </span>\n'
            '            <span class="a-item__right">\n'
            '              <span class="a-item__price">%s</span>\n'
            '              <span class="a-item__saved">%s</span>\n'
            '            </span>\n'
            '          </div>\n' % (grad, name, maker, price, saved))

M4_SCREEN = (
    '      <div class="screen-body">\n'
    '        <div class="a-roomhero g-warm"></div>\n'
    '        <div class="pad-push" style="padding-top:12px">\n'
    '          <div class="t-h1">Living Room</div>\n'
    '          <div class="mono-label" style="display:block;margin-top:2px">18 &times; 14 ft &middot; '
    'North-facing &middot; 2 windows &middot; Entered Aug 24</div>\n'
    '          <div class="a-stats" style="margin-top:14px">\n'
    '            <span class="a-stat"><span class="a-stat__val">3</span>'
    '<span class="a-stat__key">Items</span></span>\n'
    '            <span class="a-stat"><span class="a-stat__val">$3,590</span>'
    '<span class="a-stat__key">Saved</span></span>\n'
    '          </div>\n'
    '          <div class="a-fill" style="margin-top:10px">Your range &middot; $5K+ &middot; '
    'from your quiz answer</div>\n'
    '          <div class="mono-label" style="display:block;margin-top:16px">Your items</div>\n'
    '          <div style="margin-top:6px">\n'
    + item('g-leather', 'Velvet Club Chair', 'Article', '$1,250', 'Saved Aug 24')
    + item('g-metal', 'Brass Arc Floor Lamp', 'Schoolhouse', '$890', 'Saved Aug 22')
    + item('g-linen', 'Woven Jute Area Rug 8x10', 'Studio Piet', '$1,450', 'Saved Sunday')
    + '          </div>\n'
      '          <div style="margin-top:14px"><span class="btn btn--primary">'
      'Browse pieces for the Living Room</span></div>\n'
      '        </div>\n'
      '      </div>\n'
    + '      <div class="screen-chrome">\n'
      '        <span class="back-chevron"><svg><use href="#i-chev-l"/></svg></span>\n'
      '      </div>\n'
      '      <span class="circ-btn circ-btn--lg a-gear"><svg><use href="#i-gear"/></svg></span>\n'
    + dock('Living Room &middot; 3 saved')
    + statusbar() + ISLAND + home_indicator()
)

CSS_M4 = """
{P} .a-roomhero { height:240px; }
{P} .a-gear { position:absolute; top:calc(var(--pat-safe-top) + 11px); right:18px; z-index:20; }
"""

M4_CO = (co(1, "top:268px;left:2px")
         + co(2, "top:330px;right:2px", clay=True)
         + co(3, "top:400px;left:2px")
         + co(4, "top:452px;right:2px")
         + co(5, "top:530px;right:2px")
         + co(6, "top:672px;left:2px"))

write("a-M4.html", wrap("a-m4", "light", M4_SCREEN, M4_CO,
                        styles=css("a-m4", CSS_STATS, CSS_ITEMS, CSS_FILL, CSS_M4)))

# ===========================================================================
# M5a — the order sheet
# ===========================================================================

M5A_BEHIND = (
    '      <div class="screen-body">\n'
    '        <div class="detail-hero">\n'
    '          <img src="img/heirloom-oak-dining-table.jpg" alt="Heirloom Oak Dining Table">\n'
    '          <div class="detail-hero__bar">\n'
    '            <span class="circ-btn circ-btn--lg"><svg><use href="#i-chev-l"/></svg></span>\n'
    '            <span class="spacer"></span>\n'
    '            <span class="circ-btn circ-btn--lg"><svg><use href="#i-q"/></svg></span>\n'
    '            <span class="circ-btn circ-btn--lg"><svg><use href="#i-share"/></svg></span>\n'
    '            <span class="circ-btn circ-btn--lg"><svg><use href="#i-heart"/></svg></span>\n'
    '          </div>\n'
    '        </div>\n'
    '        <div class="detail-body">\n'
    '          <div class="detail-maker">Nordic Atelier &middot; Aarhus, Denmark</div>\n'
    '          <div class="detail-name">Heirloom Oak Dining Table</div>\n'
    '        </div>\n'
    '      </div>\n'
)

def money(k, v, total=False):
    cls = ' a-money__row--total' if total else ''
    return ('            <div class="a-money__row%s"><span class="a-money__k">%s</span>'
            '<span class="a-money__v">%s</span></div>\n' % (cls, k, v))

M5A_SHEET = (
    '      <div class="sheet-scrim"></div>\n'
    '      <div class="sheet a-sheet--order">\n'
    '        <span class="sheet__handle"></span>\n'
    '        <div class="sheet__head">\n'
    '          <span class="sheet__title">Heirloom Oak Dining Table</span>\n'
    '          <span class="sheet__eyebrow">Nordic Atelier &middot; Made to order</span>\n'
    '        </div>\n'
    '        <div class="sheet__body">\n'
    '          <div class="row" style="gap:14px">\n'
    '            <span class="a-thumb56"><img src="img/heirloom-oak-dining-table.jpg" alt=""></span>\n'
    '            <span class="a-note">Quarter-sawn white oak</span>\n'
    '          </div>\n'
    '          <div class="a-money" style="margin-top:8px">\n'
    + money('Piece', '$4,200.00')
    + money('White-glove delivery', '$350.00')
    + money('Sales tax', 'added at checkout')
    + money('Total', '$4,550.00 plus tax', total=True)
    + '          </div>\n'
      '          <div class="stack" style="gap:6px;margin-top:12px">\n'
      '            <span class="a-note">38&Prime; wide &middot; your Living Room is 18 &times; 14 ft</span>\n'
      '            <span class="a-note">Ships in 10&ndash;12 weeks.</span>\n'
      '            <span class="a-note">If it arrives damaged, Patina handles the claim with '
      'Nordic Atelier &mdash; one number, in your receipt.</span>\n'
      '          </div>\n'
      '        </div>\n'
      '        <div class="sheet__foot">\n'
      '          <span class="btn btn--primary">Continue to payment</span>\n'
      '          <span class="a-actbar__note" style="display:block;margin-top:8px">Payment opens '
      'securely in Safari. Apple Pay works there if it&rsquo;s set up on this iPhone.</span>\n'
      '          <span style="display:flex;justify-content:center;margin-top:6px">'
      '<span class="btn btn--ghost btn--pill-sm">Get design help with this room</span></span>\n'
      '        </div>\n'
      '      </div>\n'
)

CSS_M5A = """
{P} .a-sheet--order { height:648px; }
{P} .a-sheet--order .sheet__foot { padding:14px 24px 30px; }
"""

M5A_INSET = ('  <div class="a-inset">\n'
             '    <span class="a-inset__label">Inset &middot; the credited variant</span>\n'
             '    <span class="a-inset__line">Credited to Leah Hartwell.</span>\n'
             '    <span class="a-inset__line" style="color:var(--pat-text-muted);font-size:12px;'
             'margin-top:4px">Prints on this sheet only in the roster case &mdash; a designer sent '
             'him here and is credited without being engaged.</span>\n'
             '  </div>\n')

M5A_CO = (co(1, "top:268px;left:2px")
          + co(2, "top:398px;right:2px", clay=True)
          + co(3, "top:470px;left:2px")
          + co(4, "top:560px;right:2px")
          + co(5, "top:712px;left:2px"))

write("a-M5a.html", wrap("a-m5a", "light", M5A_BEHIND + M5A_SHEET
                         + statusbar('var(--pat-charcoal)') + ISLAND + home_indicator(),
                         M5A_CO, after=M5A_INSET,
                         styles=css("a-m5a", CSS_MONEY, CSS_ACTBAR, CSS_INSET, CSS_M5A)))

# ===========================================================================
# M5b — the payment hand-off (SFSafariViewController over the sheet)
# ===========================================================================

SAFARI_FOOT = (
    '          <div class="a-safari__foot">\n'
    '            <span><svg><use href="#i-chev-l"/></svg></span>\n'
    '            <span class="is-off"><svg><use href="#i-chev-r"/></svg></span>\n'
    '            <span><svg><use href="#i-share"/></svg></span>\n'
    '            <span><svg><use href="#i-stack"/></svg></span>\n'
    '          </div>\n'
)

LOCK_GLYPH = '<svg><use href="#i-lock"/></svg>'

def safari(url, page, done="Done"):
    return (
        '      <div class="a-safari">\n'
        '        <div class="a-safari__bar">\n'
        '          <span class="a-safari__done">%s</span>\n'
        '          <span class="a-safari__url">%s%s</span>\n'
        '        </div>\n'
        '        <div class="a-safari__page">\n'
        '%s'
        '        </div>\n'
        '%s'
        '      </div>\n' % (done, LOCK_GLYPH, url, page, SAFARI_FOOT)
    )

CHECKOUT = (
    '          <div class="a-co__merch">Patina</div>\n'
    '          <div class="a-co__amt">$4,550.00</div>\n'
    '          <div style="margin-top:14px">\n'
    '            <div class="a-co__line"><span>Heirloom Oak Dining Table &times; 1</span>'
    '<span>$4,200.00</span></div>\n'
    '            <div class="a-co__line"><span>White-glove delivery</span><span>$350.00</span></div>\n'
    '            <div class="a-co__line"><span>Sales tax</span><span>Enter address</span></div>\n'
    '          </div>\n'
    '          <div class="a-co__rule"></div>\n'
    '          <div class="a-co__apay">Apple Pay</div>\n'
    '          <div class="a-co__or">Or pay with card</div>\n'
    '          <div class="a-co__label">Email</div>\n'
    '          <div class="a-co__field">walt@&hellip;</div>\n'
    '          <div class="a-co__label">Card information</div>\n'
    '          <div class="a-co__field">1234 1234 1234 1234</div>\n'
    '          <div class="a-co__pair">\n'
    '            <div class="a-co__field">MM / YY</div>\n'
    '            <div class="a-co__field">CVC</div>\n'
    '          </div>\n'
    '          <div class="a-co__pay">Pay $4,550.00</div>\n'
)

M5B_CO = (co(1, "top:78px;left:2px")
          + co(2, "top:250px;right:2px", clay=True)
          + co(3, "top:420px;left:2px")
          + co(4, "top:790px;right:2px"))

write("a-M5b.html", wrap("a-m5b", "light",
                         safari('checkout.stripe.com', CHECKOUT)
                         + statusbar() + ISLAND + home_indicator(),
                         M5B_CO, styles=css("a-m5b", CSS_SAFARI)))

# --- the Safari success page: successUrl points at the client portal today ---

SUCCESS_PAGE = (
    '          <div class="a-ok">\n'
    '            <span class="a-ok__mark"><svg><use href="#i-check-fill"/></svg></span>\n'
    '            <span class="t-h2" style="color:var(--pat-text)">Payment received</span>\n'
    '            <span class="t-body" style="color:var(--pat-text-2)">$4,550.00 &middot; '
    'Heirloom Oak Dining Table</span>\n'
    '            <span class="t-body-sm" style="color:var(--pat-text-muted)">Your receipt is on its '
    'way by email. You can close this window.</span>\n'
    '          </div>\n'
)

M5BS_CO = (co(5, "top:78px;left:2px", clay=True)
           + co(6, "top:300px;right:2px"))

CSS_M5BS = """
{P} .a-safari__page { background:var(--pat-bg); }
{P} .a-wordmark { display:block; font:500 20px/1 var(--pat-serif); letter-spacing:4px;
  color:var(--pat-text); text-transform:uppercase; }
"""

write("a-M5b-success.html", wrap("a-m5bs", "light",
                                 safari('client.patina.cloud',
                                        '          <span class="a-wordmark">Patina</span>\n'
                                        + SUCCESS_PAGE)
                                 + statusbar() + ISLAND + home_indicator(),
                                 M5BS_CO,
                                 styles=css("a-m5bs", CSS_SAFARI, CSS_SUCCESS, CSS_M5BS)))

# ===========================================================================
# M5c — order placed
# ===========================================================================

M5C_SCREEN = (
    '      <div class="screen-body">\n'
    '        <div class="screen-head">\n'
    '          <span class="mono-label" style="display:block">Ordered &middot; Aug 26</span>\n'
    '          <div class="t-h2" style="margin-top:8px">Heirloom Oak Dining Table</div>\n'
    '          <div class="t-body-sm" style="color:var(--pat-text-muted);margin-top:4px">'
    'Nordic Atelier &middot; Aarhus</div>\n'
    '          <div style="margin-top:14px"><span class="status-badge status-badge--success">'
    '<svg><use href="#i-check-fill"/></svg>Paid</span></div>\n'
    '        </div>\n'
    '        <div class="pad-push" style="padding-top:8px">\n'
    '          <div class="a-money">\n'
    + money('Paid', '$4,550.00')
    + money('Receipt', 'Emailed to walt@&hellip;')
    + '          </div>\n'
      '          <div class="a-note" style="margin-top:16px">Nordic Atelier starts it this week. '
      'We&rsquo;ll email you when it ships.</div>\n'
      '        </div>\n'
      '      </div>\n'
    + '      <div class="a-acts-foot">\n'
      '        <span class="btn btn--primary">Back to Today</span>\n'
      '        <span style="display:flex;justify-content:center;margin-top:6px">'
      '<span class="btn btn--ghost btn--pill-sm">Your orders</span></span>\n'
      '      </div>\n'
      '      <div class="a-dock--min" style="bottom:161px">\n'
      '        <span class="orb"><span class="strata"><i></i><i></i><i></i></span></span>\n'
      '      </div>\n'
    + statusbar() + ISLAND + home_indicator()
)

M5C_INSET = ('  <div class="a-inset">\n'
             '    <span class="a-inset__label">Inset &middot; the credited variant</span>\n'
             '    <span class="a-inset__line">Leah Hartwell is credited on this order.</span>\n'
             '  </div>\n')

CSS_M5C = """
{P} .a-acts-foot { position:absolute; left:0; right:0; bottom:0; z-index:20;
  padding:0 24px calc(var(--pat-safe-bottom) + 24px); }
"""

M5C_CO = (co(6, "top:170px;left:2px")
          + co(7, "top:250px;right:2px", clay=True)
          + co(8, "top:378px;left:2px")
          + co(9, "top:754px;right:2px"))

write("a-M5c.html", wrap("a-m5c", "light", M5C_SCREEN, M5C_CO, after=M5C_INSET,
                         styles=css("a-m5c", CSS_MONEY, CSS_INSET, CSS_MINDOCK, CSS_M5C)))

# ===========================================================================
# M6a — the Lock Screen
# ===========================================================================

M6A_SCREEN = (
    '      <div class="lockscreen">\n'
    '        <div class="lockscreen__clock">\n'
    '          <div class="lockscreen__date">Wednesday, August 26</div>\n'
    '          <div class="lockscreen__time">9:41</div>\n'
    '        </div>\n'
    '        <div style="margin-top:18px">\n'
    '          <div class="a-lsw">\n'
    '            <span class="a-lsw__head">\n'
    '              <span class="a-lsw__mark"><span class="strata"><i></i><i></i><i></i></span></span>\n'
    '              <span class="a-lsw__label">Patina</span>\n'
    '            </span>\n'
    '            <span class="a-lsw__title">Leah sent a proposal</span>\n'
    '            <span class="a-lsw__meta">Tuesday</span>\n'
    '          </div>\n'
    '        </div>\n'
    '        <div style="margin-top:auto;margin-bottom:104px">\n'
    '          <div class="push-banner">\n'
    '            <span class="push-banner__icon"><span class="strata"><i></i><i></i><i></i></span></span>\n'
    '            <span class="push-banner__copy">\n'
    '              <span class="push-banner__app">Patina</span>\n'
    '              <span class="push-banner__title" style="display:block">Leah sent a proposal</span>\n'
    '              <span class="push-banner__body" style="display:block">Aspen Loft Refresh &mdash; '
    'read it by Sep 8.</span>\n'
    '            </span>\n'
    '            <span class="push-banner__time">now</span>\n'
    '          </div>\n'
    '        </div>\n'
    '      </div>\n'
    + statusbar('#fff') + ISLAND + home_indicator('#fff')
)

M6A_CO = (co(1, "top:270px;left:2px", ondark=True)
          + co(2, "top:706px;left:2px", clay=True, ondark=True)
          + co(3, "top:766px;right:2px", ondark=True))

write("a-M6a.html", wrap("a-m6a", "dark", M6A_SCREEN, M6A_CO,
                         styles=css("a-m6a", CSS_LSWIDGET)))

# --- M6b: the Today the push opens — M1's screen, the same sentence ---

M6B_CO = (co(4, "top:184px;left:2px", clay=True)
          + co(5, "top:300px;left:2px")
          + co(6, "top:756px;right:2px"))
write("a-M6b.html", wrap("a-m6b", "light", M1_SCREEN, M6B_CO, styles=css("a-m6b", *M1_CSS)))

# ===========================================================================
# M7 — the Companion, expanded, headed by the designer
# ===========================================================================

def crow(icon, title, meta, suggested=False, count=None):
    cls = "companion-row companion-row--suggested" if suggested else "companion-row"
    c = '' if count is None else '            <span class="a-count">%s</span>\n' % count
    return ('          <div class="%s">\n'
            '            <span class="companion-row__icon"><svg><use href="#%s"/></svg></span>\n'
            '            <span class="companion-row__copy">\n'
            '              <span class="companion-row__title">%s</span>\n'
            '              <span class="companion-row__meta">%s</span>\n'
            '            </span>\n'
            '%s'
            '            <span class="companion-row__chev"><svg><use href="#i-chev-r"/></svg></span>\n'
            '          </div>\n' % (cls, icon, title, meta, c))

M7_SCREEN = (
    '      <div class="screen-body">\n'
    + home_header('C')
    + moved('Leah moved Aspen Loft Refresh into Installation &amp; Styling on Monday. '
            'A proposal arrived Thursday.')
    + '        <div class="next-move a-nm--hero">\n'
      '          <span class="next-move__icon">' + HAND + '</span>\n'
      '          <span class="next-move__body">\n'
      '            <span class="a-nm__label">Next move</span>\n'
      '            <span class="next-move__title">Leah is waiting on two things</span>\n'
      '            <span class="next-move__detail">A rug colour since Aug 22 &middot; a proposal by '
      'Sep 8 &middot; your invoice is due Sep 1</span>\n'
      '          </span>\n'
      '          <span class="next-move__arrow"><svg><use href="#i-arrow-ur"/></svg></span>\n'
      '        </div>\n'
      '      </div>\n'
    '      <div class="sheet-scrim"></div>\n'
    '      <div class="a-panel-dock">\n'
    '        <div class="companion-panel">\n'
    '          <div class="companion-panel__head">\n'
    '            <span class="a-dhead">\n'
    '              <span class="a-dhead__mono">L</span>\n'
    '              <span class="a-dhead__copy">\n'
    '                <span class="a-dhead__name">Leah Hartwell</span>\n'
    '                <span class="a-dhead__meta">Your designer &middot; Hartwell &amp; Co &middot; NCIDQ</span>\n'
    '              </span>\n'
    '            </span>\n'
    '            <span style="flex:1 1 auto"></span>\n'
    '            <span class="companion-panel__btn"><svg><use href="#i-x"/></svg></span>\n'
    '          </div>\n'
    '          <div class="companion-panel__rows">\n'
    + crow('i-doc', 'What&rsquo;s waiting', 'Rug colour, proposal, invoice',
           suggested=True, count='3')
    + crow('i-message', 'Message Leah', 'Start the conversation')
    + crow('i-stack', 'Your Studio', 'Projects &middot; proposals &middot; decisions')
    + crow('i-heart', 'Saved', '3 saved pieces')
    + crow('i-person-plus', 'Your profile', 'Style &middot; settings &middot; portal')
    + '          </div>\n'
      '        </div>\n'
      '      </div>\n'
    + statusbar() + ISLAND + home_indicator()
)

CSS_M7 = """
{P} .a-panel-dock { position:absolute; left:0; right:0; bottom:0; z-index:30;
  padding:0 24px calc(var(--pat-safe-bottom) + 24px); display:flex; }
{P} .a-panel-dock .companion-panel { max-width:none; }
"""

M7_CO = (co(1, "top:404px;left:2px", clay=True, ondark=True)
         + co(2, "top:490px;left:2px", ondark=True)
         + co(3, "top:490px;right:2px", ondark=True)
         + co(4, "top:640px;left:2px", ondark=True))

write("a-M7.html", wrap("a-m7", "light", M7_SCREEN, M7_CO,
                        styles=css("a-m7", CSS_MOVED, CSS_NM_LABEL, CSS_NM_HERO,
                                   CSS_DHEAD, CSS_M7)))

# ===========================================================================
# M8 — the permission moment
# ===========================================================================

M8_SCREEN = (
    '      <div class="screen-body">\n'
    '        <div class="pad-push" style="padding-top:calc(var(--pat-safe-top) + 132px)">\n'
    '          <span class="a-mark" style="display:block"><span class="strata">'
    '<i></i><i></i><i></i></span></span>\n'
    '          <div class="t-h2" style="margin-top:28px">Only when something needs you.</div>\n'
    '          <div class="t-body-lg" style="color:var(--pat-text-2);margin-top:14px">We&rsquo;ll tell '
    'you when your designer sends something that needs you &mdash; a decision, a proposal, or an '
    'invoice. Nothing else.</div>\n'
    '          <div class="stack" style="gap:12px;margin-top:30px">\n'
    '            <span class="a-perm__row"><span class="a-perm__dot"></span>A decision to make</span>\n'
    '            <span class="a-perm__row"><span class="a-perm__dot"></span>A proposal to read</span>\n'
    '            <span class="a-perm__row"><span class="a-perm__dot"></span>An invoice coming due</span>\n'
    '          </div>\n'
    '        </div>\n'
    '      </div>\n'
    '      <div class="a-perm__foot">\n'
    '        <span class="btn btn--primary">Turn on notifications</span>\n'
    '        <span style="display:flex;justify-content:center;margin-top:6px">'
    '<span class="btn btn--ghost btn--pill-sm">Not now</span></span>\n'
    '      </div>\n'
    + statusbar() + ISLAND + home_indicator()
)

CSS_M8 = """
{P} .a-perm__foot { position:absolute; left:0; right:0; bottom:0; z-index:20;
  padding:0 24px calc(var(--pat-safe-bottom) + 24px); }
"""

M8_CO = (co(1, "top:216px;left:2px")
         + co(2, "top:290px;right:2px", clay=True)
         + co(3, "top:470px;left:2px")
         + co(4, "top:740px;right:2px"))

write("a-M8.html", wrap("a-m8", "light", M8_SCREEN, M8_CO,
                        styles=css("a-m8", CSS_PERM, CSS_M8)))

# ===========================================================================
# M9 — Today, engaged (James)
# ===========================================================================

M9_SCREEN = (
    '      <div class="screen-body">\n'
    + home_header('J', dot=False)
    + moved('Leah Hartwell picked up your request on the 18th.')
    + '        <div class="next-move" style="margin-top:24px">\n'
      '          <span class="next-move__icon"><svg><use href="#i-person-plus"/></svg></span>\n'
      '          <span class="next-move__body">\n'
      '            <span class="a-nm__label">Next move</span>\n'
      '            <span class="next-move__title">You&rsquo;re matched with Leah Hartwell</span>\n'
      '            <span class="next-move__detail">You&rsquo;re working with Leah Hartwell.</span>\n'
      '          </span>\n'
      '          <span class="next-move__arrow"><svg><use href="#i-arrow-ur"/></svg></span>\n'
      '        </div>\n'
    + story_row('Maker Spotlight', 'The Grain Whisperer of Maine', '4 min read', 'g-hero')
    + '      </div>\n'
    + dock('Leah Hartwell &middot; your designer')
    + statusbar() + ISLAND + home_indicator()
)

M9_CO = (co(1, "top:184px;left:2px")
         + co(2, "top:290px;left:2px", clay=True)
         + co(3, "top:340px;right:2px")
         + co(4, "top:470px;left:2px")
         + co(5, "top:756px;right:2px"))

write("a-M9.html", wrap("a-m9", "light", M9_SCREEN, M9_CO,
                        styles=css("a-m9", CSS_MOVED, CSS_NM_LABEL, CSS_STORY_ROW)))

print("done")

# ===========================================================================
# Screen sheets
# ===========================================================================

SHEET_KEYS = ["Callouts", "Purpose", "Entry points", "Components", "Copy", "Data source",
              "States", "Interactions", "Tier behaviour", "New vs today", "Drawn vs manifest"]


def sheet(name, caption, rows):
    out = ['<div class="sheet-wrap" style="overflow-x:auto">\n',
           '  <table class="sheet-table">\n',
           '    <caption>%s</caption>\n' % caption]
    for k in SHEET_KEYS:
        if k not in rows:
            continue
        cls = ' class="is-new"' if k == "New vs today" else ''
        out.append('    <tr><th>%s</th><td%s>%s</td></tr>\n' % (k, cls, rows[k]))
    out.append('  </table>\n</div>\n')
    write(name, "".join(out))


sheet("a-M1.sheet.html",
      "M1 &middot; Today &mdash; activeProject, 12:30pm (Ruth) &middot; light + dark",
      {
"Callouts":
  "<b>1</b> the <span class=\"mono\">WHAT MOVED</span> block, inside the greeting header &mdash; it draws "
  "only when something moved. <b>2</b> <code>TodayNextMoveCard</code> at hero weight, "
  "<code>hand.raised</code> in a 48 pt clay-wash tile. <b>3</b> the whole waiting queue on one card, in "
  "date order, one route. <b>4</b> <code>DailyStoryCard</code> demoted to a 96 pt row; the unread dot is "
  "real. <b>5</b> no Active Room card &mdash; <code>client@patina.dev</code> has no room, and the module "
  "is absent rather than faked. <b>6</b> the hearth hint names the designer.",
"Purpose":
  "One screen that says what moved and what is owed, in that order.",
"Entry points":
  "App root; the Companion&rsquo;s &ldquo;Home&rdquo; row.",
"Components":
  "<code>DailyGreetingHeader</code> (existing, + the block) &middot; <code>TodayNextMoveCard</code> "
  "(existing, new branches + weight) &middot; <code>DailyStoryCard</code> (existing, compact variant) "
  "&middot; <code>CompanionOverlay</code> (existing, new hint). Nothing new is mounted.",
"Copy":
  "<span class=\"mono\">WEDNESDAY &middot; AUG 26</span> / &ldquo;Today&rdquo; / "
  "<span class=\"mono\">WHAT MOVED</span> / &ldquo;Leah moved Aspen Loft Refresh into Installation &amp; "
  "Styling on Monday. A proposal arrived Thursday.&rdquo; / <span class=\"mono\">NEXT MOVE</span> / "
  "&ldquo;Leah is waiting on two things&rdquo; / &ldquo;A rug colour since Aug 22 &middot; a proposal by "
  "Sep 8 &middot; your invoice is due Sep 1&rdquo; / <span class=\"mono\">MAKER SPOTLIGHT</span> / "
  "&ldquo;The Grain Whisperer of Maine&rdquo; / <span class=\"mono\">4 MIN READ</span> / hint "
  "<span class=\"mono\">LEAH HARTWELL &middot; YOUR DESIGNER</span>.",
"Data source":
  "<code>BadgeCountService</code> (decisions / proposals / invoices / threads / projects); "
  "<code>projects.current_phase</code> off the same fetch (<code>ProjectsAPIClient.swift:25</code> via "
  "<code>BadgeCountService.swift:85</code> &mdash; zero new network calls); <code>StudioQueueBuilder</code> "
  "dates; <code>editorial_stories</code>; one device-local last-seen timestamp and last-story-read id.",
"States":
  "Loading &mdash; cards as skeletons, header immediate. <b>Nothing moved &mdash; the block does not draw "
  "at all.</b> Re-opened inside 6 hours &mdash; the block holds its last content until the item is acted "
  "on, and never re-dates itself. Empty queue &mdash; the Next Move names the phase "
  "(&ldquo;Aspen Loft Refresh is in Installation &amp; Styling&rdquo;). Error &mdash; the existing "
  "partial-failure behaviour; never a fabricated line.",
"Interactions":
  "<code>today_next_move_tapped</code> (<code>action_id: openStudioQueue</code>) &rarr; "
  "<code>AppRoute.studio</code> &middot; block render &rarr; <code>today_moved_line_shown</code> &middot; "
  "story &rarr; <code>today_editorial_story_tapped</code>.",
"Tier behaviour":
  "activeProject as drawn. Engaged shows the match branch (M9); discovering the room / new-pieces branch "
  "(M2); guest gets the room ladder and <b>no block</b> &mdash; a guest&rsquo;s second launch is the gate, "
  "so A&rsquo;s day begins at sign-in.",
"New vs today":
  "The <span class=\"mono\">WHAT MOVED</span> block; the queue and phase branches on the one Next Move; "
  "the content-driven card weights; the designer-named hearth hint.",
"Drawn vs manifest":
  "&ldquo;Today&rdquo; is drawn at the shipped Playfair 22 (<code>PatinaTypography.h4</code>, "
  "<code>DailyGreetingHeader.swift:40</code>), not the manifest&rsquo;s 40 &mdash; &sect;2 of the direction "
  "says the header is &ldquo;as today&rdquo; at every tier, and the kit is calibrated to 22. The project is "
  "named <b>Aspen Loft Refresh</b>, its seeded name. At 402 pt the detail line runs to three lines, not "
  "two. Every date, and the designer&rsquo;s surname, are <i>example</i> &mdash; the seed carries neither. "
  "Dark variant: <code>#211E1B</code> ground, <code>#2C2926</code> card, <code>#F2EDE6</code> text, "
  "<code>#B5A487</code> mono, clay unchanged; the collapsed orb stays <code>Background.dark</code> in both "
  "themes, which is the shipped behaviour, not a drawing error.",
      })

sheet("a-M2.sheet.html",
      "M2 &middot; Today &mdash; discovering, 9:10pm (Maya) &middot; light",
      {
"Callouts":
  "<b>1</b> the block, carrying her own room rather than the catalog &mdash; wave 1. <b>2</b> the Next Move "
  "back at ordinary weight: quiet day, weights swap back. <b>3</b> the story row, dot on because she has "
  "not opened <i>this</i> story. <b>4</b> <code>TodayActiveRoomCard</code>, <b>no</b> "
  "<span class=\"mono\">ROOM SCAN</span> chip &mdash; a typed room, not a scanned one. <b>5</b> the new "
  "fill line: her spend beside the band the quiz itself printed.",
"Purpose":
  "The nightly twenty minutes, with a room visibly closer to done.",
"Entry points": "App root.",
"Components":
  "As M1, plus <code>TodayActiveRoomCard</code> (existing, one new line).",
"Copy":
  "<span class=\"mono\">WHAT MOVED</span> / &ldquo;The jute rug has been in the Living Room since "
  "Sunday.&rdquo; <i>(wave 2 replaces it with &ldquo;Three new pieces for the Living Room.&rdquo;)</i> / "
  "<span class=\"mono\">NEXT MOVE</span> / &ldquo;Return to the Living Room&rdquo; / &ldquo;Three pieces "
  "are gathering there.&rdquo; / <span class=\"mono\">EDITOR&rsquo;S NOTE</span> / &ldquo;Patina: The slow "
  "shape of home&rdquo; / <span class=\"mono\">3 MIN READ</span> / "
  "<span class=\"mono\">ACTIVE ROOM</span> / &ldquo;Living Room&rdquo; / &ldquo;18 &times; 14 ft &middot; "
  "3 pieces saved&rdquo; / <span class=\"mono\">$3,590 SAVED &middot; YOUR RANGE $5K+</span> / hint "
  "<span class=\"mono\">LIVING ROOM &middot; 3 SAVED</span>.",
"Data source":
  "<code>RoomStore</code> + <code>saved_items</code> for the spend; "
  "<code>StylePreferenceModel.budgetRange</code>&rsquo;s <b>display label</b> for the range &mdash; her own "
  "answer, printed as she gave it (<code>StyleQuizViewModel.swift:239-247</code>). Wave 2 adds "
  "<code>get_recommendations.created_at</code> for the new-pieces count. Story from "
  "<code>editorial_stories</code> (<code>00143</code>, row 2, <code>hero_gradient_key 'walnut'</code>).",
"States":
  "Nothing moved &rarr; no block. Band <code>TBD</code> &rarr; the money half is omitted, not zeroed. "
  "Unsynced saves &rarr; <span class=\"mono\">SAVED ON THIS PHONE</span>. No room &rarr; the Active Room "
  "card is absent (M1).",
"Interactions":
  "<code>today_next_move_tapped</code> (<code>action_id: exploreRoomNew</code>) &middot; "
  "<code>today_active_room_tapped</code> (<code>saved_item_count</code>).",
"Tier behaviour":
  "Guest is identical minus the money half and the block.",
"New vs today":
  "The block; the fill line on the Active Room card.",
"Drawn vs manifest":
  "The room card&rsquo;s artwork is drawn at 118 pt, not the kit&rsquo;s shipped 150 "
  "(<code>TodayModules.swift:166-200</code>): at 150 this composition&rsquo;s last 30 pt sit under the "
  "Companion at 402 &times; 874 &mdash; a real cost of adding the block, and one Kody should see. The room "
  "name stays at the shipped Playfair 22, not the manifest&rsquo;s 26. Room name, dimensions and dates are "
  "<i>example</i> (rooms are device-local; the seed has none). The three saved pieces, their makers and "
  "prices are real seed rows and sum to the $3,590 drawn.",
      })

sheet("a-M3.sheet.html",
      "M3 &middot; Piece detail &mdash; Heirloom Oak Dining Table &middot; light (discovering) + dark (activeProject)",
      {
"Callouts":
  "<b>1</b> the floating hero bar &mdash; back, help, share, save as 36 pt glass circles. <b>2</b> maker "
  "line from <code>products.brand</code>, in clay. <b>3</b> the price, and <b>no match pill</b>: an "
  "unexplained percentage does not sit above a Buy button. <b>4</b> three lines under the price, each "
  "omitted entirely when null &mdash; the middle one draws only when a room exists and both values are "
  "non-null. <b>5</b> the act bar: one primary verb, one caption, one ghost. <b>6</b> the payment caption. "
  "<b>7</b> (dark) the same bar at activeProject: Ask replaces Buy the moment a live designer relationship "
  "exists, room or no room.",
"Purpose": "Decide, and act on the decision.",
"Entry points":
  "Browse card, Saved row, room item, <code>patina://piece/&lt;id&gt;</code>, push <code>product</code>.",
"Components":
  "<code>ProductDetailView</code> (existing; SP-01 fixes the load, SP-10 the fields) + <b>new</b> act bar. "
  "The Companion renders in <code>.minimal</code> mode bottom-trailing here "
  "(<code>CompanionOverlay.swift:386-391</code>), which is what <code>shots/c-25</code> and "
  "<code>d-04</code> show.",
"Copy":
  "<span class=\"mono\">NORDIC ATELIER &middot; AARHUS, DENMARK</span> / &ldquo;Heirloom Oak Dining "
  "Table&rdquo; / &ldquo;Quarter-sawn white oak &middot; Hand-rubbed tung oil&rdquo; / &ldquo;$4,200&rdquo; "
  "/ &ldquo;38&Prime; W &times; 20&Prime; D &times; 30&Prime; H&rdquo; / &ldquo;38&Prime; wide &middot; "
  "your Living Room is 18 &times; 14 ft&rdquo; / &ldquo;Ships in 10&ndash;12 weeks&rdquo; / the seed&rsquo;s "
  "own description / light: <b>Buy it &middot; $4,200</b> + ghost <b>Get design help with this room</b> + "
  "&ldquo;Payment opens securely in Safari.&rdquo; / dark: <b>Ask Leah to source this</b> + ghost "
  "<b>Save to the Living Room</b>.",
"Data source":
  "<code>products</code> direct fetch with the qualified vendor embed &mdash; <code>brand</code>, "
  "<code>dimensions</code>, <code>lead_time_weeks</code>, <code>shipping_flat_cents</code>, "
  "<code>returns_policy_key</code>, <code>photo_verified_at</code>. Name, brand, materials, finish, "
  "description and price are the real <code>supabase/seed/products.sql:6</code> row; the hero is a crop of "
  "that row&rsquo;s own image from <code>shots/g-15b</code>.",
"States":
  "Loading &mdash; strata mark on <code>Background.secondary</code>. Error &mdash; "
  "&ldquo;Couldn&rsquo;t load product&rdquo; / &ldquo;Let&rsquo;s try that again&rdquo; <b>with a back "
  "chevron</b> (SP-01; today it has none &mdash; <code>shots/c-25</code>). Not buyable &rarr; the primary "
  "becomes <b>Get design help with this room</b> at discovering, <b>Ask Leah to source this</b> once she "
  "has a designer. Guest tapping Buy &rarr; the C9 auth sheet over context; nothing is written until she "
  "signs in.",
"Interactions":
  "<code>product_detail_opened</code> &middot; <code>order_path_shown</code> (prop <code>path</code>) "
  "&middot; <code>order_started</code> &middot; <code>designer_ask_tapped</code> &middot; "
  "<code>product_saved</code>.",
"Tier behaviour":
  "A live designer relationship &mdash; accepted lead or active project &mdash; replaces Buy with Ask, "
  "room or no room. That is the only tier switch on this screen.",
"New vs today":
  "The act bar; the three spec lines; the maker line&rsquo;s source; the match pill&rsquo;s removal.",
"Drawn vs manifest":
  "<b>No provenance chips are drawn.</b> <code>ProductDetailView.swift:232-246</code> renders that block "
  "only when <code>product.badges</code> is non-empty, and no seeded product carries a badge &mdash; "
  "drawing chips would be proposing, not reporting. (The badge display names carry emoji, "
  "<code>:437-444</code>, which is a finding.) The maker story is omitted: A itself gates it on the "
  "story&harr;product join, a wave-3 delta. <code>vendors.made_in</code> is empty on all 104 rows (F146), "
  "so <span class=\"mono\">AARHUS, DENMARK</span> is <i>example</i> &mdash; read out of the seed "
  "description&rsquo;s &ldquo;a three-person workshop outside Aarhus&rdquo;. Dimensions and lead time are "
  "<i>example</i>: both columns exist server-side and neither is returned or decoded for the catalog layer "
  "(C28). The status-bar ink is forced to charcoal because this hero photograph is light at the top.",
      })

sheet("a-M4.sheet.html",
      "M4 &middot; The room &mdash; Living Room &middot; light",
      {
"Callouts":
  "<b>1</b> the room, named, over a 240 pt room-type gradient. <b>2</b> the stat row: <b>two</b> tiles, not "
  "three &mdash; <span class=\"mono\">IN AR</span> and the bare <span class=\"mono\">MATCH</span> are gone "
  "(SP-18; <code>shots/c-24</code> shows all three, two of them reading 0 and &mdash;). <b>3</b> one plain "
  "line, no track: a bar that fills as her money leaves is a meter, and she asked for figures. <b>4</b> "
  "<span class=\"mono\">YOUR ITEMS</span>, three real seed rows. <b>5</b> the save date on the row (F197, "
  "F203). <b>6</b> one primary act, where three used to be (SP-11).",
"Purpose": "The object of return &mdash; a room that visibly fills.",
"Entry points":
  "Active Room card, Your Spaces, <code>patina://room/&lt;uuid&gt;</code>, push <code>room</code>.",
"Components":
  "<code>RoomProjectView</code> (existing; SP-11 / SP-18 do most of this) + <b>new</b> range line and save "
  "dates.",
"Copy":
  "&ldquo;Living Room&rdquo; / <span class=\"mono\">18 &times; 14 FT &middot; NORTH-FACING &middot; "
  "2 WINDOWS &middot; ENTERED AUG 24</span> &mdash; <b>entered, not scanned</b> (F51) / "
  "<span class=\"mono\">3 ITEMS</span> &middot; <span class=\"mono\">$3,590 SAVED</span> / "
  "<span class=\"mono\">YOUR RANGE &middot; $5K+ &middot; FROM YOUR QUIZ ANSWER</span> / "
  "<span class=\"mono\">YOUR ITEMS</span> / &ldquo;Velvet Club Chair &middot; Article &middot; $1,250 "
  "&middot; saved Aug 24&rdquo;, &ldquo;Brass Arc Floor Lamp &middot; Schoolhouse &middot; $890 &middot; "
  "saved Aug 22&rdquo;, &ldquo;Woven Jute Area Rug 8x10 &middot; Studio Piet &middot; $1,450 &middot; saved "
  "Sunday&rdquo; / &ldquo;Browse pieces for the Living Room&rdquo;.",
"Data source":
  "<code>RoomStore</code> (SwiftData <code>RoomModel</code>), <code>saved_items</code>, "
  "<code>StylePreferenceModel.budgetRange</code> label. The three pieces, their makers and their prices are "
  "real rows in <code>supabase/seed/products.sql</code> and sum to the $3,590 drawn.",
"States":
  "Empty room &rarr; &ldquo;A blank canvas&rdquo; + one CTA (the shipped copy, <code>shots/c-24</code>). "
  "Unsynced &rarr; <span class=\"mono\">SAVED ON THIS PHONE</span>. Band <code>TBD</code> &rarr; the range "
  "line is absent, not zeroed.",
"Interactions":
  "<code>room_channel_viewed</code> &middot; <code>product_detail_opened</code> &middot; "
  "<code>marketplace_row_tapped</code>.",
"Tier behaviour": "Identical at every tier.",
"New vs today":
  "The honest stat row; the range line; the save dates; one CTA instead of three.",
"Drawn vs manifest":
  "Item thumbnails are drawn as the app&rsquo;s own no-image fallback &mdash; the bare category gradient "
  "(<code>ProductModel.swift:115-124</code>) &mdash; because this review holds no crop of those three "
  "seed photographs; never a stock image. Room name, dimensions, orientation, window count and the entered "
  "/ saved dates are <i>example</i>: <code>rooms</code> has 0 rows locally and rooms are device-local.",
      })

sheet("a-M5.sheet.html",
      "M5 &middot; The purchase &mdash; order sheet &rarr; payment hand-off &rarr; order placed",
      {
"Callouts":
  "<b>5a</b> &mdash; <b>1</b> the hand-rolled Patina sheet header: drag handle 36&times;4, title first, mono "
  "eyebrow second (<code>AddToRoomSheet.swift:24-34</code>), <b>not</b> <code>PatinaSheetHeader</code>, "
  "which has zero call sites. <b>2</b> the money block, label left / figure right on pearl hairlines. "
  "<b>3</b> <span class=\"mono\">SALES TAX &mdash; ADDED AT CHECKOUT</span>: this line draws only once "
  "<code>automatic_tax</code> is enabled, and the Buy control does not ship before that decision is made. "
  "<b>4</b> fit, lead time, and who handles a damage claim. <b>5</b> the primary, with the caption that "
  "says where the money is taken. &mdash; <b>5b</b> &mdash; <b>1</b> <code>SFSafariViewController</code>, "
  "drawn as the system surface it is: no Patina chrome on the page that takes the money. <b>2</b> the total "
  "the sheet quoted, unchanged. <b>3</b> Apple Pay above the card form, because it is set up on the phone, "
  "not in the app. <b>4</b> Safari&rsquo;s own toolbar. <b>5</b> the success page &mdash; "
  "<code>successUrl</code> points at the client portal today "
  "(<code>create-checkout-session/index.ts:553</code>), so <b>6</b> the buyer must tap Done to come back. "
  "&mdash; <b>5c</b> &mdash; <b>6</b> the order, stated. <b>7</b> what was paid and where the receipt went. "
  "<b>8</b> what happens next, in words &mdash; <b>not a fake tracker</b>: the order joins "
  "<code>fulfillment_orders</code> at settle and its status derives from line states no vendor has "
  "acknowledged. <b>9</b> two ways out.",
"Purpose": "Take money without lying about what happens next.",
"Entry points": "Piece detail, <b>Buy it</b>.",
"Components":
  "<b>All new</b> &mdash; <code>OrderSheet</code>, existing <code>SafariView</code>, "
  "<code>OrderPlacedView</code>. Zero iOS code references <code>direct_order</code> at head.",
"Copy":
  "5a: &ldquo;Heirloom Oak Dining Table&rdquo; / <span class=\"mono\">NORDIC ATELIER &middot; MADE TO "
  "ORDER</span> / &ldquo;Piece $4,200.00&rdquo; &middot; &ldquo;White-glove delivery $350.00&rdquo; "
  "&middot; &ldquo;Sales tax &mdash; added at checkout&rdquo; &middot; &ldquo;Total $4,550.00 plus "
  "tax&rdquo; / &ldquo;38&Prime; wide &middot; your Living Room is 18 &times; 14 ft&rdquo; &middot; "
  "&ldquo;Ships in 10&ndash;12 weeks.&rdquo; &middot; &ldquo;If it arrives damaged, Patina handles the "
  "claim with Nordic Atelier &mdash; one number, in your receipt.&rdquo; / <b>Continue to payment</b> / "
  "&ldquo;Payment opens securely in Safari. Apple Pay works there if it&rsquo;s set up on this "
  "iPhone.&rdquo; / ghost <b>Get design help with this room</b>. Inset, roster case only: &ldquo;Credited "
  "to Leah Hartwell.&rdquo; &mdash; 5c: <span class=\"mono\">ORDERED &middot; AUG 26</span> / "
  "&ldquo;Heirloom Oak Dining Table&rdquo; / &ldquo;Nordic Atelier &middot; Aarhus&rdquo; / "
  "<span class=\"mono\">PAID</span> / &ldquo;$4,550.00 paid&rdquo; &middot; &ldquo;Receipt emailed to "
  "walt@&hellip;&rdquo; / &ldquo;Nordic Atelier starts it this week. We&rsquo;ll email you when it "
  "ships.&rdquo; / <b>Back to Today</b>, ghost <b>Your orders</b>. Inset: &ldquo;Leah Hartwell is credited "
  "on this order.&rdquo;",
"Data source":
  "<code>create_direct_order</code> RPC &rarr; <code>create-checkout-session{direct_order_id}</code> &rarr; "
  "<code>{url}</code> &rarr; <code>SFSafariViewController</code> &rarr; the invoice rail&rsquo;s 3s/60s "
  "poll on <code>direct_orders.status</code> &rarr; <code>fulfillment_orders</code> for everything after. "
  "The total is the session&rsquo;s <code>amount_total</code>.",
"States":
  "<b>Not signed in &mdash; the C9 sheet first, over context, and the order is created only after.</b> "
  "Creating &mdash; the button dims and spins. Hand-off failure &mdash; the app&rsquo;s own error state "
  "<b>above</b> the button with &ldquo;Let&rsquo;s try that again&rdquo; and &ldquo;Get design help with "
  "this room&rdquo; (SP-15&rsquo;s shape). Poll timeout &rarr; &ldquo;We haven&rsquo;t seen this payment "
  "yet. We&rsquo;ll update this as soon as it clears.&rdquo; &mdash; never an unconditional bank-transfer "
  "banner.",
"Interactions":
  "<code>order_started</code> &middot; <code>order_checkout_opened</code> &middot; "
  "<code>order_placed</code> &middot; <code>order_failed</code>.",
"Tier behaviour":
  "The sheet never opens for a client with a live designer relationship &mdash; Path B does. Discovering "
  "only; the credited inset is the roster case, where a designer sent him here and is credited without "
  "being engaged.",
"New vs today":
  "Everything. There is no order object, no order sheet and no order screen in the client app today.",
"Drawn vs manifest":
  "The sheet is drawn at 648 pt, not <code>.medium</code>&rsquo;s ~437: the content A specifies does not "
  "fit a medium detent at 402 &times; 874, so either the detent grows or the money block scrolls &mdash; "
  "<b>an open decision, not a drawing liberty</b>. Safari and Stripe surfaces use Apple&rsquo;s and "
  "Stripe&rsquo;s own metrics, system font and system colours, exactly as <code>kit.css</code> &sect;14 "
  "draws the iOS system set; no Patina token belongs on them. The success page is the client portal, which "
  "is where <code>successUrl</code> lands today. White-glove $350, the ship window and walt@&hellip; are "
  "<i>example</i>; the piece, brand and $4,200 are the real seed row.",
      })

sheet("a-M6.sheet.html",
      "M6 &middot; The return moment &mdash; Lock Screen push + the Today it opens",
      {
"Callouts":
  "<b>1</b> the Lock Screen <code>accessoryRectangular</code> widget: <b>what moved</b>, not what is owed. "
  "<b>2</b> one notification card &mdash; the app icon, the sender, the fact. <b>3</b> the body names the "
  "project and the date the reply is wanted. <b>4</b> the Today it opens, with the block carrying the same "
  "sentence &mdash; <b>the failure mode we design against is a notification that opens a screen which knows "
  "nothing about it</b>. <b>5</b> the one Next Move, already holding the proposal. <b>6</b> the hearth "
  "hint, agreeing with both.",
"Purpose": "The one honest interruption.",
"Entry points":
  "<code>notify_client_attention</code> &rarr; <code>apns-send</code>; the widget timeline.",
"Components":
  "System notification; <b>new</b> widget extension; <code>NotificationRouter</code> (existing, already "
  "handles <code>proposal</code>).",
"Copy":
  "Push: &ldquo;Leah sent a proposal&rdquo; / &ldquo;Aspen Loft Refresh &mdash; read it by Sep 8.&rdquo; "
  "Widget: <span class=\"mono\">LEAH SENT A PROPOSAL</span> / &ldquo;Tuesday&rdquo;. The Today it opens "
  "carries M1&rsquo;s line verbatim.",
"Data source":
  "<code>notification_log</code> + <code>device_push_tokens</code>; the widget reads a small App Group "
  "cache written on every badge refresh.",
"States":
  "Permission not granted &rarr; no push; the feed and email carry it. Nothing waiting &rarr; "
  "<span class=\"mono\">NOTHING NEEDS YOU</span> / the room. Signed out &rarr; wordmark only.",
"Interactions":
  "<code>push_received</code> &middot; <code>push_opened</code> (<code>entity_type</code>) &middot; "
  "<code>widget_tapped</code>.",
"Tier behaviour":
  "Engaged gets only the design-request pushes that already fire; discovering and guest get none and are "
  "never asked.",
"New vs today":
  "The send for money and decisions; the widget target; the pre-permission screen (M8).",
"Drawn vs manifest":
  "The widget is placed under the clock and the notification near the bottom, which is where iOS puts them; "
  "the manifest&rsquo;s &ldquo;below it&rdquo; is deck reading order. The push body names the seeded "
  "project <b>Aspen Loft Refresh</b>; the seeded proposal titles are dev fixtures (&ldquo;Sample accepted "
  "proposal&rdquo;), so no proposal name is printed. <b>None of this ships today</b>: the client app has no "
  "widget extension and no associated-domains entitlement, and the only notification prompt fires after a "
  "design request with no pre-permission copy (C28).",
      })

sheet("a-M7.sheet.html",
      "M7 &middot; The Companion, expanded &mdash; Your Designer <i>(extra)</i>",
      {
"Callouts":
  "<b>1</b> the <b>new</b> header: portrait or clay monogram, the designer&rsquo;s name, her studio and "
  "credential. Today this whole view renders nothing when the identity is nil "
  "(<code>StudioIdentityLine.swift:15-17</code>) &mdash; under A the name and monogram still draw. "
  "<b>2</b> <b>What&rsquo;s waiting</b> is the one suggested row, because the queue is non-empty; when it "
  "empties the suggestion moves to <b>Message Leah</b> and this row reads &ldquo;Nothing right now&rdquo;. "
  "<b>3</b> one summary count, and no records behind it. <b>4</b> five rows, cap unchanged, "
  "&le;1 suggested.",
"Purpose": "Make the relationship layer hold a relationship.",
"Entry points": "The hearth, anywhere.",
"Components":
  "<code>CompanionOverlay</code> (existing) &middot; <code>CompanionAreaBuilders</code> (existing rows) "
  "&middot; <b>new</b> header.",
"Copy":
  "&ldquo;Leah Hartwell&rdquo; / <span class=\"mono\">YOUR DESIGNER &middot; HARTWELL &amp; CO &middot; "
  "NCIDQ</span> / <b>What&rsquo;s waiting</b> &middot; <b>Message Leah</b> &middot; <b>Your Studio</b> "
  "&middot; <b>Saved</b> &middot; <b>Your profile</b>.",
"Data source":
  "<code>profiles</code>, <code>StudioIdentityService.identity(forDesigner:)</code>, "
  "<code>IntroductionInfo</code>, <code>BadgeCountService</code>. <b>Message Leah</b> calls "
  "<code>rpc_start_direct_thread</code>.",
"States":
  "No designer &rarr; today&rsquo;s &ldquo;Where to next?&rdquo; panel, unchanged. <b>Nil identity &rarr; "
  "the name and monogram still draw.</b> Loading &rarr; the header reserves its height.",
"Interactions":
  "<code>companion_panel_opened</code> &middot; <code>companion_quick_action_tapped</code>.",
"Tier behaviour":
  "Header at engaged and above. The engaged variant is identical minus the What&rsquo;s waiting count.",
"New vs today":
  "The header; the message row; the state-driven suggestion. The row cap and the &le;1-suggested rule are "
  "unchanged.",
"Drawn vs manifest":
  "Drawn on the <b>shipped dark panel</b> (<code>Background.dark</code>, radius 26, "
  "<code>CompanionHearthView.swift:310-338</code>) with the existing <code>.companion-row</code> cards, "
  "because A&rsquo;s own component list says &ldquo;existing rows&rdquo;. A&rsquo;s prose also asks for "
  "<code>Background.primary</code> with pearl-hairline rows, which would restyle an existing component "
  "&mdash; <b>that conflict is A&rsquo;s to resolve, and is drawn the shipped way here rather than "
  "silently invented</b>. The studio name and credential are <i>example</i>: no seeded designer identity "
  "was read in this review.",
      })

sheet("a-M8.sheet.html",
      "M8 &middot; The permission moment <i>(extra, wave 2)</i>",
      {
"Callouts":
  "<b>1</b> the Strata mark at 32 pt, leading-aligned like everything else in the app. <b>2</b> the promise, "
  "in one sentence, and the only version of it in the direction. <b>3</b> the three things that will ever "
  "wake her phone &mdash; and nothing else. <b>4</b> the ask, and a real way to decline.",
"Purpose": "Spend the one grant well.",
"Entry points":
  "The first client-facing <code>notification_log</code> row of type proposal / decision / invoice.",
"Components": "<b>New</b> screen; existing <code>PushTokenService</code>.",
"Copy":
  "&ldquo;Only when something needs you.&rdquo; / &ldquo;We&rsquo;ll tell you when your designer sends "
  "something that needs you &mdash; a decision, a proposal, or an invoice. Nothing else.&rdquo; / "
  "<span class=\"mono\">A DECISION TO MAKE</span> &middot; <span class=\"mono\">A PROPOSAL TO READ</span> "
  "&middot; <span class=\"mono\">AN INVOICE COMING DUE</span> / <b>Turn on notifications</b> / ghost "
  "<b>Not now</b>.",
"Data source": "None &mdash; copy only.",
"States":
  "<b>Declined our screen &rarr; never asked again</b>; Settings carries the switch. Denied the system "
  "prompt &rarr; iOS will not show it again this install, and the Settings row deep-links there.",
"Interactions":
  "<code>push_permission_prompted</code> (<code>trigger</code>, <code>outcome</code>).",
"Tier behaviour": "Engaged and activeProject only.",
"New vs today":
  "The app has no pre-permission copy anywhere; the only prompt fires after a design request, cold.",
"Drawn vs manifest":
  "Drawn as spec&rsquo;d. The following Apple alert is the two-button system prompt in "
  "<code>kit.css</code> &sect;14 (<code>.sys-alert</code>) and is not redrawn here.",
      })

sheet("a-M9.sheet.html",
      "M9 &middot; Today &mdash; engaged (James) <i>(extra)</i>",
      {
"Callouts":
  "<b>1</b> the block, carrying the request&rsquo;s stage &mdash; the one thing that advances without him. "
  "<b>2</b> the Next Move: the stage&rsquo;s own <code>cardTitle</code> in the <i>title</i> slot. Today "
  "that string lands in the <b>detail</b> slot under the fixed title &ldquo;See your design request&rdquo; "
  "(<code>DailyRoomView.swift:184-191</code>); A swaps them. <b>3</b> the stage&rsquo;s own subtitle, "
  "verbatim from <code>DesignRequestStatusService.swift:150-152</code>. <b>4</b> the story row. <b>5</b> "
  "the hearth hint &mdash; at engaged the app names the designer for the first time.",
"Purpose": "The tier that is currently byte-identical to guest.",
"Entry points": "App root.",
"Components":
  "Existing &mdash; <code>TodayExperience.swift:80-91</code> renders this branch already; SP-07&rsquo;s "
  "one-line filter fix is what lets it run.",
"Copy":
  "<span class=\"mono\">WHAT MOVED</span> / &ldquo;Leah Hartwell picked up your request on the 18th.&rdquo; "
  "/ <span class=\"mono\">NEXT MOVE</span> / &ldquo;You&rsquo;re matched with Leah Hartwell&rdquo; / "
  "&ldquo;You&rsquo;re working with Leah Hartwell.&rdquo; &mdash; both verbatim from the shipped stage "
  "table (<code>cardTitle</code> <code>:182-183</code>, subtitle <code>:150-151</code>).",
"Data source":
  "<code>leads</code> + <code>match_ceremonies</code> via <code>DesignRequestStatusService</code>. "
  "<code>james.okafor@example.com</code> is the one local account at this tier: lead "
  "<code>status='accepted'</code>, designer matched, 0 projects (C29).",
"States":
  "Stage advances change the copy from the existing stage table, verbatim "
  "(<code>held &rarr; inTouch &rarr; introduced &rarr; booked &rarr; matched</code>). Terminal stages hold "
  "for 14 days from <b>last seen</b>, capped at 60 days &mdash; absence stops deleting the one card that "
  "explains his designer (F189).",
"Interactions":
  "<code>today_next_move_tapped</code> (<code>action_id: trackDesignRequest</code>).",
"Tier behaviour": "Engaged only. No Active Room card: this account has no room.",
"New vs today":
  "The block; the decay re-anchor to last seen; the title / detail swap.",
"Drawn vs manifest":
  "&ldquo;the 18th&rdquo; and the designer&rsquo;s surname are <i>example</i>. The monogram is drawn as "
  "<b>J</b> for the seeded account.",
      })

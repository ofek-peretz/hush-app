"""FERROX surfaces the phone can't screenshot, redrawn from the Swift that draws them.

Sources: targets/widget/HushLiveActivityWidget.swift (lock card, Dynamic Island) and
targets/watch/WatchScreens.swift (ActiveSetScreen :1820, InterRestScreen :2491,
StartScreen.lobbyFace :1441) at 45 mm (Fit factor 1.222 already applied). Words come from the
copy pack (watch.*, notifications.lock*). Example data only. Sizes are points; `u` = px per point.
"""

MARK_PATH = ('M62 60 C79 60 88 46 89.5 17 C82 34 74 44 61 44 L39 44 C26 44 18 34 10.5 17 '
             'C12 46 21 60 38 60 L36.584 60 A14 14 0 0 1 63.416 60 Z')

MONO = "'SF Mono','IBM Plex Mono',ui-monospace,Menlo,monospace"
SANS = "-apple-system,'SF Pro Text','Assistant','Segoe UI',sans-serif"
SERIF = "'New York','Frank Ruhl Libre',Georgia,serif"
INK0, INK1, INK2, INK3 = '#f1eee5', '#a8a290', '#8b8474', '#57534a'
MOSS, STAGE1, STAGE2 = '#a9c49f', '#1b1914', '#2a2822'
LTR = 'direction:ltr;unicode-bidi:isolate'

HE = dict(dir='rtl', set='סט', of='מתוך', kg='ק"ג', complete='השלם סט', rest='מנוחה', upnext='הבא בתור',
          skip='דלג על המנוחה', add15='&lrm;+15 שנ׳', lift='תרגיל', begin='התחל', another='אחר',
          cardio='אימון חופשי', lifts='6 תרגילים', workout='עליון ב', squat='סקוואט אחורי',
          nextset='הסט הבא', next='הבא', exname='Bench Press')
EN = dict(dir='ltr', set='SET', of='of', kg='kg', complete='Complete set', rest='Rest', upnext='Up next',
          skip='Skip rest', add15='+15 s', lift='LIFT', begin='Begin', another='Another',
          cardio='Cardio', lifts='6 lifts', workout='Upper B', squat='Back Squat',
          nextset='Next set', next='Next up', exname='Bench Press')


def mark_svg(width_css: str, horns='#F1EEE5', dot='#A9C49F') -> str:
    return (f'<svg viewBox="9.5 16 81 59" style="width:{width_css};height:auto;display:block;flex-shrink:0" aria-hidden="true">'
            f'<path fill="{horns}" d="{MARK_PATH}"/><circle cx="50" cy="64" r="10" fill="{dot}"/></svg>')


def _px(u):
    return lambda n: f'{n*u:.2f}px'


def _screen(u, inner, L, radius=True):
    r = f'{34*u:.2f}px' if radius else '0'
    return (f'<div style="position:relative;width:{198*u:.2f}px;height:{242*u:.2f}px;background:#000;border-radius:{r};overflow:hidden;'
            f'direction:{L["dir"]};font-family:{SANS};color:{INK0}">{inner}</div>')


def watch_set(u, L=HE, radius=True):
    """ActiveSetScreen — set 2 of 4, bench press 32.5 kg, band 6–8, first set done at 8."""
    s = _px(u)
    dot = f'<i style="display:block;width:{s(6.1)};height:{s(6.1)};border-radius:50%;background:rgba(241,238,229,.28)"></i>'
    cols = ''.join(
        f'<div style="display:flex;flex-direction:column;align-items:center;gap:{s(3.7)};flex:1">'
        f'<div style="height:{s(28.1)};display:flex;align-items:center;font:{fw} {s(28.1)}/1 {MONO};color:{c}">{txt}</div>'
        f'<div style="width:{s(22)};height:{s(2.4)};border-radius:9px;background:{bar}"></div></div>'
        for txt, fw, c, bar in [('8', 500, INK0, 'transparent'), ('7', 400, 'rgba(168,162,144,.45)', 'rgba(241,238,229,.55)'),
                                (dot, 400, INK0, 'transparent'), (dot, 400, INK0, 'transparent')])
    inner = f'''
    <div style="position:absolute;inset:0;padding:{s(6)} {s(11)} 0;display:flex;flex-direction:column">
      <div style="height:{s(46.4)};display:flex;flex-direction:column;gap:{s(1.2)}">
        <div style="font:500 {s(13.4)}/1.2 {MONO};letter-spacing:{s(1.34)};color:{INK2};white-space:nowrap">{L["set"]} <span style="{LTR}">2/4</span></div>
        <div style="font:600 {s(17.1)}/1.2 {SANS};color:{INK0};white-space:nowrap">{L["exname"]}</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:{s(4.9)}">
        <div style="display:flex;align-items:baseline;gap:{s(4.9)}">
          <span style="font:500 {s(56.2)}/1 {MONO};color:#fff;{LTR}">32.5</span>
          <span style="font:400 {s(18.3)}/1 {SANS};color:{INK2}">{L["kg"]}</span>
        </div>
        <div style="font:500 {s(22)}/1 {MONO};color:{INK1};{LTR}">× 6–8</div>
        <div style="display:flex;width:100%;direction:ltr;margin-top:{s(2)}">{cols}</div>
      </div>
      <div style="height:{s(34.2)}"></div>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:{s(-19.6)};height:{s(53.8)};background:{INK0};border-radius:{s(17.1)};display:flex;justify-content:center;padding-top:{s(8)};box-sizing:border-box">
      <span style="font:600 {s(18.3)}/1 {SANS};color:#131210">{L["complete"]}</span>
    </div>'''
    return _screen(u, inner, L, radius)


def watch_rest(u, L=HE, radius=True):
    """InterRestScreen — 1:24 of 1:30 left, next up 35 kg, set 3/4."""
    s = _px(u)
    r = 88 * u
    circ = 2 * 3.14159 * 40.95
    inner = f'''
    <div style="position:absolute;inset:0;padding:{s(6)} {s(11)} 0;display:flex;flex-direction:column">
      <div style="height:{s(24.4)};display:flex;align-items:center">
        <span style="font:500 {s(13.4)}/1 {MONO};letter-spacing:{s(.98)};color:{INK1};white-space:nowrap">{L["lift"]} <span style="{LTR}">2/5</span></span>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
        <div style="display:flex;align-items:center;gap:{s(9.8)}">
          <div style="position:relative;width:{r:.2f}px;height:{r:.2f}px;flex-shrink:0">
            <svg viewBox="0 0 88 88" width="{r:.2f}" height="{r:.2f}" style="display:block;transform:rotate(-90deg)">
              <circle cx="44" cy="44" r="40.95" fill="none" stroke="{STAGE2}" stroke-width="6.1"/>
              <circle cx="44" cy="44" r="40.95" fill="none" stroke="{MOSS}" stroke-width="6.1" stroke-linecap="round" stroke-dasharray="{circ:.2f}" stroke-dashoffset="{circ*(1-84/90):.2f}"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:{s(1.2)}">
              <span style="font:600 {s(23.8)}/1 {MONO};color:{INK0};{LTR}">1:24</span>
              <span style="font:500 {s(14.7)}/1 {SANS};color:{INK2}">{L["rest"]}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:{s(2.4)};align-items:flex-start">
            <span style="font:500 {s(13.4)}/1 {MONO};letter-spacing:{s(1.1)};color:{INK1};white-space:nowrap">{L["upnext"]}</span>
            <span style="display:flex;align-items:baseline;gap:{s(3.7)}"><b style="font:500 {s(29.3)}/1 {MONO};color:{MOSS}">35</b><span style="font:500 {s(14.7)}/1 {SANS};color:{MOSS}">{L["kg"]}</span></span>
            <span style="font:500 {s(13.4)}/1 {MONO};letter-spacing:{s(1.1)};color:{INK2};white-space:nowrap">{L["set"]} <span style="{LTR}">3/4</span></span>
          </div>
        </div>
        <div style="font:600 {s(15.9)}/1.25 {SANS};color:{INK0};padding-top:{s(7.3)}">{L["exname"]}</div>
      </div>
      <div style="display:flex;gap:{s(7.3)};padding-bottom:{s(8)}">
        <div style="flex:1;height:{s(51.3)};border-radius:{s(17.1)};background:{INK0};display:grid;place-items:center;font:600 {s(15.5)}/1 {SANS};color:#000;white-space:nowrap">{L["skip"]}</div>
        <div style="width:{s(66)};height:{s(51.3)};border-radius:{s(15.9)};background:{STAGE1};display:grid;place-items:center;font:600 {s(17.1)}/1 {SANS};color:{INK0};white-space:nowrap">{L["add15"]}</div>
      </div>
    </div>'''
    return _screen(u, inner, L, radius)


def watch_home(u, L=HE, radius=True):
    """StartScreen.lobbyFace — up next Upper B, 6 lifts, week rail 2 of 4 done."""
    s = _px(u)
    rail = ''.join(f'<i style="display:block;height:{s(6.1)};width:{s(19.6)};border-radius:9px;{st}"></i>'
                   for st in [f'background:{MOSS}', f'background:{MOSS}', f'box-shadow:inset 0 0 0 {s(1.8)} {INK0}', f'background:{INK3}'])
    inner = f'''
    <div style="position:absolute;inset:0;padding:{s(6)} {s(11)} 0;display:flex;flex-direction:column">
      <div style="height:{s(24.4)};display:flex;align-items:center">
        <span style="font:500 {s(13.4)}/1 {MONO};letter-spacing:{s(.98)};color:{INK1};white-space:nowrap">{L["upnext"]}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:{s(7.3)};margin-top:{s(6)}">
        <div style="font:400 {s(36.7)}/1.05 {SERIF};color:{INK0}">{L["workout"]}</div>
        <div style="display:flex;align-items:center;gap:{s(7.3)};font:500 {s(15.9)}/1 {SANS};color:{INK1}"><span>{L["lifts"]}</span><i style="width:{s(3.7)};height:{s(3.7)};border-radius:50%;background:{INK2}"></i><span style="{LTR}">55:00</span></div>
        <div style="display:flex;gap:{s(6.1)};padding-top:{s(3.7)}">{rail}</div>
      </div>
      <div style="flex:1"></div>
      <div style="display:flex;gap:{s(7.3)};margin-bottom:{s(7.3)}">
        <div style="flex:1;height:{s(36.7)};border-radius:99px;background:{STAGE1};display:grid;place-items:center;font:600 {s(14.7)}/1 {SANS};color:{INK1}">{L["another"]}</div>
        <div style="flex:1;height:{s(36.7)};border-radius:99px;background:{STAGE1};display:grid;place-items:center;font:600 {s(14.7)}/1 {SANS};color:{MOSS};white-space:nowrap">{L["cardio"]}</div>
      </div>
      <div style="height:{s(36.6)}"></div>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:{s(-19.6)};height:{s(56.2)};background:{INK0};border-radius:{s(17.1)};display:flex;justify-content:center;align-items:flex-start;gap:{s(6)};padding-top:{s(9)};box-sizing:border-box;direction:{L["dir"]}">
      <svg viewBox="0 0 10 12" style="width:{s(11)};height:{s(13)};margin-top:{s(3)}"><path d="M0 0 L10 6 L0 12 Z" fill="#131210"/></svg>
      <span style="font:600 {s(19.6)}/1 {SANS};color:#131210">{L["begin"]}</span>
    </div>'''
    return _screen(u, inner, L, radius)


def watch_case(u, screen_html):
    """A 45 mm case around a screen, the crown on the physical right."""
    return f'''<div style="position:relative;display:inline-block;padding:{13*u:.2f}px;border-radius:{48*u:.2f}px;
      background:linear-gradient(150deg,#3a3731,#141310 45%,#24221d);
      box-shadow:0 0 0 {1.2*u:.2f}px rgba(241,238,229,.10),0 {30*u:.2f}px {70*u:.2f}px rgba(0,0,0,.65),inset 0 {u:.2f}px 0 rgba(241,238,229,.18)">
      <div style="position:absolute;right:{-6*u:.2f}px;top:{58*u:.2f}px;width:{9*u:.2f}px;height:{34*u:.2f}px;border-radius:{4*u:.2f}px;background:linear-gradient(90deg,#2a2823,#57534a)"></div>
      <div style="position:absolute;right:{-3*u:.2f}px;top:{112*u:.2f}px;width:{5*u:.2f}px;height:{48*u:.2f}px;border-radius:{3*u:.2f}px;background:#2a2823"></div>
      {screen_html}
    </div>'''


def _dots(s):
    return (f'<span style="margin-inline-start:auto;display:flex;gap:{s(5)};direction:ltr">'
            f'<i style="width:{s(8)};height:{s(8)};border-radius:50%;background:{MOSS}"></i>'
            f'<i style="width:{s(8)};height:{s(8)};border-radius:50%;background:{MOSS}"></i>'
            f'<i style="width:{s(8)};height:{s(8)};border-radius:50%;box-shadow:inset 0 0 0 {s(1.5)} {MOSS}"></i>'
            f'<i style="width:{s(8)};height:{s(8)};border-radius:50%;box-shadow:inset 0 0 0 {s(1.5)} rgba(241,238,229,.3)"></i></span>')


def _acts(s, L, h, fs):
    return (f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:{s(10)}">'
            f'<span style="height:{s(h)};border-radius:99px;display:grid;place-items:center;font:500 {s(fs)}/1 {SANS};background:rgba(241,238,229,.12);color:{INK0}">{L["add15"]}</span>'
            f'<span style="height:{s(h)};border-radius:99px;display:grid;place-items:center;font:600 {s(fs+1)}/1 {SANS};background:{INK0};color:#131210">{L["nextset"]}</span></div>')


def _drain(s, pct, live):
    attr = ' data-drain' if live else ''
    return (f'<div style="height:{s(5)};border-radius:9px;background:rgba(241,238,229,.12);overflow:hidden;direction:ltr">'
            f'<b{attr} style="display:block;height:100%;width:{pct}%;background:{MOSS};border-radius:9px"></b></div>')


def lock_card(u, clock='1:12', drain_pct=80, live=False, L=HE):
    """StrengthLockView on a rest — 360 pt wide, inside the 160 pt budget."""
    s = _px(u)
    c = ' data-clock' if live else ''
    return f'''<div style="direction:{L["dir"]};width:{s(360)};max-width:100%;box-sizing:border-box;background:rgba(19,18,16,.94);border-radius:{s(26)};padding:{s(14)};
      box-shadow:0 0 0 1px rgba(241,238,229,.08),0 {s(30)} {s(70)} rgba(0,0,0,.6);font-family:{SANS}">
      <div style="display:flex;align-items:center;gap:{s(8)};height:{s(18)}">
        {mark_svg(s(15))}
        <span style="font:400 {s(15)}/1 {SERIF};color:#c9c4b4;white-space:nowrap">{L["squat"]}</span>
        <span style="margin-inline-start:auto;font:500 {s(10)}/1 {SANS};letter-spacing:{s(1.2)};color:{INK2};white-space:nowrap;text-transform:uppercase">{L["set"]} <span style="{LTR}">3</span> {L["of"]} <span style="{LTR}">4</span></span>
      </div>
      <div style="display:flex;align-items:center;gap:{s(12)};height:{s(40)};margin:{s(8)} 0">
        <span{c} style="font:400 {s(34)}/1 {MONO};color:{INK0};{LTR}">{clock}</span>
        {_dots(s)}
      </div>
      {_drain(s, drain_pct, live)}
      <div style="margin-top:{s(8)}">{_acts(s, L, 40, 15)}</div>
    </div>'''


def island_expanded(u, clock='1:12', drain_pct=80, live=False, L=HE):
    """DynamicIsland expanded: leading (mode + subject), trailing (countdown), bottom (drain, footer, acts)."""
    s = _px(u)
    c = ' data-clock' if live else ''
    return f'''<div style="direction:{L["dir"]};width:{s(372)};max-width:100%;box-sizing:border-box;background:#000;border-radius:{s(44)};padding:{s(18)} {s(22)} {s(16)};
      box-shadow:0 0 0 1px rgba(241,238,229,.06),0 {s(40)} {s(90)} rgba(0,0,0,.6);font-family:{SANS}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:{s(12)};margin-bottom:{s(12)}">
        <div style="display:flex;flex-direction:column;gap:{s(2)}">
          <span style="font:400 {s(11)}/1.2 {SANS};color:{INK2}">{L["rest"]}</span>
          <span style="font:400 {s(15)}/1.2 {SERIF};color:{INK0};white-space:nowrap">{L["squat"]}</span>
        </div>
        <span{c} style="font:400 {s(30)}/1 {MONO};color:{INK0};{LTR}">{clock}</span>
      </div>
      {_drain(s, drain_pct, live)}
      <div style="font:400 {s(12)}/1 {SANS};color:{INK2};margin:{s(10)} 0">{L["next"]} · {L["set"]} <span style="{LTR}">3</span> {L["of"]} <span style="{LTR}">4</span></div>
      {_acts(s, L, 34, 14)}
    </div>'''


def island_compact(u, clock='1:12', L=HE):
    s = _px(u)
    return (f'<div style="direction:{L["dir"]};display:inline-flex;align-items:center;justify-content:space-between;width:{s(236)};height:{s(37)};'
            f'background:#000;border-radius:99px;padding:0 {s(13)};box-sizing:border-box">{mark_svg(s(20))}'
            f'<span style="font:400 {s(15)}/1 {MONO};color:{INK0};{LTR}">{clock}</span></div>')

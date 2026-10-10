"""FERROX social + print assets — one HTML page per asset; shoot with shoot_sized.mjs.

    python brand/social/build_assets.py <out-dir>
    node   brand/social/shoot_sized.mjs <out-dir>

Each page carries <meta name="size" content="WxH"> for the shooter.
"""
import pathlib
import sys

import segno

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
import components as C  # noqa: E402

OUT = pathlib.Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@500;600;700'
         '&family=Frank+Ruhl+Libre:wght@400;500&family=IBM+Plex+Mono:wght@500&display=swap">')
WORDMARK = ('<svg viewBox="-2 -4 704 108" style="width:{w};height:auto;display:block" aria-hidden="true"><g fill="{c}">'
            '<rect x="0" y="0" width="16" height="100"/><rect x="0" y="0" width="66" height="16"/><rect x="0" y="40" width="56" height="16"/>'
            '<rect x="110" y="0" width="16" height="100"/><rect x="110" y="0" width="68" height="16"/><rect x="110" y="40" width="60" height="16"/><rect x="110" y="84" width="68" height="16"/>'
            '<path fill-rule="evenodd" d="M222 0 H270 A29 29 0 0 1 270 58 H222 Z M238 16 H270 A13 13 0 0 1 270 42 H238 Z"/><rect x="222" y="0" width="16" height="100"/><path d="M258 42 L276.4 42 L302 100 L283.6 100 Z"/>'
            '<path fill-rule="evenodd" d="M346 0 H394 A29 29 0 0 1 394 58 H346 Z M362 16 H394 A13 13 0 0 1 394 42 H362 Z"/><rect x="346" y="0" width="16" height="100"/><path d="M382 42 L400.4 42 L426 100 L407.6 100 Z"/>'
            '<path fill-rule="evenodd" d="M521 -1.5 A51 51.5 0 1 1 520.99 -1.5 Z M521 14.5 A35 35.5 0 1 0 521.01 14.5 Z"/>'
            '<path d="M616 0 H635.2 L700 100 H680.8 Z"/><path d="M680.8 0 H700 L635.2 100 H616 Z"/></g></svg>')
STAGE = ('background:radial-gradient(ellipse 70% 60% at 50% 30%,#2b2922 0%,#141310 55%,#0a0907 100%)')


def page(name, w, h, body, extra_css=''):
    (OUT / f'{name}.html').write_text(
        f'<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="size" content="{w}x{h}">{FONTS}'
        f'<style>body{{margin:0;width:{w}px;height:{h}px;overflow:hidden;{STAGE};color:#f1eee5;font-family:Assistant,sans-serif}}{extra_css}</style>'
        f'</head><body>{body}</body></html>', encoding='utf-8')


# Profile picture — the mark alone, inside the circle crop every network applies.
page('profile-1080', 1080, 1080,
     f'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">{C.mark_svg("560px")}</div>')

# YouTube banner — everything that matters inside the 1546×423 safe area at the centre.
page('youtube-banner-2560x1440', 2560, 1440,
     f'''<div style="position:absolute;left:507px;top:508px;width:1546px;height:423px;display:flex;align-items:center;justify-content:center;gap:70px;direction:ltr">
       {C.mark_svg("250px")}
       <div style="display:flex;flex-direction:column;gap:34px">{WORDMARK.format(w="620px", c="#F1EEE5")}
         <div dir="rtl" style="font:400 72px/1 'Frank Ruhl Libre',serif;color:#a9c49f;text-align:right">אל תחשוב. תתאמן.</div></div>
     </div>''')

# Facebook cover (1640×624) — the mobile crop keeps the centre.
page('facebook-cover-1640x624', 1640, 624,
     f'''<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:56px;direction:ltr">
       {C.mark_svg("190px")}
       <div style="display:flex;flex-direction:column;gap:26px">{WORDMARK.format(w="470px", c="#F1EEE5")}
         <div dir="rtl" style="font:400 56px/1 'Frank Ruhl Libre',serif;color:#a9c49f;text-align:right">אל תחשוב. תתאמן.</div></div>
     </div>''')

# Gym poster — A3 portrait at ~212 dpi (2480×3508), QR to the site tagged with its source.
qr = segno.make('https://getferrox.com/?src=gym', error='m')
qr_svg = qr.svg_inline(dark='#131210', light='#f1eee5', scale=34, border=2)
page('gym-poster-a3', 2480, 3508,
     f'''<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:260px 200px 0;box-sizing:border-box;text-align:center">
       {C.mark_svg("420px")}
       <div style="margin-top:140px;font:400 250px/1.02 'Frank Ruhl Libre',serif;letter-spacing:-2px">מה עושים<br><span style="color:#a9c49f">היום באימון?</span></div>
       <div style="margin-top:90px;font:500 96px/1.35 Assistant,sans-serif;color:#a8a290;max-width:1900px">FERROX כותב לך שבוע אימונים שלם<br>ועומד לידך בכל סט.</div>
       <div style="margin-top:130px;display:flex;align-items:center;gap:110px;direction:ltr">
         <div style="border-radius:40px;overflow:hidden;line-height:0">{qr_svg}</div>
         <div dir="rtl" style="text-align:right;display:flex;flex-direction:column;gap:30px">
           <div style="font:700 110px/1.1 Assistant,sans-serif">סורקים ומתחילים</div>
           <div style="font:500 84px/1.2 Assistant,sans-serif;color:#a9c49f">14 אימונים חינם</div>
           <div style="font:500 70px/1 'IBM Plex Mono',monospace;color:#8b8474;direction:ltr;text-align:right">getferrox.com</div>
         </div>
       </div>
       <div style="position:absolute;bottom:170px;left:0;right:0;display:flex;justify-content:center;direction:ltr">{WORDMARK.format(w="760px", c="#8b8474")}</div>
     </div>''')
print('ok')

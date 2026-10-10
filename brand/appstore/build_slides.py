"""FERROX App Store screenshots, Hebrew and English — one HTML page per image; shoot with shoot.mjs.

Phone slides show REAL app screens captured from the Expo-web gallery (landing/src/img).
The lock screen, Dynamic Island and Apple Watch are redrawn from the Swift (brand/components.py).

    python brand/appstore/build_slides.py <out-dir>
"""
import base64
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
import components as C  # noqa: E402

OUT = pathlib.Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
IMG = HERE.parent / 'landing' / 'src' / 'img'
W, H = 1284, 2778
FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@500;600'
         '&family=Frank+Ruhl+Libre:wght@400&family=IBM+Plex+Mono:wght@400;500&display=swap">')


def img(name):
    return 'data:image/jpeg;base64,' + base64.b64encode((IMG / f'{name}.jpg').read_bytes()).decode()


def head(d):
    return f'''<!doctype html><html dir="{d}"><head><meta charset="utf-8">{FONTS}
<style>
 body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:#0b0a08;font-family:'Assistant',sans-serif;color:#f1eee5}}
 .bg{{position:absolute;inset:0;background:radial-gradient(ellipse 75% 34% at 50% 0%,rgba(241,238,229,.11),transparent 72%),linear-gradient(180deg,#1b1914 0%,#131210 42%,#0b0a08 100%)}}
 .horizon{{position:absolute;left:0;right:0;top:790px;height:2px;background:linear-gradient(90deg,rgba(169,196,159,0),rgba(169,196,159,.32) 15%,rgba(169,196,159,.32) 85%,rgba(169,196,159,0))}}
 .top{{position:absolute;top:140px;left:70px;right:70px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:36px}}
 h1{{margin:0;font:400 {132 if d == "rtl" else 118}px/1.02 'Frank Ruhl Libre',serif;letter-spacing:-1px}}
 h1 em{{font-style:normal;color:#a9c49f}}
 p{{margin:0;font:500 50px/1.3 'Assistant',sans-serif;color:#a8a290}}
 .phone{{position:absolute;left:50%;transform:translateX(-50%);top:900px;width:1010px;height:2186px;border-radius:150px;padding:22px;box-sizing:border-box;
   background:linear-gradient(160deg,#3a3731,#0c0b09 40%,#1c1a16);box-shadow:0 0 0 3px rgba(241,238,229,.08),0 -30px 140px rgba(0,0,0,.7)}}
 .phone .scr{{width:100%;height:100%;border-radius:128px;overflow:hidden;position:relative;background:#000}}
 .phone .scr img{{width:100%;height:100%;object-fit:cover;display:block}}
</style></head><body><div class="bg"></div><div class="horizon"></div>'''


def top(h, p):
    return f'<div class="top">{C.mark_svg("112px")}<h1>{h}</h1><p>{p}</p></div>'


def phone(inner):
    return f'<div class="phone"><div class="scr">{inner}</div></div>'


def lock(L, date):
    return f'''<div style="position:absolute;inset:0;background:radial-gradient(ellipse 90% 50% at 50% 28%,#2b2922,#0b0a08 75%)">
  <div style="position:absolute;top:150px;left:0;right:0;text-align:center;font:500 44px/1 'Assistant',sans-serif;color:rgba(241,238,229,.8)">{date}</div>
  <div style="position:absolute;top:215px;left:0;right:0;text-align:center;font:600 250px/1 'Assistant',sans-serif;color:rgba(241,238,229,.92);direction:ltr">9:41</div>
  <div style="position:absolute;left:0;right:0;top:1040px;display:flex;justify-content:center"><div style="zoom:2.45">{C.lock_card(1.0, L=L)}</div></div>
</div>'''


def island(L, screen, caption):
    return f'''<div style="position:absolute;inset:0"><img src="{img(screen)}" style="width:100%;height:100%;object-fit:cover;filter:brightness(.3)">
  <div style="position:absolute;left:0;right:0;top:30px;display:flex;justify-content:center"><div style="zoom:2.45">{C.island_expanded(1.0, L=L)}</div></div>
  <div style="position:absolute;left:0;right:0;top:860px;display:flex;justify-content:center"><div style="zoom:2.45">{C.island_compact(1.0, L=L)}</div></div>
  <div style="position:absolute;top:980px;left:60px;right:60px;text-align:center;font:500 40px/1.4 'Assistant',sans-serif;color:rgba(241,238,229,.6)">{caption}</div>
</div>'''


def watches(L):
    return f'''<div style="position:absolute;top:930px;left:0;right:0;display:flex;justify-content:center;direction:ltr">
  <div style="transform:rotate(-3deg)">{C.watch_case(3.2, C.watch_set(3.2, L))}</div>
</div>
<div style="position:absolute;top:1930px;left:40px;right:40px;display:flex;justify-content:space-between;direction:ltr">
  <div style="transform:rotate(-4deg)">{C.watch_case(2.2, C.watch_rest(2.2, L))}</div>
  <div style="transform:rotate(4deg)">{C.watch_case(2.2, C.watch_home(2.2, L))}</div>
</div>'''


SETS = {
    'he': (C.HE, [
        top('שבוע שלם,<br><em>כתוב בשבילך.</em>', 'לפי הימים, הציוד והמטרה שלך') + phone(f'<img src="{img("plan")}">'),
        top('הדמות מראה.<br><em>לא מתארת.</em>', 'כל תרגיל בקצב, בעומק ובטווח הנכונים') + phone(f'<img src="{img("set")}">'),
        top('הטלפון נשאר<br><em>בכיס.</em>', 'מנוחה והסט הבא, ישר ממסך הנעילה') + phone(lock(C.HE, 'יום רביעי, 16 בספטמבר')),
        top('המנוחה סופרת<br><em>בכל מקום.</em>', 'ב-Dynamic Island, גם מחוץ לאפליקציה') + phone(island(C.HE, 'set', 'וכך, מכווץ, כשעובדים באפליקציה אחרת')),
        top('הסט<br><em>על השעון.</em>', 'רושמים סט בלחיצה, והמנוחה סופרת על היד') + watches(C.HE),
        top('וגם<br><em>כשרצים.</em>', 'קצב, דופק ומרחק לכל קילומטר') + phone(f'<img src="{img("run")}">'),
        top('כל אימון<br><em>נסגר בכרטיס.</em>', 'טונות, זמן והחלטות, מוכן לצילום מסך') + phone(f'<img src="{img("poster")}">'),
    ]),
    'en': (C.EN, [
        top('A full week,<br><em>written for you.</em>', 'Around your days, your gym and your goal') + phone(f'<img src="{img("planen")}">'),
        top('The figure shows.<br><em>It doesn’t describe.</em>', 'Every lift at the right tempo, depth and range') + phone(f'<img src="{img("seten")}">'),
        top('Your phone stays<br><em>in your pocket.</em>', 'Rest and your next set, from the lock screen') + phone(lock(C.EN, 'Wednesday, September 16')),
        top('Rest counts<br><em>everywhere.</em>', 'In the Dynamic Island, even outside the app') + phone(island(C.EN, 'seten', 'And compact, while you’re in another app')),
        top('The set,<br><em>on your wrist.</em>', 'Log a set with a tap. Rest counts on your wrist') + watches(C.EN),
        top('Every lift,<br><em>closed out.</em>', 'And next week starts from what you did') + phone(f'<img src="{img("doneen")}">'),
        top('Every workout<br><em>ends on a card.</em>', 'Tonnage, time and decisions, ready to share') + phone(f'<img src="{img("posteren")}">'),
    ]),
}

for lang, (L, slides) in SETS.items():
    for i, body in enumerate(slides, 1):
        (OUT / f'slide-{lang}-{i}.html').write_text(head(L['dir']) + body + '</body></html>', encoding='utf-8')
    # The Apple Watch slot: bare 45 mm screens at 396 x 484.
    for i, fn in enumerate([C.watch_set, C.watch_rest, C.watch_home], 1):
        (OUT / f'watch-{lang}-{i}.html').write_text(
            f'<!doctype html><html><head><meta charset="utf-8">{FONTS}</head>'
            f'<body style="margin:0;width:396px;height:484px;overflow:hidden;background:#000">{fn(2.0, L, radius=False)}</body></html>',
            encoding='utf-8')
print('ok')

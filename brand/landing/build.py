"""Assemble the FERROX landing page: inline src/img/*.jpg as data URIs and draw the
lock card, Dynamic Island and watch from brand/components.py (redrawn from the Swift).

    python brand/landing/build.py   ->   brand/landing/ferrox-landing.html
"""
import base64
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
import components as C  # noqa: E402

src = (HERE / 'src' / 'index.html').read_text(encoding='utf-8')


def inline(m: re.Match) -> str:
    data = (HERE / 'src' / 'img' / f'{m.group(1)}.jpg').read_bytes()
    return 'data:image/jpeg;base64,' + base64.b64encode(data).decode()


blocks = {
    '<!--LA_HERO-->': f'<div class="hero-la">{C.lock_card(1.0, live=True)}</div>',
    '<!--DI_EXPANDED-->': f'<div class="di-wrap">{C.island_expanded(1.0, live=True)}</div>',
    '<!--LA_POCKET-->': '',
    '<!--WATCH-->': f'<div class="watches"><div class="w1">{C.watch_case(1.45, C.watch_set(1.45))}</div><div class="w2">{C.watch_case(1.15, C.watch_rest(1.15))}</div></div>',
}
for k, v in blocks.items():
    assert k in src, k
    src = src.replace(k, v)
out = re.sub(r'\{\{img:([a-z]+)\}\}', inline, src)
(HERE / 'ferrox-landing.html').write_text(out, encoding='utf-8')

# The deployable site: a real document around the same page, with the mark as favicon.
FAVICON = ("data:image/svg+xml," + "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%23131210'/>"
           "<g transform='translate(50 52) scale(.8) translate(-50 -45)'><path fill='%23F1EEE5' d='" + C.MARK_PATH + "'/><circle cx='50' cy='64' r='10' fill='%23A9C49F'/></g></svg>")
dist = HERE / 'dist'
dist.mkdir(exist_ok=True)
doc = [
    '<!doctype html>',
    '<html lang="he" dir="rtl">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="theme-color" content="#0b0a08">',
    '<meta property="og:title" content="FERROX">',
    '<meta property="og:description" content="אל תחשוב. תתאמן. מאמן אישי לחדר הכושר, שכותב לך את השבוע ועומד לידך בכל סט.">',
    f'<link rel="icon" href="{FAVICON}">',
    '</head>',
    '<body style="margin:0">',
    out,
    '</body>',
    '</html>',
]
(dist / 'index.html').write_text('\n'.join(doc), encoding='utf-8')
print(f'{len(out) // 1024} KB')

# ── the legal pages: /terms and /privacy, Hebrew then English, from src/legal.json ──
import html as _html  # noqa: E402
import json as _json  # noqa: E402

LEGAL = _json.loads((HERE / 'src' / 'legal.json').read_text(encoding='utf-8'))
WORDMARK = ('<svg viewBox="-2 -4 704 108" width="96" aria-label="FERROX" role="img"><g fill="#F1EEE5"><rect x="0" y="0" width="16" height="100"/><rect x="0" y="0" width="66" height="16"/><rect x="0" y="40" width="56" height="16"/><rect x="110" y="0" width="16" height="100"/><rect x="110" y="0" width="68" height="16"/><rect x="110" y="40" width="60" height="16"/><rect x="110" y="84" width="68" height="16"/><path fill-rule="evenodd" d="M222 0 H270 A29 29 0 0 1 270 58 H222 Z M238 16 H270 A13 13 0 0 1 270 42 H238 Z"/><rect x="222" y="0" width="16" height="100"/><path d="M258 42 L276.4 42 L302 100 L283.6 100 Z"/><path fill-rule="evenodd" d="M346 0 H394 A29 29 0 0 1 394 58 H346 Z M362 16 H394 A13 13 0 0 1 394 42 H362 Z"/><rect x="346" y="0" width="16" height="100"/><path d="M382 42 L400.4 42 L426 100 L407.6 100 Z"/><path fill-rule="evenodd" d="M521 -1.5 A51 51.5 0 1 1 520.99 -1.5 Z M521 14.5 A35 35.5 0 1 0 521.01 14.5 Z"/><path d="M616 0 H635.2 L700 100 H680.8 Z"/><path d="M680.8 0 H700 L635.2 100 H616 Z"/></g></svg>')
LEGAL_CSS = """
:root{--stage:#0b0a08;--ink0:#f1eee5;--ink2:#a8a290;--muted:#8b8474;--moss:#a9c49f;--line:rgba(241,238,229,.12);color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--stage);color:var(--ink0);font:17px/1.7 'Assistant','Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased}
.page{padding-inline:clamp(20px,5vw,48px);padding-block:32px 72px;background:radial-gradient(ellipse 60% 420px at 50% -60px,rgba(241,238,229,.08),transparent 70%)}
.wrap{max-width:720px;margin-inline:auto}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:40px;direction:ltr}
header a{display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit}
nav{display:flex;gap:18px;font-size:15px;direction:rtl}
nav a{color:var(--ink2);text-decoration:none}nav a:hover,nav a[aria-current]{color:var(--ink0)}
h1{font:400 clamp(40px,7vw,60px)/1.05 'Frank Ruhl Libre',Georgia,serif;margin:0 0 10px}
.stamp{color:var(--muted);font-size:14px;margin:0 0 36px}
h2{font:600 17px/1.4 'Assistant',sans-serif;margin:30px 0 6px;color:#d8d3c4}
p{color:var(--ink2);margin:0}
section+section{margin-top:72px;padding-top:48px;border-top:1px solid var(--line)}
a{color:var(--moss)}
:focus-visible{outline:2px solid var(--moss);outline-offset:3px}
"""


def legal_page(key: str) -> str:
    doc_ = LEGAL[key]
    parts = []
    for lang in ('he', 'en'):
        d = 'rtl' if lang == 'he' else 'ltr'
        body = ''.join(f'<h2>{_html.escape(s[lang][0])}</h2><p>{_html.escape(s[lang][1])}</p>' for s in doc_['sections'])
        parts.append(f'<section lang="{lang}" dir="{d}" id="{lang}"><h1>{_html.escape(doc_["title"][lang])}</h1>'
                     f'<p class="stamp">{_html.escape(LEGAL["updated"][lang])}</p>{body}</section>')
    other = 'privacy' if key == 'terms' else 'terms'
    return '\n'.join([
        '<!doctype html>', '<html lang="he" dir="rtl">', '<head>', '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        f'<title>FERROX · {doc_["title"]["en"]}</title>', f'<link rel="icon" href="{FAVICON}">',
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600&family=Frank+Ruhl+Libre:wght@400&display=swap">',
        f'<style>{LEGAL_CSS}</style>', '</head>', '<body>', '<div class="page"><div class="wrap">',
        f'<header><a href="/" aria-label="FERROX">{C.mark_svg("30px")}{WORDMARK}</a>'
        f'<nav><a href="/{key}" aria-current="page">{_html.escape(doc_["title"]["he"])}</a>'
        f'<a href="/{other}">{_html.escape(LEGAL[other]["title"]["he"])}</a><a href="#en">English</a></nav></header>',
        *parts, '</div></div>', '</body>', '</html>'])


for key in ('terms', 'privacy'):
    (dist / key).mkdir(exist_ok=True)
    (dist / key / 'index.html').write_text(legal_page(key), encoding='utf-8')
print('legal pages: /terms /privacy')

# ── /press: the press kit — who we are in three lines, and the files a journalist needs ──
import shutil as _shutil  # noqa: E402

BRAND = HERE.parent
press = dist / 'press'
files = press / 'files'
files.mkdir(parents=True, exist_ok=True)
KIT = [
    (BRAND / 'logo' / 'export' / 'ferrox-mark.svg', 'ferrox-mark.svg', 'הסימן · SVG'),
    (BRAND / 'logo' / 'export' / 'ferrox-mark-ink.svg', 'ferrox-mark-ink.svg', 'הסימן על רקע בהיר · SVG'),
    (BRAND / 'logo' / 'export' / 'ferrox-wordmark.svg', 'ferrox-wordmark.svg', 'שם המותג · SVG'),
    (BRAND / 'logo' / 'export' / 'ferrox-app-icon.svg', 'ferrox-app-icon.svg', 'אייקון האפליקציה · SVG'),
    (HERE.parent.parent / 'code' / 'mobile' / 'assets' / 'icon.png', 'ferrox-app-icon-1024.png', 'אייקון האפליקציה · PNG 1024'),
]
for i in range(1, 8):
    KIT.append((BRAND / 'appstore' / 'screenshots' / 'iphone-he' / f'ferrox-he-{i}.png', f'ferrox-he-{i}.png', f'צילום מסך {i} · עברית'))
for i in range(1, 8):
    KIT.append((BRAND / 'appstore' / 'screenshots' / 'iphone-en' / f'ferrox-en-{i}.png', f'ferrox-en-{i}.png', f'Screenshot {i} · English'))
rows = []
for src_path, name, label in KIT:
    _shutil.copyfile(src_path, files / name)
    rows.append(f'<li><a href="/press/files/{name}" download>{_html.escape(label)}</a><span class="num">{name}</span></li>')
PRESS_CSS = LEGAL_CSS + """
ul.kit{list-style:none;margin:28px 0 0;padding:0;border-top:1px solid var(--line)}
ul.kit li{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--line)}
ul.kit a{text-decoration:none;color:var(--ink0)}ul.kit a:hover{color:var(--moss)}
.num{font-family:'IBM Plex Mono',monospace;color:var(--muted);font-size:13px;direction:ltr}
.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 28px;margin:26px 0 0}
.facts b{display:block;color:var(--ink0);font-weight:600}
@media(max-width:560px){.facts{grid-template-columns:minmax(0,1fr)}}
"""
press_html = '\n'.join([
    '<!doctype html>', '<html lang="he" dir="rtl">', '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<title>FERROX · Press</title>', f'<link rel="icon" href="{FAVICON}">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600&family=Frank+Ruhl+Libre:wght@400&family=IBM+Plex+Mono:wght@500&display=swap">',
    f'<style>{PRESS_CSS}</style>', '</head>', '<body>', '<div class="page"><div class="wrap">',
    f'<header><a href="/" aria-label="FERROX">{C.mark_svg("30px")}{WORDMARK}</a><nav><a href="/press" aria-current="page">עיתונות</a><a href="/privacy">פרטיות</a><a href="/terms">תנאי שימוש</a></nav></header>',
    '<section lang="he" dir="rtl"><h1>ערכת עיתונות</h1><p class="stamp">FERROX · מאמן אישי לחדר הכושר, ל-iPhone ול-Apple Watch</p>',
    '<p>FERROX כותב לכל מתאמן שבוע אימונים שלם לפי הימים, הציוד והמטרה שלו, מראה כל תרגיל על דמות תלת-ממדית שזזה בקצב ובטווח הנכונים, ומנהל את האימון מהאוזניות, מהשעון וממסך הנעילה, כך שהטלפון נשאר בכיס. עברית ואנגלית. נבנה בישראל על ידי מייסד אחד.</p>',
    '<div class="facts"><div><b>זמינות</b>App Store, iPhone ו-Apple Watch</div><div><b>מחיר</b>14 אימונים ראשונים (בתוך 30 יום) חינם, ואז מנוי FERROX Pro</div>'
    '<div><b>מייסד</b>עופק פרץ</div><div><b>יצירת קשר</b><a href="mailto:ofek34458@gmail.com">ofek34458@gmail.com</a></div></div>',
    '<h2>קבצים להורדה</h2>', f'<ul class="kit">{"".join(rows)}</ul>', '</section>',
    '</div></div>', '</body>', '</html>'])
(press / 'index.html').write_text(press_html, encoding='utf-8')
print('press kit: /press', len(KIT), 'files')

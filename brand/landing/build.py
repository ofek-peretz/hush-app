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
    '<meta property="og:description" content="אל תחשוב. תתאמן. מאמן כוח שכותב לך את השבוע ועומד לידך בכל סט.">',
    f'<link rel="icon" href="{FAVICON}">',
    '</head>',
    '<body style="margin:0">',
    out,
    '</body>',
    '</html>',
]
(dist / 'index.html').write_text('\n'.join(doc), encoding='utf-8')
print(f'{len(out) // 1024} KB')

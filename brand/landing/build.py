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
print(f'{len(out) // 1024} KB')

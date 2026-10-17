"""The FERROX store-listing review page: screenshots (he/en, iPhone + Watch) and the metadata.

    python brand/appstore/build_listing.py  ->  brand/appstore/ferrox-store-listing.html
"""
import base64
import html
import io
import json
import pathlib

from PIL import Image

HERE = pathlib.Path(__file__).parent
M = json.loads((HERE / 'metadata.json').read_text(encoding='utf-8'))
SHOTS = HERE / 'screenshots'
LIMITS = {'name': 30, 'subtitle': 30, 'promotionalText': 170, 'keywords': 100, 'description': 4000}
LABELS = {'name': 'שם', 'subtitle': 'כותרת משנה', 'promotionalText': 'טקסט קידום', 'keywords': 'מילות מפתח', 'description': 'תיאור'}


def thumb(path, width):
    im = Image.open(path).convert('RGB')
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=80)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()


def strip(folder, width, cls):
    files = sorted((SHOTS / folder).glob('*.png'))
    return ''.join(f'<figure class="{cls}"><img src="{thumb(f, width)}" alt="{f.stem}"><figcaption class="num">{i}</figcaption></figure>'
                   for i, f in enumerate(files, 1))


def fields(lang):
    out = []
    for k in LIMITS:
        v = M[lang][k]
        fid = f'{lang}-{k}'
        long = ' long' if k == 'description' else ''
        out.append(f'<div class="field"><div class="fhead"><span class="flabel">{LABELS[k]}</span>'
                   f'<span class="count num">{len(v)}/{LIMITS[k]}</span>'
                   f'<button type="button" class="copy" data-target="{fid}">העתקה</button></div>'
                   f'<pre id="{fid}" class="val{long}" dir="{"rtl" if lang == "he" else "ltr"}">{html.escape(v)}</pre></div>')
    return ''.join(out)


MARK = ('<svg viewBox="9.5 16 81 59" aria-hidden="true"><path fill="#F1EEE5" d="M62 60 C79 60 88 46 89.5 17 C82 34 74 44 61 44 L39 44 '
        'C26 44 18 34 10.5 17 C12 46 21 60 38 60 L36.584 60 A14 14 0 0 1 63.416 60 Z"/><circle cx="50" cy="64" r="10" fill="#A9C49F"/></svg>')

page = f'''<title>FERROX Store Listing</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Frank+Ruhl+Libre:wght@400;500&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
:root{{--stage:#131210;--lit:#1b1914;--cream:#f1eee5;--cream2:#a8a290;--muted:#8b8474;--moss:#a9c49f;--line:rgba(241,238,229,.12);color-scheme:dark}}
*{{box-sizing:border-box}}
body{{background:var(--stage);color:var(--cream);font:17px/1.6 'Assistant','Segoe UI',Arial,sans-serif}}
.page{{direction:rtl;padding-inline:clamp(16px,4vw,56px);padding-block:44px 80px;background:linear-gradient(180deg,var(--lit),var(--stage) 520px)}}
.wrap{{max-width:1240px;margin-inline:auto;display:flex;flex-direction:column;gap:64px}}
header{{display:flex;align-items:center;gap:20px}}
header svg{{width:60px;height:auto;flex-shrink:0}}
h1{{font:400 clamp(34px,4.4vw,52px)/1.1 'Frank Ruhl Libre',serif;margin:0}}
h2{{font:400 30px/1.2 'Frank Ruhl Libre',serif;margin:0 0 6px}}
.sub{{color:var(--cream2);margin:6px 0 0}}
.num{{font-family:'IBM Plex Mono',Menlo,monospace;font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}}
.status{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 40px;border-top:1px solid var(--line)}}
.status div{{display:flex;gap:14px;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--line)}}
.status b{{font-weight:600;min-width:8.5em}}
.status span{{color:var(--cream2)}}
.ok::before,.todo::before{{content:"";width:9px;height:9px;border-radius:50%;flex-shrink:0;transform:translateY(-1px)}}
.ok::before{{background:var(--moss)}}
.todo::before{{box-shadow:inset 0 0 0 2px #d8b86a}}
.shots{{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px}}
figure{{margin:0;flex:0 0 auto;display:flex;flex-direction:column;gap:8px;align-items:center}}
figure.p{{width:clamp(140px,13vw,168px)}}
figure.w{{width:150px}}
figure img{{width:100%;border-radius:12px;display:block;box-shadow:0 0 0 1px var(--line)}}
figcaption{{color:var(--muted);font-size:13px}}
.note{{color:var(--muted);font-size:15px;margin:12px 0 0;max-width:64em}}
.langs{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:48px}}
.field{{border-top:1px solid var(--line);padding-block:14px}}
.fhead{{display:flex;align-items:center;gap:12px;margin-bottom:8px}}
.flabel{{font-weight:700;flex-grow:1}}
.count{{color:var(--muted);font-size:13px}}
.copy{{font:600 14px 'Assistant',sans-serif;background:transparent;color:var(--cream2);border:1px solid var(--line);border-radius:999px;padding:5px 14px;cursor:pointer}}
.copy:hover{{color:var(--cream)}}
.copy:focus-visible{{outline:2px solid var(--moss);outline-offset:2px}}
.copy.done{{color:var(--moss);border-color:var(--moss)}}
.val{{margin:0;white-space:pre-wrap;font:17px/1.6 'Assistant',sans-serif}}
.val.long{{max-height:320px;overflow:auto;color:var(--cream2);font-size:16px}}
@media (max-width:820px){{.langs,.status{{grid-template-columns:minmax(0,1fr)}}}}
</style>
<div class="page" lang="he"><div class="wrap">
<header>{MARK}<div><h1>FERROX ב-App Store</h1><p class="sub">מה כבר מוזן ב-App Store Connect, ומה נשאר.</p></div></header>

<section><h2>מצב ב-App Store Connect</h2><div class="status">
<div class="ok"><b>שם וכותרת משנה</b><span>FERROX: Gym Workout Planner · FERROX: מאמן אישי לחדר כושר</span></div>
<div class="ok"><b>תיאור, קידום, מילות מפתח</b><span>אנגלית ועברית, כולל "14 אימונים בתוך 30 יום"</span></div>
<div class="ok"><b>צילומי מסך</b><span>7 לאייפון ו-3 לשעון בכל שפה, בסדר הנכון</span></div>
<div class="ok"><b>קישורים</b><span>getferrox.com, תנאים ופרטיות בדומיין, בשתי השפות</span></div>
<div class="ok"><b>מנויים</b><span>FERROX Pro, שמות, קבוצה ותמונת paywall לסקירה</span></div>
<div class="ok"><b>סקירת Apple</b><span>בלי חשבון דמו, הערות וטלפון ליצירת קשר</span></div>
<div class="ok"><b>מחיר וזמינות</b><span>חינם, 175 מדינות</span></div>
<div class="ok"><b>דירוג גיל וזכויות</b><span>+9, בלי תוכן של צד שלישי</span></div>
<div class="todo"><b>בילד 74</b><span>מספר הבילד מוכן. לבנות, לבחור ב-1.0 ולשלוח לסקירה</span></div>
<div class="todo"><b>Google Sign-In</b><span>ללחוץ Publish app ב-Google Auth Platform (כרגע רק משתמשי בדיקה יכולים להתחבר)</span></div>
</div></section>

<section><h2>iPhone · עברית</h2><div class="shots">{strip('iphone-he', 336, 'p')}</div></section>
<section><h2>iPhone · English</h2><div class="shots">{strip('iphone-en', 336, 'p')}</div>
<p class="note">1284×2778, מתאים למקום של 6.5″ ב-App Store Connect. בכל סט, 5 מתוך 7 הצילומים מראים מסכים אמיתיים של האפליקציה. במסך הנעילה, ב-Dynamic Island ובשעון, הרכיבים צוירו מחדש לפי קוד ה-Swift, עם נתוני דוגמה.</p></section>
<section><h2>Apple Watch</h2><div class="shots">{strip('watch-he', 300, 'w')}{strip('watch-en', 300, 'w')}</div>
<p class="note">396×484 (45 מ״מ). שלושה בעברית ושלושה באנגלית: סט, מנוחה, והמסך הראשי.</p></section>

<section class="langs"><div><h2>עברית</h2>{fields('he')}</div><div><h2>English</h2>{fields('en')}</div></section>
</div></div>
<script>
document.querySelectorAll('.copy').forEach(function(b){{b.addEventListener('click',function(){{
 var t=document.getElementById(b.dataset.target).textContent;
 var ok=function(){{b.textContent='הועתק';b.classList.add('done');setTimeout(function(){{b.textContent='העתקה';b.classList.remove('done')}},1600)}};
 try{{navigator.clipboard.writeText(t).then(ok,function(){{ok()}})}}catch(e){{ok()}}
}})}});
</script>'''
(HERE / 'ferrox-store-listing.html').write_text(page, encoding='utf-8')
print(len(page) // 1024, 'KB')

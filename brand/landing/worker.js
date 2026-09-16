/**
 * getferrox.com — the static site, plus the two dynamic doors a WhatsApp invite needs. (2026-09-16)
 *
 *   /.well-known/apple-app-site-association  → iOS opens FERROX directly for /pair links
 *   /pair?c=CODE                              → the page a phone WITHOUT the app lands on
 *
 * Everything else is the static build in dist/ (brand/landing/build.py).
 *
 * The identity worker serves the same pair page and association on its own origin, for invites
 * sent before the link moved here. The app IDs and the path scope must stay identical to it.
 */
const APP_ID = 'T6ZRTBRT2U.com.hushfitness.app';
const APP_STORE_URL = 'https://apps.apple.com/app/id6780763348';

const AASA = JSON.stringify({ applinks: { details: [{ appIDs: [APP_ID], components: [{ '/': '/pair*' }] }] } });

/** The room code alphabet is A–Z2–9; anything else is not a code and is not echoed into HTML. */
const safeCode = (raw) => (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

const COPY = {
  he: {
    dir: 'rtl',
    title: 'בוא נתאמן ביחד ב־FERROX',
    lead: 'מוט אחד, בתורות. המשקלים נשארים אישיים.',
    open: 'לפתוח ב־FERROX',
    get: 'להוריד את FERROX',
    code: 'או להקליד באפליקציה את הקוד',
  },
  en: {
    dir: 'ltr',
    title: "Let's train together on FERROX",
    lead: 'One bar, taking turns. The weights stay personal.',
    open: 'Open in FERROX',
    get: 'Get FERROX',
    code: 'Or enter this code in the app',
  },
};

function pairPage(code, lang) {
  const c = COPY[lang];
  return `<!doctype html><html lang="${lang}" dir="${c.dir}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${c.title}</title>
<meta property="og:title" content="${c.title}">
<meta property="og:description" content="${c.lead}">
<meta property="og:image" content="https://getferrox.com/press/files/ferrox-app-icon-1024.png">
<meta name="apple-itunes-app" content="app-id=6780763348">
<style>
 body{margin:0;background:#131210;color:#f1eee5;font:400 17px/1.5 -apple-system,system-ui,sans-serif;
      display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
 main{max-width:22rem;width:100%}
 h1{font:400 30px/1.2 Georgia,serif;margin:0 0 8px}
 p{color:#a8a290;margin:0 0 28px}
 a{display:block;text-align:center;text-decoration:none;border-radius:19px;padding:18px;margin-bottom:12px;font-weight:600}
 .primary{background:#a9c49f;color:#131210}
 .ghost{border:1px solid rgba(241,238,229,.18);color:#f1eee5}
 .label{margin:28px 0 6px;color:#8b8474;font-size:15px}
 .code{font:600 34px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;direction:ltr}
</style></head><body><main>
 <h1>${c.title}</h1>
 <p>${c.lead}</p>
 <a class="primary" href="hush://pair?c=${code}">${c.open}</a>
 <a class="ghost" href="${APP_STORE_URL}">${c.get}</a>
 ${code ? `<div class="label">${c.code}</div><div class="code">${code}</div>` : ''}
</main></body></html>`;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/.well-known/apple-app-site-association') {
      return new Response(AASA, { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/pair' || url.pathname === '/pair/') {
      const lang = /^he|,\s*he/i.test(req.headers.get('accept-language') || '') ? 'he' : 'en';
      return new Response(pairPage(safeCode(url.searchParams.get('c')), lang), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    return env.ASSETS.fetch(req);
  },
};

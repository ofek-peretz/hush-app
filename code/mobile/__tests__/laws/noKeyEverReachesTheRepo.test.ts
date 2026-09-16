// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';

/**
 * ════ NO KEY EVER REACHES THE REPO ════
 *
 * The Gemini key lives in Cloudflare's secret store and nowhere else. This is the law that says so
 * in a way nobody has to remember.
 *
 * It is worth a test rather than a note because of how the mistake actually happens: not by
 * carelessness, but at 1am while something will not work — a key pasted into a constant "just to
 * see if that is the problem", a `.dev.vars` created for a local run, a `wrangler` log committed
 * with everything else. Any of those, once, and the key is in the history for ever. Rotating is the
 * only fix, and you only rotate what you noticed.
 *
 * The scan is for the SHAPES a live credential takes, not for the word "key" — a variable named
 * `apiKey` is normal and harmless; a forty-character Google credential sitting in a string is not.
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..');

/** Directories with nothing of ours in them. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'ios', 'android', '.expo', 'coverage']);

/**
 * What a live credential looks like.
 *
 * `AIza…` is Google's API-key prefix; the others are the neighbouring services this project touches,
 * because the mistake is about pasting A secret, not about which one.
 */
const SHAPES: { name: string; re: RegExp }[] = [
  { name: 'google api key', re: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: 'anthropic key', re: /sk-ant-[0-9A-Za-z_-]{20,}/ },
  { name: 'openai key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'github token', re: /gh[pousr]_[0-9A-Za-z]{30,}/ },
  { name: 'cloudflare token', re: /\bv1\.0-[0-9a-f]{40,}/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

function files(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    // Text we author. A binary asset cannot hold a pasted key by accident.
    else if (/\.(ts|tsx|js|jsx|json|md|yaml|yml|toml|sh|ps1|txt|swift|plist)$/i.test(e.name)) out.push(p);
  }
  return out;
}

describe('no key ever reaches the repo', () => {
  it('finds files to check at all — a silently empty sweep proves nothing', () => {
    expect(files(ROOT).length).toBeGreaterThan(200);
  });

  it('contains nothing shaped like a live credential', () => {
    const found: string[] = [];
    for (const file of files(ROOT)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const { name, re } of SHAPES) {
        if (re.test(text)) found.push(`${path.relative(ROOT, file).replace(/\\/g, '/')} — ${name}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('ignores the files that hold a secret by convention', () => {
    // `.dev.vars` is wrangler's local-secret file and is created the first time anyone runs the
    // Worker locally. It must never be a commit, and the ignore is the only thing standing there.
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    for (const pattern of ['.dev.vars', '.wrangler/', '.env']) {
      expect({ pattern, ignored: ignore.includes(pattern) }).toEqual({ pattern, ignored: true });
    }
  });

  it('keeps the Worker reading its key from the environment and nowhere else', () => {
    // The one file that touches the key. It may name the variable; it may never hold a value.
    const worker = fs.readFileSync(path.join(ROOT, 'server', 'worker.ts'), 'utf8');
    expect(worker).toContain('env.GEMINI_API_KEY');
    // No assignment of a literal to anything key-shaped — `GEMINI_API_KEY = "…"`, `apiKey: '…'`.
    expect(worker).not.toMatch(/(GEMINI_API_KEY|HUSH_TOKEN|apiKey)\s*[:=]\s*['"][^'"]{8,}/);
  });
});

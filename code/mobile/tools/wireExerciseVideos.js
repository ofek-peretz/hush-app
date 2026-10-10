/**
 * ════ WIRE A PURCHASED EXERCISE-VIDEO PACK INTO THE APP (2026-08-24) ════
 *
 * The research (competitive report §2, updated) recommends MoveKit Complete ($299 one-time,
 * explicit paid-app license, one consistent 3D style, loopable MP4s — fallback: Exercise
 * Animatic ~$329; budget: GymVisual GIFs ~$106. NEVER gym-animations.com — documented scam).
 *
 * Once the pack is downloaded, this script does the rest:
 *
 *   node tools/wireExerciseVideos.js <folder-with-purchased-mp4s>
 *
 * 1 · matches every file name against the 118-exercise catalog — id tokens, canonical names and
 *     the import matcher's own synonyms ("db press" finds Dumbbell Bench Press);
 * 2 · copies matches to assets/exercise-videos/<exerciseId>.mp4;
 * 3 · prints the EXERCISE_VIDEO map body to paste into src/platform/media/exerciseVideo.ts,
 *     plus the unmatched catalog ids (buy/rename those) and unmatched files (spares).
 *
 * Matching is deliberately conservative: an ambiguous file (two candidate ids) is reported, never
 * guessed — a wrong demo under a lift is worse than a vector fallback.
 */

//

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'exercise-videos');

/** The catalog, read from source so the script never drifts from the app. */
function readCatalog() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'data', 'exercises.ts'), 'utf8');
  const out = [];
  // A line-oriented pass — each catalog entry is one line in exercises.ts.
  for (const line of src.split('\n')) {
    const id = line.match(/\bid: '([^']+)'/);
    const name = line.match(/\bname: '([^']+)'/);
    if (!id || !name || !line.includes("tier:")) continue;
    const syn = line.match(/synonyms: \[([^\]]*)\]/);
    const synonyms = syn ? [...syn[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    out.push({ id: id[1], name: name[1], synonyms });
  }
  return out;
}

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/\.(mp4|mov|gif|webm)$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function tokens(s) {
  return new Set(norm(s).split(' ').filter(Boolean));
}

function scoreMatch(fileTokens, ex) {
  const candidates = [ex.id.replace(/_/g, ' '), ex.name, ...ex.synonyms];
  let best = 0;
  for (const c of candidates) {
    const ct = tokens(c);
    if (ct.size === 0) continue;
    let hit = 0;
    for (const t of ct) if (fileTokens.has(t)) hit++;
    const score = hit / ct.size + (hit === ct.size && ct.size === fileTokens.size ? 0.5 : 0);
    if (score > best) best = score;
  }
  return best;
}

function main() {
  const folder = process.argv[2];
  if (!folder || !fs.existsSync(folder)) {
    console.error('usage: node tools/wireExerciseVideos.js <folder-with-purchased-mp4s>');
    process.exit(1);
  }
  const catalog = readCatalog();
  const files = fs.readdirSync(folder).filter((f) => /\.(mp4|mov|gif|webm)$/i.test(f));
  console.log(`catalog: ${catalog.length} exercises · files: ${files.length}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wired = new Map(); // exerciseId → file
  const ambiguous = [];
  const unmatchedFiles = [];

  for (const f of files) {
    const ft = tokens(f);
    const scored = catalog
      .map((ex) => ({ ex, score: scoreMatch(ft, ex) }))
      .filter((x) => x.score >= 1) // every token of one candidate name matched
      .sort((a, b) => b.score - a.score);
    if (scored.length === 0) {
      unmatchedFiles.push(f);
      continue;
    }
    if (scored.length > 1 && scored[0].score === scored[1].score && scored[0].ex.id !== scored[1].ex.id) {
      ambiguous.push({ file: f, between: [scored[0].ex.id, scored[1].ex.id] });
      continue;
    }
    const id = scored[0].ex.id;
    if (wired.has(id)) continue; // first (best-named) file wins; spares are reported below
    fs.copyFileSync(path.join(folder, f), path.join(OUT_DIR, `${id}.mp4`));
    wired.set(id, f);
  }

  console.log(`\nwired: ${wired.size} / ${catalog.length}`);
  console.log('\n── paste into EXERCISE_VIDEO (src/platform/media/exerciseVideo.ts) ──');
  for (const id of [...wired.keys()].sort()) {
    console.log(`  ${id}: { kind: 'bundled', module: require('../../../assets/exercise-videos/${id}.mp4') },`);
  }
  const missing = catalog.filter((ex) => !wired.has(ex.id)).map((ex) => `${ex.id} (${ex.name})`);
  if (missing.length) console.log(`\n── NOT COVERED (${missing.length}) — buy or rename ──\n  ${missing.join('\n  ')}`);
  if (ambiguous.length) console.log(`\n── AMBIGUOUS — rename to the exercise id ──\n  ${ambiguous.map((a) => `${a.file} ↔ ${a.between.join(' / ')}`).join('\n  ')}`);
  if (unmatchedFiles.length) console.log(`\n── UNMATCHED FILES (spares) ──\n  ${unmatchedFiles.slice(0, 40).join('\n  ')}`);
}

main();

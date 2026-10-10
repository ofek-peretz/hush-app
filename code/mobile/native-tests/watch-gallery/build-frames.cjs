/*
 * ════ THE WRIST, ON GLASS, WITHOUT A BUILD ════
 *
 * The watch target has never been SEEN from this repository: no Swift compiles on the machine the
 * code is written on, and every wrist law reads source. `watch-gallery` runs the real screens in a
 * watchOS simulator on CI and photographs them (see `render.sh`, `.github/workflows/watch-gallery.yml`).
 *
 * This file writes the fixtures: the envelopes the PHONE would send, in the phone's own shape
 * (`platform/watch/protocol.ts` / `platform/sessionMirror.ts`) and in her own language — the copy
 * pack is built from `he.json` exactly as `platform/watch/watchCopyPack.ts` builds it. They go
 * through the wrist's real decoder and the real `WatchModel.apply`, so what is photographed is the
 * screen a phone frame produces, not a mock of one.
 *
 * `@REST_END@` / `@HOLD_END@` are stamped by the app at launch (a clock relative to "now").
 *
 *   node native-tests/watch-gallery/build-frames.cjs <out.swift>
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const he = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'locales', 'he.json'), 'utf8'));

// ── the copy pack, as the phone builds it ──────────────────────────────────────────────────────
const s = {};
for (const [k, v] of Object.entries(he.watch)) if (!k.endsWith('_female') && typeof v === 'string' && v.length > 0) s[k] = v;
const MUSCLES = ['Chest', 'Shoulders', 'Triceps', 'Back', 'Biceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'];
const m = Object.fromEntries(MUSCLES.map((k) => [k, he.muscle[k]]));
const copy = { v: 1, locale: 'he', rtl: true, s, m };

// ── the frames ─────────────────────────────────────────────────────────────────────────────────
let seq = 0;
const envelope = (body) => ({ v: 1, type: 'session_state', authoritySeq: (seq += 1), authorityEpoch: 1760000000000, sentAt: '2026-10-10T10:00:00.000Z', copy, ...body });

const base = {
  schema: 1,
  setLabel: '',
  totalSets: 18,
  canMarkBusy: false,
  liftIndex: 2,
  liftCount: 6,
  liveSets: 4,
  workoutName: 'פלג גוף עליון א׳',
};
const BENCH = 'לחיצת חזה במוט';
const INCLINE = 'לחיצת חזה בשיפוע עם משקולות יד';
const ROW = 'חתירה בפולי בישיבה';

const lobby = {
  workoutId: 'upper-a',
  workoutName: 'פלג גוף עליון א׳',
  muscles: '',
  lifts: 6,
  durationLabel: '57 דק׳',
  resting: false,
  workouts: [
    { id: 'lower-a', name: 'פלג גוף תחתון א׳', lifts: 5, done: true },
    { id: 'upper-a', name: 'פלג גוף עליון א׳', lifts: 6 },
    { id: 'lower-b', name: 'פלג גוף תחתון ב׳', lifts: 5 },
    { id: 'upper-b', name: 'פלג גוף עליון ב׳', lifts: 6 },
  ],
};

const set = (over) => envelope({ mirror: { ...base, phase: 'active_set', exerciseName: BENCH, exerciseGroup: 'Chest', setNumber: 1, setsInExercise: 3, globalIndex: 3, targetWeight: 60, targetReps: 8, targetRepsHi: 10, loadSetup: { style: 'barbell', perSide: 20, barKg: 20 }, ...over } });
const rest = (over) => envelope({ mirror: { ...base, phase: 'rest_inter', exerciseName: BENCH, exerciseGroup: 'Chest', setNumber: 1, setsInExercise: 3, globalIndex: 3, targetWeight: 60, targetReps: 8, targetRepsHi: 10, nextSetNumber: 2, nextSetsInExercise: 3, nextTargetWeight: 60, nextTargetReps: 8, setsSoFar: [10], loadsSoFar: [60], restEndsAt: '@REST_END@', restRemainingS: 70, restTotalS: 90, ...over } });

const frames = {
  // Home.
  '01-home': envelope({ lobby }),
  '01b-home-first': envelope({ lobby: { ...lobby, firstWorkout: true } }),
  // The live set, in the states that differ in what they draw.
  '02-set-first': set({ globalIndex: 0, liftIndex: 1 }),
  '03-set-history': set({ setNumber: 2, setsSoFar: [10], loadsSoFar: [60], lastReps: [9, 8, 8], lastLoadKg: 60 }),
  '04-set-moved': set({ setNumber: 3, targetWeight: 62.5, loadSetup: { style: 'barbell', perSide: 21.25, barKg: 20 }, setsSoFar: [10, 10], loadsSoFar: [60, 60], lastReps: [9, 9, 8], lastLoadKg: 60 }),
  '05-set-dumbbell': set({ exerciseName: INCLINE, setNumber: 1, setsInExercise: 4, targetWeight: 18, targetReps: 10, targetRepsHi: 12, loadSetup: { style: 'dumbbell', perHand: 18 }, lastReps: [12, 11, 10, 10], lastLoadKg: 16 }),
  '06-set-bodyweight': set({ exerciseName: 'מתח', exerciseGroup: 'Back', setNumber: 2, targetWeight: null, targetReps: 6, targetRepsHi: 8, loadSetup: null, setsSoFar: [8], loadsSoFar: [null], lastReps: [7, 6, 6] }),
  '07-set-warmup': set({ isWarmup: true, setNumber: 1, setsInExercise: 2, targetWeight: 30, targetReps: 8, targetRepsHi: null, loadSetup: { style: 'barbell', perSide: 5, barKg: 20 } }),
  '08-set-heavy': set({ exerciseName: 'דדליפט', exerciseGroup: 'Hamstrings', setNumber: 2, setsInExercise: 5, targetWeight: 142.5, targetReps: 3, targetRepsHi: 5, loadSetup: { style: 'barbell', perSide: 61.25, barKg: 20 }, setsSoFar: [5], loadsSoFar: [140], lastReps: [5, 5, 4, 4, 3], lastLoadKg: 140 }),
  // A hold: before its start, and running.
  '09-hold-wait': set({ exerciseName: 'פלאנק', exerciseGroup: 'Core', setNumber: 1, setsInExercise: 1, targetWeight: null, targetReps: 1, targetRepsHi: null, loadSetup: null, holdSeconds: 45 }),
  '10-hold-run': set({ exerciseName: 'פלאנק', exerciseGroup: 'Core', setNumber: 1, setsInExercise: 1, targetWeight: null, targetReps: 1, targetRepsHi: null, loadSetup: null, holdSeconds: 45, holdEndsAt: '@HOLD_END@' }),
  // The rests.
  '11-rest': rest({}),
  '12-rest-long-name': rest({ exerciseName: INCLINE, restIsLearned: true }),
  '13-rest-moved': rest({ nextTargetWeight: 62.5 }),
  '14-crossing': envelope({ mirror: { ...base, phase: 'rest_transition', exerciseName: BENCH, exerciseGroup: 'Chest', setNumber: 3, setsInExercise: 3, globalIndex: 5, targetWeight: 60, targetReps: 8, targetRepsHi: 10, completedExerciseName: BENCH, nextExerciseName: INCLINE, nextExerciseGroup: 'Chest', nextTargetWeight: 18, nextTargetReps: 10, nextLoadDeltaKg: 2, nextSetNumber: 1, nextSetsInExercise: 4, restEndsAt: '@REST_END@', restRemainingS: 70, restTotalS: 120, nextSwapOptions: [{ id: 'x', name: 'לחיצת חזה במכונה' }] } }),
  '15-crossing-plain': envelope({ mirror: { ...base, phase: 'rest_transition', exerciseName: BENCH, exerciseGroup: 'Chest', setNumber: 3, setsInExercise: 3, globalIndex: 5, targetWeight: 60, targetReps: 8, completedExerciseName: BENCH, nextExerciseName: ROW, nextExerciseGroup: 'Back', nextTargetWeight: 40, nextTargetReps: 10, nextSetNumber: 1, nextSetsInExercise: 3, restEndsAt: '@REST_END@', restRemainingS: 70, restTotalS: 120 } }),
  // Stopped, and done.
  '16-paused': envelope({ mirror: { ...base, phase: 'paused', exerciseName: BENCH, globalIndex: 3, targetWeight: 60, targetReps: 8 } }),
  '17-complete': envelope({ mirror: { ...base, phase: 'complete', exerciseName: BENCH, globalIndex: 17, targetWeight: 60, targetReps: 8, summary: { timeLabel: '52:11', sets: 18, up: 0, volumeKg: 11700, kcal: 412, lifts: [{ name: BENCH, best: '60×10' }, { name: INCLINE, best: '18×12' }, { name: ROW, best: '40×10' }, { name: 'לחיצת כתפיים', best: '30×9' }, { name: 'כפיפת מרפקים', best: '12×12' }, { name: 'פלאנק', best: '0:45' }] } } }),
};

const raw = (json) => `#"""\n${JSON.stringify(json)}\n"""#`;
let out = '// GENERATED by native-tests/watch-gallery/build-frames.cjs — not checked in.\n\n';
out += 'let GALLERY_FRAME_NAMES: [String] = [' + Object.keys(frames).map((k) => `"${k}"`).join(', ') + ']\n\n';
out += 'let GALLERY_FRAMES: [String: String] = [\n';
for (const [name, env] of Object.entries(frames)) out += `  "${name}": ${raw(env)},\n`;
out += ']\n';

const target = process.argv[2];
if (!target) throw new Error('usage: build-frames.cjs <out.swift>');
fs.writeFileSync(target, out);
fs.writeFileSync(path.join(path.dirname(target), 'frames.txt'), Object.keys(frames).join('\n') + '\n');
console.log(`frames: ${Object.keys(frames).length} -> ${target}`);

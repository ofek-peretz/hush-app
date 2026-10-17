/**
 * Bring your log (2026-09-01, audit M1) — the CSV parsers, the local matcher, and the merge.
 *
 * The contract: both real export shapes parse; names match locally (no model, no edit distance);
 * what is not recognised is reported by name and left out, never guessed; warm-ups keep the one
 * mark every engine read filters; pounds convert when (and only when) the file names them; and
 * running the same file twice writes nothing twice.
 */
// @ts-nocheck

//

import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseCsv, detectFormat, parseHistoryCsv } from '@/domain/historyImport';
import { db } from '@/data/local/db';

const STRONG = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2023-01-14 09:35:00,Push Day,1h 10m,Bench Press,W,40,10,,,,,
2023-01-14 09:35:00,Push Day,1h 10m,Bench Press,1,60,8,,,,,
2023-01-14 09:35:00,Push Day,1h 10m,Bench Press,2,60,7,,,,,
2023-01-14 09:35:00,Push Day,1h 10m,Mystery Machine Blaster,1,50,10,,,,,
2023-01-14 09:35:00,Push Day,1h 10m,Plank,1,,0,,60,,,
2023-01-16 18:00:00,Pull Day,55m,Lat Pulldown,1,55,10,,,,,`;

const HEVY = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
Upper A,2024-03-02 10:00:00,2024-03-02 11:05:00,,Bench Press,,,0,warmup,40,10,,,
Upper A,2024-03-02 10:00:00,2024-03-02 11:05:00,,Bench Press,,,1,normal,62.5,8,,,
Upper A,2024-03-02 10:00:00,2024-03-02 11:05:00,,Lat Pulldown,,,0,normal,57.5,10,,,
Upper A,2024-03-02 10:00:00,2024-03-02 11:05:00,,Running,,,0,normal,,,5,1800,`;

describe('parseCsv', () => {
  it('reads quoted fields with embedded commas and escaped quotes', () => {
    const rows = parseCsv('a,"b,c","say ""hi"""\r\n1,2,3');
    expect(rows).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });
});

describe('detectFormat', () => {
  it('names each app by its own header words', () => {
    expect(detectFormat(STRONG.split('\n')[0].split(','))).toBe('strong');
    expect(detectFormat(HEVY.split('\n')[0].split(','))).toBe('hevy');
    expect(detectFormat(['a', 'b'])).toBeNull();
  });
});

describe('parseHistoryCsv — Strong', () => {
  it('groups by workout, matches locally, marks warm-ups, and reports the unmatched by name', () => {
    const r = parseHistoryCsv(STRONG, 'kg');
    expect(r.sessions).toHaveLength(2);
    const [push, pull] = r.sessions;
    expect(push.programDayName).toBe('Push Day');
    expect(push.programDayId).toBe('imported');
    expect(push.trained).toBe(true);
    expect(push.freeform).toBeUndefined(); // the substrate — the engine reads it (see the header)
    // Bench: 1 warm-up + 2 working sets; the warm-up carries the standing exclusion marks.
    const bench = push.sets.filter((s) => s.exerciseId === 'bb_bench_press');
    expect(bench).toHaveLength(3);
    expect(bench[0].isApproach).toBe(true);
    expect(bench[0].isWarmup).toBe(true);
    expect(bench[1].actualWeight).toBe(60);
    expect(bench[1].recommendedWeight).toBeNull(); // nobody prescribed this
    // The mystery machine is reported, not guessed; the plank (seconds row) is silently cardio-out.
    expect(r.unmatched).toEqual([['Mystery Machine Blaster', 1]]);
    expect(pull.sets[0].exerciseId).toBe('lat_pulldown');
    expect(r.recognisedLifts).toBe(2);
    expect(r.firstMs).toBeLessThan(r.lastMs);
  });

  it('converts pounds when the header names them — and only then', () => {
    const lbFile = STRONG.replace(',Weight,', ',Weight (lb),');
    const r = parseHistoryCsv(lbFile, 'kg');
    const bench = r.sessions[0].sets.filter((s) => s.exerciseId === 'bb_bench_press');
    expect(bench[1].actualWeight).toBeCloseTo(27.22, 1); // 60 lb → kg
    // A plain "Weight" header takes the caller's unit hint instead.
    const hinted = parseHistoryCsv(STRONG, 'lb');
    const benchHinted = hinted.sessions[0].sets.filter((s) => s.exerciseId === 'bb_bench_press');
    expect(benchHinted[1].actualWeight).toBeCloseTo(27.22, 1);
  });
});

describe('parseHistoryCsv — Hevy', () => {
  it('parses, keeps kilograms as written, and leaves the run to the cardio record', () => {
    const r = parseHistoryCsv(HEVY);
    expect(r.sessions).toHaveLength(1);
    const s = r.sessions[0];
    expect(s.programDayName).toBe('Upper A');
    expect(s.sets.map((x) => x.exerciseId)).toEqual(['bb_bench_press', 'bb_bench_press', 'lat_pulldown']);
    expect(s.sets[0].isWarmup).toBe(true);
    expect(s.sets[1].actualWeight).toBe(62.5);
    expect(r.unmatched).toEqual([]); // "Running" was a distance row — cardio-out, not unmatched
  });
});

describe('db.appendImportedHistory', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('merges newest-first and the same file twice writes nothing twice', async () => {
    const r = parseHistoryCsv(STRONG, 'kg');
    expect(await db.appendImportedHistory(r.sessions)).toBe(2);
    expect(await db.appendImportedHistory(parseHistoryCsv(STRONG, 'kg').sessions)).toBe(0);
    const all = await db.loadHistory();
    expect(all).toHaveLength(2);
    expect(Date.parse(all[0].startedAt)).toBeGreaterThan(Date.parse(all[1].startedAt)); // newest first
  });

  it('keeps her live Hush sessions untouched around the merge', async () => {
    await db.appendCompletedSession({
      id: 'live_1',
      programDayId: 'day_1',
      startedAt: '2026-08-30T10:00:00.000Z',
      state: 'SAVED',
      earlyFinish: false,
      sets: [],
    });
    await db.appendImportedHistory(parseHistoryCsv(STRONG, 'kg').sessions);
    const all = await db.loadHistory();
    expect(all).toHaveLength(3);
    expect(all[0].id).toBe('live_1'); // 2026 outranks 2023 — order is by instant, not by arrival
  });
});

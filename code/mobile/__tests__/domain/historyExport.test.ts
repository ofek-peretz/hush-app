/**
 * Her log, out (2026-09-09, the formula report) — the CSV leaves in Strong's shape and reads
 * straight back through the importer, so nothing she brought or lifted is ever held hostage.
 */
// @ts-nocheck

//

import { sessionsToCsv, csvCell, exportFileName, EXPORT_HEADER } from '@/domain/historyExport';
import { parseCsv, detectFormat, parseHistoryCsv } from '@/domain/historyImport';
import type { Session } from '@/data/local/models';

const iso = (d: string) => `${d}T09:00:00.000Z`;
const session = (id: string, date: string, sets: Partial<Session['sets'][number]>[]): Session =>
  ({
    id,
    programDayId: 'd1',
    programDayName: 'Push Day',
    startedAt: iso(date),
    sets: sets.map((s, i) => ({ exerciseId: 'bb_bench_press', setIndex: i, actualWeight: 60, actualReps: 8, edited: false, persistedAt: iso(date), ...s })),
  }) as unknown as Session;

describe('the export', () => {
  it('writes Strong\'s header, one row per set, warm-ups as W, working sets numbered from 1', () => {
    const csv = sessionsToCsv(
      [session('a', '2026-09-01', [{ isWarmup: true, isApproach: true, actualWeight: 40, actualReps: 10, setIndex: -1 }, {}, { actualReps: 7 }])],
      'kg',
    );
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(EXPORT_HEADER);
    expect(rows).toHaveLength(4);
    expect(rows[1][3]).toBe('Barbell Bench Press');
    expect(rows[1][4]).toBe('W');
    expect(rows[2][4]).toBe('1');
    expect(rows[3][4]).toBe('2');
    expect(rows[3][6]).toBe('7');
  });

  it('leaves a presumed set out — the prescription is not a lift', () => {
    const csv = sessionsToCsv([session('a', '2026-09-01', [{}, { presumed: true }])], 'kg');
    expect(parseCsv(csv)).toHaveLength(2);
  });

  it('writes her units, and her note once per lift', () => {
    const csv = sessionsToCsv([session('a', '2026-09-01', [{ actualWeight: 100 }, { actualWeight: 100 }])], 'lb', { bb_bench_press: 'seat 4, "close" grip' });
    const rows = parseCsv(csv);
    expect(rows[1][5]).toBe('220');
    expect(rows[1][9]).toBe('seat 4, "close" grip');
    expect(rows[2][9]).toBe('');
  });

  it('round-trips through the importer as a Strong file', () => {
    const csv = sessionsToCsv(
      [session('b', '2026-09-03', [{ exerciseId: 'bb_back_squat', actualWeight: 80 }]), session('a', '2026-09-01', [{}, { actualReps: 7 }])],
      'kg',
    );
    expect(detectFormat(parseCsv(csv)[0])).toBe('strong');
    const report = parseHistoryCsv(csv, 'kg');
    expect(report.sessions).toHaveLength(2);
    expect(report.unmatched).toEqual([]);
    const back = report.sessions.flatMap((s) => s.sets.map((x) => [x.exerciseId, x.actualWeight, x.actualReps]));
    expect(back).toEqual(expect.arrayContaining([['bb_back_squat', 80, 8], ['bb_bench_press', 60, 8], ['bb_bench_press', 60, 7]]));
  });

  it('quotes exactly the cells that need it', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
  });

  it('names the file by the day', () => {
    expect(exportFileName(Date.parse('2026-09-09T12:00:00Z'))).toBe('hush-log-2026-09-09.csv');
  });
});

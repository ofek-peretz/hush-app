/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * UNLINKING TAKES NOTHING. — the coach track, law 6 (app half, 2026-09-17)
 *
 * She leaves her coach, or her coach removes her: the week stays on her phone exactly as the coach
 * last sent it, still `authored: 'coach'` (so the engine still may not rewrite it), and her
 * history is untouched. What goes is what was the coach's: the link, and the workouts that had not
 * yet been sent — sending them after she left would be the opposite of leaving. (The server's half —
 * access ends at once, rows purged 30 days on, one coach at a time — is the worker's law.)
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { db } from '@/data/local/db';
import { wireToProgram } from '@/domain/coachTrack';
import type { Program, Session } from '@/data/local/models';

process.env.EXPO_PUBLIC_CIRCLE_URL = 'https://identity.test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const outbox = require('@/state/coachOutbox') as typeof import('@/state/coachOutbox');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { engineMayRebuild } = require('@/state/stores/appStore') as typeof import('@/state/stores/appStore');

const ROOT = path.resolve(__dirname, '../..');

const sent = (): Program =>
  wireToProgram({
    version: 5,
    sentAt: '2026-09-17T08:00:00.000Z',
    coachName: 'Dana',
    week: { v: 1, days: [{ name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets: 4, band: [6, 8], note: 'pause' }] }] },
  }).program;

const history: Session = {
  id: 'h1',
  programDayId: 'coach_0',
  startedAt: '2026-09-10T17:00:00.000Z',
  state: 'SAVED',
  earlyFinish: false,
  sets: [],
};

let status = 200;
beforeEach(async () => {
  await AsyncStorage.clear();
  await SecureStore.setItemAsync('hush.circle.session', 'tok');
  status = 200;
  (global as any).fetch = jest.fn(async () => ({ status, ok: status < 400, json: async () => (status < 400 ? {} : { error: 'not_found' }) }));
  await db.saveProgram(sent());
  await db.appendCompletedSession(history);
  await outbox.saveCoachLink({ linkId: 'l1', coachName: 'Dana', since: '2026-09-01T00:00:00.000Z', consent: { bodyweight: true, cardio: false } });
  await db.saveCoachTrackOutbox([{ upload: { id: 'unsent' }, tries: 0, nextAtMs: 0, queuedAtMs: 0 }]);
});

describe('⛔ law 6 — leaving keeps the week and takes the link', () => {
  it('forgetting the link leaves the programme byte-for-byte, still the coach’s, and the history whole', async () => {
    await outbox.forgetCoachLink();
    const week = await db.loadProgram();
    expect(week).toEqual(sent());
    expect(week?.authored).toBe('coach');
    expect(week?.days[0].slots[0].coachNote).toBe('pause');
    expect(engineMayRebuild(week)).toBe(false);
    expect(await db.loadHistory()).toEqual([history]);
    // …what was the coach's is gone
    expect(await outbox.loadCoachLink()).toBeNull();
    expect(await outbox.loadOutbox()).toEqual([]);
  });

  it('a coach who removed her: the next pull learns it, forgets the link, keeps the week', async () => {
    status = 404;
    const adopt = jest.fn(async () => {});
    expect(await outbox.pullCoachWeek(adopt)).toEqual({ kind: 'unlinked' });
    expect(adopt).not.toHaveBeenCalled();
    expect(await db.loadProgram()).toEqual(sent());
    expect(await outbox.loadCoachLink()).toBeNull();
  });

  it('…and a pull that merely FAILED (offline, 5xx) forgets nothing', async () => {
    status = 503;
    expect((await outbox.pullCoachWeek(async () => {})).kind).toBe('error');
    expect(await outbox.loadCoachLink()).not.toBeNull();
    expect(await outbox.loadOutbox()).toHaveLength(1);
  });

  it('⛔ the leave verb, the unlink road and the forget never write a programme', () => {
    const store = fs.readFileSync(path.join(ROOT, 'src/state/stores/coachStore.tsx'), 'utf8');
    const leave = store.slice(store.indexOf('const leave = useCallback('), store.indexOf('const setConsent = useCallback('));
    expect(leave).toMatch(/const r = await traineeLeave\(\);\s*if \(r\.ok\) \{\s*await forgetCoachLink\(\);/);
    expect(leave).not.toMatch(/saveProgram|adopt|revertProgramToEngine/);

    const src = fs.readFileSync(path.join(ROOT, 'src/state/coachOutbox.ts'), 'utf8');
    const forget = src.slice(src.indexOf('export async function forgetCoachLink'), src.indexOf('export async function loadCoachMe'));
    expect(forget).not.toMatch(/saveProgram|clearAll|Program/);
    // a lapsed identity session is NOT an unlink — only the server's 404/403 on the link is
    expect(src).toMatch(/if \(r\.error === 'not_found' \|\| r\.error === 'forbidden'\) \{\s*\/\/[^\n]*\n\s*await forgetCoachLink\(\);/);
  });
});

/**
 * ⛔ AND LEAVING LEAVES A DOOR OPEN (2026-09-18).
 *
 * The other half of law 6 is that one coach at a time is a rule about the LINK, not about her: an
 * athlete who left, or whom a coach removed, may join another one tomorrow. She could not. The You
 * tab drew "המאמן שלי" only WHILE linked, and `CoachJoin` — the screen built for the phone that
 * never receives the deep link — was reachable from nothing else. The six-character code existed
 * for exactly the case the product had no door for.
 *
 * One slot in You, two states, never both: her coach while there is one, the code when there is not.
 */
describe('⛔ the way back in', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/screens/profile/ProfileSheet.tsx'), 'utf8');
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/locales/en.json'), 'utf8'));
  const he = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/locales/he.json'), 'utf8'));

  it('You carries a coach-code row when she is NOT linked, opening the same join screen', () => {
    expect(src).toContain("navigation.navigate('CoachJoin', {})");
    // The two states never both draw: the join row exists only where the link does not.
    //
    // ⚠️ AMENDED 2026-09-29 (design audit). The join row was the `else` of the linked row, one slot
    // under the membership — where 99% of the people opening this sheet are not coached and never
    // will be. It moved to a "For coaches" section at the foot, beside the coach-account row. What
    // this law guards did not move with it: drawn only when she is NOT linked, only where the track
    // exists, and never a second door to the linked coach.
    const slot = src.slice(src.indexOf('{coachTrack?.link ? ('), src.indexOf("navigate('CoachEnroll')"));
    expect(slot).toContain("t('coachTrack.athlete.codeLegend')");
    expect(slot).toContain("t('coachTrack.athlete.codeEntrySub')");
    expect(slot).toMatch(/\{coachTrack\.link \? null : \(\s*<Row\s+label=\{t\('coachTrack\.athlete\.codeLegend'\)\}/);
    expect(slot.match(/navigate\('MyCoach'\)/g)).toHaveLength(1);
  });

  it('it is drawn only where the track exists, so a build without the server has no row', () => {
    const slot = src.slice(src.indexOf('{coachTrack?.link ? ('), src.indexOf("navigate('CoachEnroll')"));
    expect(slot).toMatch(/\{coachTrack\?\.available \? \([\s\S]*\{coachTrack\.link \? null : \([\s\S]*codeLegend/);
  });

  it('and it does not nag: a plain row, no badge, no accent, no count', () => {
    const slot = src.slice(src.indexOf("t('coachTrack.athlete.codeLegend')"), src.indexOf("navigate('CoachEnroll')"));
    for (const shout of ['Badge', 'tone="accent"', 'dot', 'alert']) expect(slot).not.toContain(shout);
    for (const loc of [en, he]) {
      const sub = loc.coachTrack.athlete.codeEntrySub;
      expect(typeof sub).toBe('string');
      // It states what the row IS. Nothing in it invites her to go and find a coach.
      expect(sub.length).toBeLessThan(80);
    }
  });
});

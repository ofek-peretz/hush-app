// @ts-nocheck
/**
 * HAND-RUN DEV TOOL (not a law): `SEED_OUT=<file> npx jest seedWebState --testPathIgnorePatterns=/node_modules/`
 *
 * Writes a JSON map of localStorage keys → values: an athlete mid-programme on an AI-written week,
 * built through the app's own seams (`draftFromCoachWeek` → `sealAuthored`, real sessions folded by the
 * real engine), so the Expo-web walk opens on Today with a rep target that has climbed, a swap offer
 * standing, and last time's sets on the stage — the screens the 2026-10-17 engine audit changed.
 * Paste into the browser with `localStorage.setItem(k, v)` for each entry, then reload.
 */
import fs from 'fs';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { db } from '@/data/local/db';
import { fixtureModel } from '@/data/api/fixtureModel';
import { draftFromCoachWeek } from '@/domain/coachDraft';
import { sealAuthored } from '@/domain/planBuilder';

const OUT = process.env.SEED_OUT;
const DAY = 86_400_000;

const WEEK = {
  name: 'עליון / תחתון',
  days: [
    { name: 'עליון א׳ — חזה, גב וכתפיים', lifts: [
      { ex: 'bb_bench_press', sets: 3, reps: [5, 8], load: 40 }, { ex: 'cable_row', sets: 3, load: 30 },
      { ex: 'lateral_raise', sets: 3, reps: [12, 20], load: 6 }, { ex: 'rope_pushdown', sets: 3, reps: [10, 15], load: 15 },
    ] },
    { name: 'תחתון א׳ — רגליים ובטן', lifts: [
      { ex: 'bb_back_squat', sets: 3, reps: [5, 8], load: 50 }, { ex: 'bb_rdl', sets: 3, reps: [6, 10], load: 50 },
      { ex: 'leg_press', sets: 3, reps: [10, 15], load: 80 },
    ] },
    { name: 'עליון ב׳ — כתפיים וגב', lifts: [
      { ex: 'bb_overhead_press', sets: 3, reps: [6, 10], load: 25 }, { ex: 'lat_pulldown', sets: 3, load: 35 },
      { ex: 'hammer_curl', sets: 3, reps: [10, 15], load: 10 },
    ] },
  ],
};

describe('seed the Expo-web walk', () => {
  it('writes the localStorage map', async () => {
    if (!OUT) return;
    await db.clearAll();
    const now = Date.now();
    await db.saveProfile({
      name: 'עופק', sex: 'male', weightKg: 80, startWeightKg: 80, units: 'kg', daysPerWeek: 3, healthConnected: false,
      experience: 'intermediate', memberSince: new Date(now - 20 * DAY).toISOString(), trialModel: 'three', trialSessions: 4,
    } as never);
    const program = sealAuthored(draftFromCoachWeek(WEEK, { id: 'ai_week_web' })!)!;
    await db.saveProgram(program);

    // The last cycle, trained by a one-press athlete: every set logged exactly as written.
    let t = now - 9 * DAY;
    for (const day of program.days) {
      const targets = await fixtureModel.sessionTargets({ programDayId: day.id, completedSessions: 0 });
      const sets = day.slots.flatMap((slot) =>
        Array.from({ length: slot.setCount }, (_, s) => {
          const tg = targets.find((x) => x.exerciseId === slot.exerciseId && x.setIndex === s)!;
          return { exerciseId: slot.exerciseId, setIndex: s, recommendedWeight: tg.recommendedWeight, recommendedReps: tg.recommendedReps, actualWeight: tg.recommendedWeight, actualReps: tg.recommendedReps, edited: false, persistedAt: new Date(t + s * 120000).toISOString(), restBeforeS: s === 0 ? 120 : 90 };
        }),
      );
      const session = { id: `seed_${day.id}`, programDayId: day.id, programDayName: day.name, startedAt: new Date(t).toISOString(), state: 'SAVED', earlyFinish: false, trained: true, prescribed: sets.length, sets };
      await db.appendCompletedSession(session);
      await fixtureModel.sessionEarned!({ startedAtMs: t });
      t += 2 * DAY;
    }
    // A new cycle opened yesterday — so Today queues the first workout again.
    await db.saveWeekOpen?.(now - DAY);
    // One offer standing: the lateral raise has held, and the engine would rather a cable.
    const prefs = await db.loadPreferences();
    await db.savePreferences({ ...prefs, swapOffers: [{ from: 'lateral_raise', to: 'cable_lateral_raise', kind: 'rotate', at: now - DAY }] });
    // Read once more so the fold is on disk exactly as Today will find it.
    await fixtureModel.sessionTargets({ programDayId: program.days[0].id, completedSessions: 0 });

    const keys = await AsyncStorage.getAllKeys();
    const pairs = await AsyncStorage.multiGet(keys);
    fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(pairs.filter(([, v]) => v != null)), null, 0));
    // eslint-disable-next-line no-console
    console.log(`SEEDED ${keys.length} keys: ${keys.join(', ')}`);
  });
});

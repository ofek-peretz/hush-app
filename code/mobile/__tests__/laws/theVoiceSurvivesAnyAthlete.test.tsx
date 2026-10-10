/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE SURVIVES ANY ATHLETE.
 *
 * Founder, 2026-09-27: *"תוודא שבכל שלב ושלב הכל עובד כולל כל מקרי הקצה … כולל הקלט שהמתאמן משיב."*
 * A seeded random athlete runs whole workouts at the REAL session store and a real `VoiceConductor`
 * (fake mouth, fake ear that holds and extends a window as the real one does, fake clock): answers
 * right and wrong and half-heard, silences, the lock screen's Ready / Done-with-figures / +15 /
 * skip-rest, the stage's Done, pause and resume, the board's moves, a warm-up, earbuds out and in,
 * phone calls, an ear that fails. After EVERY step it holds these:
 *
 *   1. No row is written, or changed, without a word or a tap in that step (the clock never writes).
 *   2. Every "נרשם" says the figures of a row that exists — and never twice over unchanged rows.
 *   3. Nothing is said while the voice is off or a call is on.
 *   4. Never two listening windows at once.
 *   5. The voice's state agrees with the stage: resting ↔ "rest"; a set ↔ loading / set / asking.
 *   6. Ready on the lock card only while the voice is in the loading dialogue (a button someone answers).
 *   7. Her music is never left ducked once nothing is said and nothing listens.
 *   8. No dead end: a set on stage with nothing asking and nothing listening, while the ear can hear.
 *   9. A finished workout ends with "כל הכבוד. …" — once.
 *
 * On 2026-09-27 the first run of 40 workouts found 113 dead ends and six other holes; the last run of
 * 80 found none. CI runs three; `FUZZ_SEEDS=1-80 npx jest theVoiceSurvivesAnyAthlete` runs the lot, and
 * `FUZZ_OUT=<file>` / `FUZZ_FULL=<prefix>` write the verdicts and every transcript.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { initI18n, setLocale } from '@/i18n';
import { db } from '@/data/local/db';
import { exerciseDisplayName } from '@/data/exercises';
import { voiceScript } from '@/domain/voiceScript';
import { VoiceConductor } from '@/platform/voice/voiceConductor';
import type { PlannedSession } from '@/domain/coachPlan';

jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => true,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/coach/afterSession', () => ({
  askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })),
}));

const SEEDS = (process.env.FUZZ_SEEDS ?? '1-3').split(',').flatMap((r) => {
  const [a, b] = r.split('-').map(Number);
  return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
});
const STEPS = Number(process.env.FUZZ_STEPS ?? 200);

const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Ofek', sex: 'male', units: 'kg', weightKg: 80, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: {},
  modeState: { completedSessions: 0 },
  recordSessionCompleted: async () => ({ unlockedPortrait: false }),
  markWorkoutCompleted: async () => {},
  refreshProgram: async () => {},
} as unknown as React.ContextType<typeof AppContext>;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLANS: PlannedSession[] = [
  {
    name: 'Upper A',
    blocks: [
      { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_bench_press', load: 60, reps: [8, 10] }] },
      { rounds: 2, restS: 60, items: [{ kind: 'reps', ex: 'triceps_pushdown', load: 25, reps: [12, 15] }, { kind: 'reps', ex: 'ez_bar_curl', load: 25, reps: [10, 12] }] },
      { rounds: 2, restS: 60, items: [{ kind: 'reps', ex: 'pull_up', load: null, reps: [6, 8] }] },
      { rounds: 2, restS: 45, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
    ],
  },
  {
    name: 'רגליים',
    blocks: [
      { rounds: 3, restS: 120, items: [{ kind: 'reps', ex: 'bb_back_squat', load: 80, reps: [5, 8] }] },
      { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'leg_press', load: 120, reps: [10, 12] }] },
      { rounds: 2, restS: 60, items: [{ kind: 'reps', ex: 'lateral_raise', load: 8, reps: [12, 15] }] },
      { rounds: 2, restS: 60, items: [{ kind: 'reps', ex: 'cable_row', load: 45, reps: [10, 12] }] },
    ],
  },
];

const UTTER = [
  ['מוכן', 12], ['כן', 5], ['לא', 5], ['עוד רגע', 4], ['סיימתי', 4], ['כמו שכתוב', 3], ['לא יודע', 2],
  ['קל יותר', 2], ['כבד יותר', 2], ['דלג', 1], ['תפוס', 1], ['עצור', 1], ['המשך', 2], ['סיים אימון', 1],
  ['עשר', 10], ['שמונה', 8], ['12', 6], ['תשע', 6], ['חמש עשרה', 3], ['שש', 3], ['ארבעים וחמש קילו', 2],
  ['חמישים, שמונה', 3], ['לא, עשר', 4], ['עשר ושמונה', 3], ['שתים עשרה חזרות', 3], ['מה קורה אחי', 3], ['סבבה', 2],
  ['לא מוכן', 1], ['עוד שתיים', 1], ['מאה פאונד, שמונה', 1], ['אפס', 1], ['מאתיים', 1],
] as const;

describe('⛔ the voice survives any athlete — every door, in any order', () => {
  beforeAll(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await initI18n();
    await setLocale('he');
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}`, async () => {
      await db.clearAll();
      const rnd = mulberry32(seed);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
      const weighted = () => {
        const total = UTTER.reduce((a, [, w]) => a + w, 0);
        let r = rnd() * total;
        for (const [u, w] of UTTER) if ((r -= w) < 0) return u;
        return 'עשר';
      };
      let now = Math.round(new Date().getTime() / 1000) * 1000;
      const t0 = now;
      const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
      let wake: ((s: string) => void) | null = null;
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_t: string, cb: (s: string) => void) => {
        wake = cb;
        return { remove() {} } as never;
      });
      type Timer = { at: number; f: () => void; id: number };
      let timers: Timer[] = [];
      let tid = 0;
      const log: string[] = [];
      const violations: string[] = [];
      const st = () => {
        const s = Math.round((now - t0) / 1000);
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      };
      let ear: any = null;
      let ducked = false;
      let lastEchoRows: string | null = null;
      const pendingEchoes: string[] = [];
      let view: SessionView | null = null;
      const V = () => view!;
      const fail = (why: string) => {
        violations.push(`${st()} ${why}`);
        log.push(`${st()}  ❌ ${why}`);
      };
      let c: VoiceConductor;
      const rowsKey = () => JSON.stringify(V().loggedSets.map((r) => [r.exerciseId, r.setIndex, r.actualWeight, r.actualReps, r.amendedAt ?? '']));
      const mouth = {
        say: async (text: string) => {
          log.push(`${st()}  🔊 ${text}`);
          if (!(c as any).on) fail('spoke while the voice is off');
          if ((c as any).interrupted) fail('spoke during a call');
          // A hold's echo says its time, not a reps row (items are not `loggedSets`).
          if (/נרשם\.$/.test(text) && /חזר/.test(text)) pendingEchoes.push(text);
        },
        interrupt: () => {},
      };
      const fakeEar = {
        open: (opts: any) => {
          if (ear) fail('a window opened over an open one');
          const w = { ...opts, openedAt: now };
          ear = w;
          log.push(`${st()}      🎤 ${opts.ms / 1000}s`);
          return {
            close: () => {
              if (ear === w) {
                ear = null;
                w.onEnd('closed');
              }
            },
            hold: () => {},
            extend: () => {},
          };
        },
      };
      const audio = {
        duck: async () => void (ducked = true),
        unduck: async () => void (ducked = false),
        playChime: async () => void log.push(`${st()}  🔔`),
      };
      function Probe() {
        view = useSession();
        return null;
      }
      act(() => {
        renderer.create(
          <AppContext.Provider value={appFixture}>
            <SessionProvider>
              <Probe />
            </SessionProvider>
          </AppContext.Provider>,
        );
      });
      c = new VoiceConductor({
        mouth,
        ear: fakeEar,
        audio,
        now: () => now,
        setTimeout: (f, ms) => {
          const id = ++tid;
          timers.push({ at: now + ms, f, id });
          return id;
        },
        clearTimeout: (id) => {
          timers = timers.filter((t) => t.id !== id);
        },
        getView: V,
        locale: () => ({ locale: 'he', units: 'kg' }),
        firstSessionEver: () => seed % 2 === 0,
        /*
         * ⛔ THE PHONE'S OWN MICROPHONE, HELD FOR THE WORKOUT — on two seeds in three (2026-10-05). It is
         * what the app ships with by default, and it is the only world in which every set is called and
         * started the same way and her own report is heard without the question (`nextSet`,
         * `armSetWindow`). The third seed keeps the earbuds' microphone, where a set after a rest runs
         * as it did before — both roads stay walked.
         */
        earIsFree: () => seed % 3 !== 0,
      });
      const settle = async () => {
        await act(async () => {
          for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
        });
      };
      let rowsSeen = 0;
      let lastPhase = '';
      const tick = async () => {
        await settle();
        // Every view the store renders is observed, as `useVoiceCoach`'s effect does on device.
        for (let i = 0; i < 8; i++) {
          const seen = V();
          c.observe(seen);
          await settle();
          if (V() === seen) break;
        }
        const v = V();
        while (rowsSeen < v.loggedSets.length) {
          const r = v.loggedSets[rowsSeen++];
          log.push(`${st()}          📝 ${exerciseDisplayName(r.exerciseId)} #${r.setIndex + 1}: ${r.actualWeight ?? 'BW'}×${r.actualReps}`);
        }
        const ph = `${v.active ? v.displayPhase : 'ENDED'}${v.paused ? '/P' : ''} ${v.currentExerciseId ?? ''} ${v.setLabel ? `${v.setLabel.warmup ? 'w' : ''}${v.setLabel.n}/${v.setLabel.m}` : ''}`;
        if (ph !== lastPhase) {
          lastPhase = ph;
          log.push(`${st()}    ── ${ph}`);
        }
      };
      const advance = async (ms: number) => {
        const target = now + ms;
        for (;;) {
          const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
          if (!due) break;
          now = due.at;
          timers = timers.filter((t) => t.id !== due.id);
          due.f();
          await tick();
        }
        now = target;
        await act(async () => {
          wake?.('active');
          await new Promise((r) => setTimeout(r, 0));
        });
        await tick();
      };

      let earbudsIn = true;
      let onCall = false;
      let deadSince: number | null = null;

      c.enable();
      await act(async () => V().startCoach(pick(PLANS), 'coach_0'));
      await tick();

      for (let step = 0; step < STEPS && V().active; step++) {
        const before = rowsKey();
        const beforeLen = V().loggedSets.length;
        // A number she said a step ago and the coach is holding a beat (`REPORT_SETTLE_MS`) is her word too.
        const roundBefore = !!(c as any).roundWrite || !!(c as any).writing || !!(c as any).pendingReport;
        let writer = false;
        const r = rnd();
        if (!earbudsIn) {
          if (r < 0.4) {
            earbudsIn = true;
            log.push(`${st()}  🎧 in`);
            c.enable();
            await tick();
          } else await advance(Math.floor(rnd() * 20_000));
        } else if (onCall) {
          if (r < 0.5) {
            onCall = false;
            log.push(`${st()}  📞 end`);
            c.onInterruption(false);
            await tick();
          } else await advance(Math.floor(rnd() * 15_000));
        } else if (ear && r < 0.55) {
          const u = weighted();
          const conf = rnd() < 0.15 ? 0.4 : rnd() < 0.3 ? null : 0.92;
          log.push(`${st()}  🗣 "${u}"${conf != null && conf < 0.6 ? ' (low)' : ''}`);
          writer = true;
          await act(async () => {
            const e = ear;
            const keep = e.onSentence(u, conf);
            if (!keep && ear === e) {
              ear = null;
              e.onEnd('heard');
            }
            await new Promise((res) => setTimeout(res, 0));
          });
          await tick();
        } else if (ear && r < 0.75) {
          const e = ear;
          ear = null;
          const why = rnd() < 0.85 ? 'timeout' : rnd() < 0.6 ? 'silence' : rnd() < 0.8 ? 'error' : 'locked';
          now = Math.max(now, e.openedAt + e.ms);
          log.push(`${st()}      🎤 end ${why}`);
          await act(async () => {
            e.onEnd(why);
            await new Promise((res) => setTimeout(res, 0));
          });
          await tick();
        } else if (r < 0.8) {
          // The lock screen / the wrist / the stage.
          const v = V();
          const k = rnd();
          writer = true;
          if (k < 0.3) {
            log.push(`${st()}  👆 lock Done`);
            await act(async () => v.applyLockIntents([{ id: `lk${step}`, type: 'complete_set', atMs: now, ...(rnd() < 0.5 ? { weight: v.currentTarget?.recommendedWeight ?? null, reps: 7 + Math.floor(rnd() * 5) } : {}) }]));
          } else if (k < 0.45) {
            log.push(`${st()}  👆 lock Ready`);
            await act(async () => v.applyLockIntents([{ id: `lk${step}`, type: 'set_ready', atMs: now }]));
          } else if (k < 0.55) {
            log.push(`${st()}  👆 +15`);
            await act(async () => v.applyLockIntents([{ id: `lk${step}`, type: 'add_rest', atMs: now }]));
          } else if (k < 0.62) {
            log.push(`${st()}  👆 skip rest`);
            await act(async () => v.applyLockIntents([{ id: `lk${step}`, type: 'end_rest', atMs: now }]));
          } else if (k < 0.75) {
            log.push(`${st()}  👆 stage Done`);
            await act(async () => void (v.currentItem && v.currentItem.kind !== 'reps' ? await v.completeItem() : await v.completeSet()));
          } else if (k < 0.8) {
            log.push(`${st()}  👆 pause/resume`);
            await act(async () => (v.paused ? v.resume() : v.pause()));
          } else if (k < 0.85 && v.canMarkOccupied) {
            log.push(`${st()}  👆 occupied`);
            await act(async () => v.markEquipmentOccupied());
          } else if (k < 0.9 && v.aheadExerciseIds.length) {
            log.push(`${st()}  👆 start another now`);
            await act(async () => v.startExerciseNow(pick(v.aheadExerciseIds)));
          } else if (k < 0.93 && v.warmupOffered > 0) {
            log.push(`${st()}  👆 warm-up`);
            await act(async () => v.addWarmup());
          } else {
            writer = false;
          }
          await tick();
        } else if (r < 0.83) {
          earbudsIn = false;
          log.push(`${st()}  🎧 out`);
          c.disable();
          ear = null;
          await tick();
        } else if (r < 0.85) {
          onCall = true;
          log.push(`${st()}  📞 call`);
          c.onInterruption(true);
          await tick();
        } else {
          const next = timers.slice().sort((a, b) => a.at - b.at)[0];
          const v = V();
          if (next && rnd() < 0.8) await advance(next.at - now);
          else if (v.displayPhase?.startsWith('REST') && v.restEndsAtMs) await advance(Math.max(500, v.restEndsAtMs - now + 500));
          else await advance(Math.floor(rnd() * 30_000));
        }

        // ── the invariants ──
        const v = V();
        if (pendingEchoes.length && v.active) {
          const rows = v.loggedSets;
          const l = { locale: 'he', units: 'kg' } as const;
          // A set done at the plan's load is said back by its reps alone; any other, with its load (2026-10-05).
          const cands: string[] = rows.slice(-3).flatMap((r) => [voiceScript.echo(r.actualWeight, r.actualReps, l), voiceScript.echo(r.actualWeight, r.actualReps, l, r.actualWeight)]);
          for (const k of [2, 3]) {
            if (rows.length >= k) cands.push(voiceScript.echoRound(rows.slice(-k).map((r) => ({ exerciseId: r.exerciseId, kg: r.actualWeight, reps: r.actualReps })), l));
          }
          for (const text of pendingEchoes) if (!cands.includes(text)) fail(`echo does not match the rows: "${text}" vs ${JSON.stringify(cands)}`);
          const key = rowsKey();
          if (lastEchoRows === key) fail('"נרשם" said again with no row written or changed');
          lastEchoRows = key;
        }
        pendingEchoes.length = 0;
        const grew = v.loggedSets.length > beforeLen;
        if (grew && !writer && !roundBefore) fail(`a row was written with no word and no tap (${v.loggedSets.length - beforeLen})`);
        if (rowsKey() !== before && !writer && !roundBefore && !grew) fail('a row changed with no word and no tap');
        const on = (c as any).on;
        const mode = (c as any).mode;
        if (on && v.active && !v.paused && !onCall && !(c as any).roundWrite) {
          if (v.displayPhase?.startsWith('REST') && mode !== 'rest') fail(`resting, but the voice is in "${mode}"`);
          if (v.displayPhase === 'SET_PRESENTED' && !['loading', 'set', 'asking'].includes(mode)) fail(`a set on stage, but the voice is in "${mode}"`);
          if (v.awaitingReady && mode !== 'loading') fail(`Ready on the card, but the voice is in "${mode}"`);
          if (!ear && (c as any).queued === 0 && (c as any).speaking === 0 && ducked) fail('her music left ducked');
          const reps = v.displayPhase === 'SET_PRESENTED' && (!v.currentItem || v.currentItem.kind === 'reps');
          const dead = reps && !ear && timers.length === 0 && !(c as any).earDown;
          if (dead) {
            if (deadSince == null) {
              deadSince = now;
              log.push(`${st()}  💤 silent: nothing asks, nothing listens (mode ${mode}, q ${(c as any).ask?.question ?? '-'})`);
              // After the bounded reminders, silence is the design — the lock screen and the wrist.
              if (((c as any).setState?.reminders ?? 0) < 2) fail(`a dead end: a set on stage, nothing asks and nothing listens (mode ${mode})`);
            }
          } else deadSince = null;
        } else deadSince = null;
      }
      const endLines = log.filter((x) => x.includes('🔊 כל הכבוד.')).length;
      if (!V().active && earbudsIn && !onCall && endLines !== 1) fail(`the end line was said ${endLines} times`);
      const deads = log.filter((x) => x.includes('💤')).length;
      const tail = log.slice(-60).join('\n');
      clock.mockRestore();
      if (process.env.FUZZ_OUT) require('node:fs').appendFileSync(process.env.FUZZ_OUT, `\n════ seed ${seed} · ${violations.length} violation(s) · ${deads} silent · ${V().active ? 'unfinished' : 'finished'}\n${violations.join('\n')}\n${violations.length ? tail : ''}\n`, 'utf8');
      if (process.env.FUZZ_FULL) require('node:fs').writeFileSync(`${process.env.FUZZ_FULL}-${seed}.txt`, log.join('\n'), 'utf8');
      if (violations.length) {
        throw new Error(`seed ${seed}: ${violations.length} violation(s)\n${violations.slice(0, 8).join('\n')}\n--- transcript tail ---\n${tail}`);
      }
      if (process.env.FUZZ_PRINT) console.log(`seed ${seed}\n${log.join('\n')}`);
    }, 120_000);
  }
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REMINDER SHE ASKED FOR — founder, 2026-08-23, releasing his own 2026-07-13 decree by name
 * (*"חלק מהפסיקות שלי הן ישנות מאוד… אל תיתן לשום פסיקה או חוק כזה להגביל אותך"*).
 *
 * The decree — "I do not want a reminder. At all." — was written against the uninvited, nagging
 * kind. What ships now keeps its taste and changes only the consent:
 *   · OFF BY DEFAULT. An absent flag is a false; nobody is reminded who did not ask.
 *   · Landing only on days the plan actually assigns a workout — never a guess.
 *   · Stating a fact ("Upper A today · the plan is ready") — never "you haven't", never a streak.
 *   · The OS permission is asked at the SWITCH, the one honest moment — and never from the
 *     background resync.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';
import { trainingReminderDays } from '@/platform/trainingReminders';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('the desired set is derived, never guessed — and N-of-M is the flagship case', () => {
  const W = (id: string, name: string, day?: string) => ({ id, name, ...(day ? { day } : {}) });

  it('a plan that ASSIGNS days wins — the explicit word outranks the pattern', () => {
    expect(
      trainingReminderDays(
        [W('a', 'Upper A', 'sun'), W('b', 'Lower A', 'wed'), W('c', 'Upper B', 'sat')],
        [],
        new Set(['mon']),
        'A training day',
      ),
    ).toEqual([
      { weekday: 1, name: 'Upper A' },
      { weekday: 4, name: 'Lower A' },
      { weekday: 7, name: 'Upper B' },
    ]);
  });

  it('⛔ N-of-M — no assigned days → HER LEARNED DAYS carry it (founder: "איך זה מסתדר?")', () => {
    expect(
      trainingReminderDays([W('a', 'Upper A'), W('b', 'Lower A')], [], new Set(['sun', 'tue']), 'A training day'),
    ).toEqual([
      { weekday: 1, name: 'A training day' },
      { weekday: 3, name: 'A training day' },
    ]);
  });

  it('…and a brand-new athlete with no pattern yet gets silence, not a guess', () => {
    expect(trainingReminderDays([W('a', 'Upper A')], [], null, 'A training day')).toEqual([]);
  });

  it('⛔ a FINISHED week goes silent — "you could train more" is the forbidden sentence', () => {
    expect(
      trainingReminderDays([W('a', 'Upper A', 'sun')], ['a'], new Set(['sun']), 'A training day'),
    ).toEqual([]);
  });

  it('two workouts on one assigned day are one note', () => {
    expect(
      trainingReminderDays([W('a', 'Upper A', 'mon'), W('b', 'Arms', 'mon')], [], null, 'A training day'),
    ).toEqual([{ weekday: 2, name: 'Upper A' }]);
  });

  it('…and the completion hook re-derives, so the silence actually lands mid-week', () => {
    const app = fs.readFileSync(path.join(__dirname, '..', '..', 'src/state/stores/appStore.tsx'), 'utf8');
    const at = app.indexOf('async recordSessionCompleted()');
    expect(app.slice(at, app.indexOf('},', at))).toContain('void syncTrainingRemindersFromPlan()');
  });
});

describe('the consent is the feature', () => {
  it('off by default — an absent flag is a false', () => {
    expect(read('src/data/local/db.ts')).toContain('=== true');
  });

  it('opted out → the sync passes null, and everything scheduled is swept', () => {
    const seam = read('src/platform/trainingReminders.ts');
    expect(seam).toContain('await notifier.syncTrainingReminders(null)');
    const notif = read('src/platform/notifications.ts');
    const at = notif.indexOf('async syncTrainingReminders(days, clock)');
    expect(at).toBeGreaterThan(-1);
    const body = notif.slice(at, at + 2200);
    // The sweep runs BEFORE the empty-set early return — opting out cancels, always.
    expect(body.indexOf('cancelScheduledNotificationAsync')).toBeLessThan(body.indexOf('if (!days || days.length === 0) return;'));
  });

  it('the background sync never prompts — it reads permission, it does not ask for it', () => {
    const notif = read('src/platform/notifications.ts');
    const at = notif.indexOf('async syncTrainingReminders(days, clock)');
    const body = notif.slice(at, at + 2200);
    expect(body).toContain('hasNotificationPermission()');
    expect(body).not.toContain('ensureNotificationPermission');
  });

  it('…and the SWITCH is where the OS is asked, on the way ON only', () => {
    const you = read('src/screens/profile/ProfileSheet.tsx');
    expect(you).toMatch(/if \(next\) await ensureNotificationPermission\(\)/);
  });

  it('boot resyncs it beside the weekly note — self-healing, like every scheduled job', () => {
    expect(read('src/state/stores/appStore.tsx')).toContain('void syncTrainingRemindersFromPlan()');
  });
});

describe('the note states a fact', () => {
  it('stable per-weekday ids, a WEEKLY trigger, the copy baked at schedule time', () => {
    const notif = read('src/platform/notifications.ts');
    const at = notif.indexOf('async syncTrainingReminders(days, clock)');
    const body = notif.slice(at, at + 2200);
    expect(body).toContain('`hush.training.${d.weekday}`');
    expect(body).toContain('SchedulableTriggerInputTypes.WEEKLY');
    expect(body).toContain("tg('notifications.trainingTitle', { name: d.name })");
  });
});

/*
 * ════ THE HOUR IS HERS TOO (2026-09-01, audit lever 4) ════
 * The days were already learned from her history; the hour was a hardcoded 17:30 for everyone.
 * `reminderClock` mirrors her median start time (≥4 sessions in 8 weeks, snapped to the quarter);
 * until there is a habit to mirror, 17:30 stands in — the same quiet-wait rule the days follow.
 */
describe('the hour is hers too', () => {
  const { reminderClock } = require('../../src/platform/trainingReminders');
  const at = (daysAgo: number, hour: number, minute = 0) => {
    const d = new Date(NOW - daysAgo * 24 * 60 * 60 * 1000);
    d.setHours(hour, minute, 0, 0);
    return { startedAt: d.toISOString(), trained: true };
  };
  const NOW = Date.now();

  it('under four sessions there is no habit — 17:30 stands in', () => {
    expect(reminderClock([at(2, 6), at(4, 6)], NOW)).toEqual({ hour: 17, minute: 30 });
  });

  it('a morning athlete is reminded in the morning, at her own median', () => {
    const history = [at(2, 6, 10), at(4, 6, 20), at(7, 6, 0), at(9, 6, 40), at(11, 7, 0)];
    const clock = reminderClock(history, NOW);
    expect(clock.hour).toBe(6);
    expect([15, 30]).toContain(clock.minute);
  });

  it('sessions older than the eight-week window do not vote', () => {
    const history = [at(70, 22), at(72, 22), at(75, 22), at(2, 6), at(4, 6, 30), at(6, 7), at(8, 6, 15)];
    expect(reminderClock(history, NOW).hour).toBeLessThan(12);
  });

  it('the schedule carries the learned clock, defaulting only when none is handed over', () => {
    const notif = read('src/platform/notifications.ts');
    const at2 = notif.indexOf('async syncTrainingReminders(days, clock)');
    const body = notif.slice(at2, at2 + 2400);
    expect(body).toContain('clock?.hour ?? 17');
    expect(body).toContain('clock?.minute ?? 30');
  });
});

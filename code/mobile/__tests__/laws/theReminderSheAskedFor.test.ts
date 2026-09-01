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
    const at = notif.indexOf('async syncTrainingReminders(days)');
    expect(at).toBeGreaterThan(-1);
    const body = notif.slice(at, at + 2200);
    // The sweep runs BEFORE the empty-set early return — opting out cancels, always.
    expect(body.indexOf('cancelScheduledNotificationAsync')).toBeLessThan(body.indexOf('if (!days || days.length === 0) return;'));
  });

  it('the background sync never prompts — it reads permission, it does not ask for it', () => {
    const notif = read('src/platform/notifications.ts');
    const at = notif.indexOf('async syncTrainingReminders(days)');
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
    const at = notif.indexOf('async syncTrainingReminders(days)');
    const body = notif.slice(at, at + 2200);
    expect(body).toContain('`hush.training.${d.weekday}`');
    expect(body).toContain('SchedulableTriggerInputTypes.WEEKLY');
    expect(body).toContain("tg('notifications.trainingTitle', { name: d.name })");
  });
});

/**
 * ═══ THE NAME IS TRUE OF THE WEEK (founder 2026-09-09) ═══
 *
 * *"אם הוא עושה push למשל אז צריך שזה יהיה push ולא upper. התוכנית צריכה להיות מדויקת לפי מה שקורה
 * בפועל."* Every key `programmeName` can answer is a claim about the lifts, and this file checks
 * each claim against a week that makes it — and against one that would make it a lie.
 */
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { dayKind, programmeName, weekShape, weekShapeKey } from '@/domain/programmeName';
import { draftFromCoachWeek, readCoachWeek } from '@/domain/coachDraft';
import { BUILD_WEEK_SCHEMA } from '@/domain/buildPrompt';
import type { ProgramDay } from '@/data/local/models';

const day = (name: string, ids: string[], isRest = false): ProgramDay => ({
  id: name,
  name,
  muscleGroups: [],
  isRest,
  slots: ids.map((exerciseId, i) => ({ id: `${name}_${i}`, exerciseId, setCount: 3 }) as unknown as ProgramDay['slots'][number]),
});

const PUSH = ['bb_bench_press', 'bb_overhead_press', 'triceps_pushdown'];
const PULL = ['bb_row', 'lat_pulldown', 'hammer_curl'];
const LEGS = ['bb_back_squat', 'leg_curl', 'standing_calf_raise'];
const UPPER = ['bb_bench_press', 'bb_row', 'lateral_raise'];
const LOWER = ['leg_press', 'bb_rdl', 'hip_thrust'];
const FULL = ['bb_bench_press', 'bb_back_squat', 'lat_pulldown'];

const name = (days: ProgramDay[], title?: string) => programmeName(days, {}, CANONICAL_MUSCLE_ORDER, title);

describe('a day is what its lifts train', () => {
  it('reads push, pull, legs, upper and full off the muscles — never off the name', () => {
    expect(dayKind(day('Upper A', PUSH))).toBe('push');
    expect(dayKind(day('Lower B', PULL))).toBe('pull');
    expect(dayKind(day('Push', LEGS))).toBe('legs');
    expect(dayKind(day('Legs', UPPER))).toBe('upper');
    expect(dayKind(day('Full Body', LOWER))).toBe('legs');
    expect(dayKind(day('Push', FULL))).toBe('full');
  });
  it('core rides on any day and says nothing about the split', () => {
    expect(dayKind(day('x', [...PUSH, 'cable_crunch']))).toBe('push');
    expect(dayKind(day('x', ['cable_crunch']))).toBe('other');
  });
});

describe('the week is named by the shape its lifts make', () => {
  it('⛔ push / pull is called push / pull — not upper, and never upper / lower', () => {
    expect(weekShapeKey([day('a', PUSH), day('b', PULL)])).toBe('plan.shapePushPull');
    expect(weekShapeKey([day('a', PUSH), day('b', PULL), day('c', LEGS)])).toBe('plan.shapePushPullLegs');
  });
  it('⛔ a week with no lower-body lift is "Upper body" — the build-72 week', () => {
    const week = [
      day('Push and Arms', ['bb_bench_press', 'incline_db_press', 'triceps_pushdown', 'ez_bar_curl']),
      day('Pull and Shoulders', ['bb_row', 'lat_pulldown', 'bb_overhead_press', 'lateral_raise']),
      day('Upper Body and Core', ['db_bench_press', 'cable_row', 'face_pull', 'cable_crunch']),
    ];
    expect(weekShapeKey(week)).toBe('plan.shapeUpper');
    expect(weekShapeKey(week)).not.toBe('plan.shapeSplit');
  });
  it('a week with no upper-body lift is "Lower body"', () => {
    expect(weekShapeKey([day('a', LEGS), day('b', LOWER)])).toBe('plan.shapeLower');
  });
  it('upper / lower is said only for pure upper days and pure lower days together', () => {
    expect(weekShapeKey([day('Upper A', UPPER), day('Lower A', LOWER), day('Upper B', PUSH), day('Lower B', LEGS)])).toBe('plan.shapeSplit');
  });
  it('full body is every day upper AND lower — the engine’s three-day week', () => {
    expect(weekShapeKey([day('Full Body A', FULL), day('Full Body B', FULL)])).toBe('plan.shapeFull');
    expect(weekShape([day('Full Body A', FULL)])).toBe('full');
  });
  it('a mix none of the words fit is a body-part split, not a guess', () => {
    expect(weekShapeKey([day('a', FULL), day('b', PUSH)])).toBe('plan.shapeBodyPart');
  });
  it('rest days and empty days do not vote', () => {
    expect(weekShapeKey([day('a', PUSH), day('rest', [], true), day('b', PULL)])).toBe('plan.shapePushPull');
  });
});

describe('the author’s title leads', () => {
  it('⛔ a week that carries a title is announced by it, with the shape still computed underneath', () => {
    const n = name([day('a', PUSH), day('b', PULL)], 'שבוע כוח מתפרץ למגרש');
    expect(n.title).toBe('שבוע כוח מתפרץ למגרש');
    expect(n.key).toBe('plan.shapePushPull');
    expect(n.days).toBe(2);
  });
  it('a blank title is no title', () => {
    expect(name([day('a', PUSH)], '   ').title).toBeUndefined();
  });
  it('⛔ the model may name the week, and it commits to the name BEFORE it writes the days', () => {
    const keys = Object.keys(BUILD_WEEK_SCHEMA.properties);
    expect(keys).toContain('name');
    expect(keys.indexOf('name')).toBeLessThan(keys.indexOf('days'));
    // optional — a week with nothing worth calling it falls back to the shape
    expect(BUILD_WEEK_SCHEMA.required).toEqual(['days']);
    // its meaning is on the field, and it forbids the title that fits anybody
    expect(BUILD_WEEK_SCHEMA.properties.name.description).toMatch(/never a title that would fit anybody/);
  });
  it('⛔ …and the title rides the reply onto the programme', () => {
    const week = readCoachWeek({
      name: '  שבוע עליון בלי רגליים  ',
      days: [{ name: 'דחיפה', lifts: [{ ex: 'bb_bench_press', sets: 3 }] }, { name: 'משיכה', lifts: [{ ex: 'bb_row', sets: 3 }] }],
    });
    expect(week?.name).toBe('שבוע עליון בלי רגליים');
    const program = draftFromCoachWeek(week!);
    expect(program?.title).toBe('שבוע עליון בלי רגליים');
    expect(name(program!.days, program!.title).title).toBe('שבוע עליון בלי רגליים');
  });
  it('a reply without a name has no title, and a non-string name is dropped', () => {
    expect(readCoachWeek({ days: [{ name: 'a', lifts: [{ ex: 'bb_row', sets: 3 }] }] })?.name).toBeUndefined();
    expect(readCoachWeek({ name: 42, days: [{ name: 'a', lifts: [{ ex: 'bb_row', sets: 3 }] }] })?.name).toBeUndefined();
  });
});

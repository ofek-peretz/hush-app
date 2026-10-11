// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEIGHTED BAR HAS A LOAD (2026-10-11)
 *
 * Walked live as a man who wrote *"מתח עם 20 ק״ג ל-8"*: the week's title said "+20", the week on
 * disk carried `startLoadKg: 20` on `pull_up` — and the stage said "משקל גוף". He tapped the
 * weight, typed 45, and nothing was written. A bodyweight lift has no load axis anywhere in the
 * engine (S-51), so his number had nowhere to live and no screen to say so.
 *
 * The founder, on the open items: *"כן טפל בשלושת הסעיפים האלו ותוודא בצורה הרמטית שזה סגור ונעול."*
 *
 * So the pull-up, the chin-up and the dip each have a LOADED form in the catalogue. Not a flag on
 * the bodyweight lift — a lift of its own, so that everything a loaded lift already has, it has:
 * an opening load (his, or the model's), a rung, a load that moves from what he lifts, a figure
 * on the stage, the wrist and the lock screen, a word in the coach's mouth.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';
import { CHOICE_ONLY_IDS, EXERCISES, WEIGHTED_FORM_OF, exerciseById, exerciseDisplayName, loadStyleOf } from '@/data/exercises';
import { equipmentLoad, loadSetup, totalFromEquipment } from '@/domain/loadPresentation';
import { openingLoadsOf } from '@/data/api/fixtureModel';
import { exerciseMotion } from '@/motion/registry';
import { swapChoices } from '@/domain/swapPool';
import { catalogueLines } from '@/domain/buildPrompt';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const WEIGHTED = ['weighted_pull_up', 'weighted_chin_up', 'weighted_dip'];
const man = { sex: 'male', weightKg: 82, repBand: '8-10' };
const weekWith = (exerciseId: string, startLoadKg?: number) => ({
  id: 'w',
  frequency: 1,
  days: [{ id: 'd', name: 'Pull', muscleGroups: ['Back'], isRest: false, slots: [{ capability: 'horizontal_pull', exerciseId, setCount: 3, ...(startLoadKg != null ? { startLoadKg } : {}) }] }],
});

describe('three loaded lifts, each the loaded form of a bodyweight one', () => {
  it('they are in the catalogue, they are LOADED, and their twin is the bodyweight lift', () => {
    expect(Object.keys(WEIGHTED_FORM_OF).sort()).toEqual([...WEIGHTED].sort());
    for (const id of WEIGHTED) {
      const ex = exerciseById(id);
      const twin = exerciseById(WEIGHTED_FORM_OF[id]);
      expect(ex).toBeTruthy();
      expect(ex.bodyweight).toBeFalsy(); // a load axis — the whole point
      expect(ex.equipment).not.toBe('bodyweight');
      expect(ex.loadStyle).toBe('added');
      expect(loadStyleOf(id)).toBe('added');
      expect(twin?.bodyweight).toBe(true);
      // Same movement, by the catalogue's own words for a movement.
      expect([ex.capability, ex.muscle, ex.pattern, ex.tier]).toEqual([twin.capability, twin.muscle, twin.pattern, twin.tier]);
    }
  });

  it('each has its name in both languages and its cues in hers — his and hers', () => {
    for (const id of WEIGHTED) {
      expect(typeof he.exercises?.[id] === 'string' || exerciseDisplayName(id).length > 0).toBe(true);
      expect(exerciseDisplayName(id)).not.toBe(id);
    }
    const flat = JSON.stringify(he);
    for (const id of WEIGHTED) {
      expect(flat).toContain(`"${id}":[`);
      expect(flat).toContain(`"${id}_female":[`);
      expect(JSON.stringify(en)).toContain(`"${id}":"Weighted`);
    }
    expect(flat).toContain('"weighted_pull_up":"מתח עם משקל"');
    expect(flat).toContain('"weighted_dip":"מקבילים עם משקל"');
  });
});

describe('⛔ his number has somewhere to live', () => {
  it('a load written on a weighted pull-up opens the lift — where the bodyweight lift dropped it', () => {
    expect(openingLoadsOf(weekWith('weighted_pull_up', 20), man).weighted_pull_up).toBe(20);
    expect(openingLoadsOf(weekWith('pull_up', 20), man).pull_up).toBeNull(); // S-51 stands for the bodyweight lift
  });

  it('with no load written it still opens at a real weight — never "bodyweight", never nothing', () => {
    const cold = openingLoadsOf(weekWith('weighted_dip'), man).weighted_dip;
    expect(cold).toBeGreaterThan(0);
  });

  it('a figure typed on the stage is WRITTEN: the added weight is the total, whole', () => {
    expect(totalFromEquipment('weighted_pull_up', 22.5, 'kg')).toBe(22.5);
    expect(totalFromEquipment('pull_up', 22.5, 'kg')).toBeNull(); // which is why that cell is not a door
  });

  it('the load is said as what she ADDS — never per side, never per hand', () => {
    const setup = loadSetup('weighted_chin_up', 20, 'kg');
    expect(setup).toEqual({ style: 'added', headline: 20, added: 20 });
    expect(equipmentLoad(setup)).toEqual({ value: 20, style: 'added', total: null });
    const stage = read('src/screens/session/SessionFlow.tsx');
    expect(stage).toMatch(/eq\.style === 'added'\s*\?\s*t\('load\.added'\)/);
    expect(he.load.added).toBe('משקל נוסף');
    expect(en.load.added).toBe('added weight');
    // The lock screen's line and the coach's sentence: one object, and the headline is it.
    expect(read('src/state/stores/sessionStore.tsx')).toContain("eq.style === 'fixed_barbell' || eq.style === 'kettlebell' || eq.style === 'added'");
    const voice = read('src/domain/voiceScript.ts');
    expect(voice.match(/case 'added':\s*return tg\('voice\.loadAdded'/g)).toHaveLength(2);
    expect(he.voice.loadAdded).toContain('{{total}}');
    expect(en.voice.loadAdded).toContain('{{total}}');
  });
});

describe('the film is the same movement, under its own name', () => {
  it('each is drawn by its twin\'s rig, and answers for the lift it is filed under', () => {
    for (const id of WEIGHTED) {
      const rig = exerciseMotion(id);
      const twin = exerciseMotion(WEIGHTED_FORM_OF[id]);
      expect(rig).toBeTruthy();
      expect(rig.id).toBe(id);
      const { id: _a, ...mine } = rig;
      const { id: _b, ...theirs } = twin;
      expect(mine).toEqual(theirs); // not a copy that can drift: made from the twin at load
    }
  });
});

describe('⛔ hers and the model\'s to choose — never the engine\'s, never a stranger\'s swap', () => {
  it('choice-only: no engine pool assigns one', () => {
    for (const id of WEIGHTED) expect(CHOICE_ONLY_IDS.has(id)).toBe(true);
  });

  it('the model can choose one: it is in the catalogue the week is written from', () => {
    const lines = catalogueLines();
    for (const id of WEIGHTED) expect(lines).toContain(`${id} = `);
    // …and the field that prices it tells the model a bodyweight lift takes no load here.
    expect(read('src/domain/buildPrompt.ts')).toContain('the app cannot add weight to those');
  });

  it('a taken lat pulldown is not answered with a weighted pull-up; a pull-up is', () => {
    const ctx = { sessionExerciseIds: [] };
    expect(swapChoices('lat_pulldown', ctx, 8).map((c) => c.exercise.id)).not.toEqual(expect.arrayContaining(['weighted_pull_up']));
    expect(swapChoices('pull_up', ctx, 8).map((c) => c.exercise.id)).toContain('weighted_pull_up');
    // …and between the weighted bars themselves.
    expect(swapChoices('weighted_pull_up', ctx, 8).map((c) => c.exercise.id)).toContain('weighted_chin_up');
  });

  it('the catalogue grew by exactly these three', () => {
    expect(EXERCISES.filter((e) => e.loadStyle === 'added').map((e) => e.id).sort()).toEqual([...WEIGHTED].sort());
  });
});

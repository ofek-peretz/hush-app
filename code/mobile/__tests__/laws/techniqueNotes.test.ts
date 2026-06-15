/**
 * Technique Notes contract (replaces Exercise Demo, 2026-06-13). Every exercise
 * carries exactly 3 concise, plain-language cues — a reminder before a set, not
 * a lesson. Guards against paragraphs, missing cues, or content creep.
 */
import { EXERCISES } from '@/data/exercises';
import type { Capability } from '@/data/local/models';

const CAPS: Capability[] = ['horizontal_push', 'horizontal_pull', 'vertical_push', 'knee_dominant', 'hip_dominant'];

describe('every exercise has exactly 3 concise cues', () => {
  it('has exactly three cues each', () => {
    for (const e of EXERCISES) {
      expect(e.cues).toHaveLength(3);
    }
  });

  it('keeps cues short — reminders, never coaching paragraphs', () => {
    for (const e of EXERCISES) {
      for (const cue of e.cues) {
        expect(cue.trim().length).toBeGreaterThan(0);
        expect(cue.length).toBeLessThanOrEqual(40); // a phrase, not a paragraph
        // No multi-sentence coaching: at most one terminal period.
        expect((cue.match(/[.!?]/g) ?? []).length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('catalog covers every capability (V1 barbell gym)', () => {
  it('has at least one exercise per capability', () => {
    for (const c of CAPS) {
      expect(EXERCISES.some((e) => e.capability === c)).toBe(true);
    }
  });
});

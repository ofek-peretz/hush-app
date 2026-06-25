/**
 * Exercise Videos (Launch Roadmap item 5) — the media seam. Content is deferred (the player is
 * built; files are supplied later), so these pin the resolver contract + a content-integrity guard
 * that holds now (empty) and keeps holding as real videos are added.
 */
import { EXERCISE_VIDEO, exerciseVideoSource, hasExerciseVideo, type VideoSource } from '@/platform/media/exerciseVideo';
import { exerciseById } from '@/data/exercises';

describe('exercise video resolver', () => {
  it('returns null for an unknown / absent exercise', () => {
    expect(exerciseVideoSource('not_a_real_exercise')).toBeNull();
    expect(exerciseVideoSource(null)).toBeNull();
    expect(exerciseVideoSource(undefined)).toBeNull();
    expect(hasExerciseVideo('not_a_real_exercise')).toBe(false);
  });

  it('reflects the catalog map and stays consistent between the two accessors', () => {
    for (const id of Object.keys(EXERCISE_VIDEO)) {
      expect(hasExerciseVideo(id)).toBe(true);
      expect(exerciseVideoSource(id)).toBe(EXERCISE_VIDEO[id]);
    }
  });

  it('every mapped video keys a real exercise and is a well-formed source (content-integrity)', () => {
    for (const [id, source] of Object.entries(EXERCISE_VIDEO) as [string, VideoSource][]) {
      expect(exerciseById(id)).toBeTruthy(); // no typo'd / stale exercise ids
      if (source.kind === 'remote') expect(source.uri.length).toBeGreaterThan(0);
      else expect(typeof source.module).toBe('number');
    }
  });
});
